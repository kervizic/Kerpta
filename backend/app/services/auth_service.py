# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service d'authentification OAuth — gestion du callback Supabase Auth.

Stratégie de résilience GoTrue reset
-------------------------------------
Supabase Auth (GoTrue) génère un UUID interne pour chaque session OAuth.
En cas de reset de la base GoTrue, cet UUID change alors que l'identifiant
côté provider (Google sub, Azure oid, Apple sub) reste stable.

Ordre de résolution lors du callback :
  1. Chercher l'utilisateur par UUID GoTrue (cas nominal)
  2. Si non trouvé → chercher par provider_sub (cas reset GoTrue)
       → Si trouvé : mettre à jour l'id avec le nouvel UUID GoTrue
  3. Si toujours non trouvé → créer l'utilisateur (nouveau compte)
       → Rediriger vers l'onboarding (aucune organization_membership)
  4. Rétrocompatibilité → si provider_sub est null, le renseigner
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


# ── Types ──────────────────────────────────────────────────────────────────────


LoginOutcome = Literal["existing", "gotrue_reset", "new_user"]
"""
- existing    : utilisateur retrouvé par UUID GoTrue (chemin nominal)
- gotrue_reset: utilisateur retrouvé par provider_sub après un reset GoTrue
- new_user    : premier login → aucun compte existant → INSERT
"""


# ── Helpers provider_sub ──────────────────────────────────────────────────────


def build_provider_sub(provider: str, raw_sub: str) -> str:
    """Construit la valeur provider_sub normalisée.

    Args:
        provider: "google" | "azure" | "apple" | autre
        raw_sub:  identifiant brut côté provider (Google sub, Azure oid, etc.)

    Returns:
        Chaîne de type "google:112233445566778899"
    """
    return f"{provider.lower()}:{raw_sub}"


def extract_provider_sub(jwt_payload: dict) -> str | None:
    """Extrait le provider_sub normalisé depuis le payload JWT GoTrue.

    GoTrue enrichit le JWT avec `user_metadata` qui contient :
      - `provider_id` : identifiant brut côté provider
      - `iss` ou `app_metadata.provider` : nom du provider

    Format attendu :
      - Google  → claims["app_metadata"]["provider"] == "google"
                  claims["user_metadata"]["provider_id"] == "112233..."
      - Azure   → provider == "azure"
                  claims["user_metadata"]["provider_id"] == "xxxxxxxx-..."
      - Apple   → provider == "apple"
                  claims["user_metadata"]["provider_id"] == "000000.abcdef..."

    Returns:
        "google:112233..." ou None si les champs sont absents.
    """
    app_meta: dict = jwt_payload.get("app_metadata", {})
    user_meta: dict = jwt_payload.get("user_metadata", {})

    provider: str | None = (
        app_meta.get("provider")
        or user_meta.get("provider")
    )
    raw_sub: str | None = (
        user_meta.get("provider_id")
        or user_meta.get("sub")
    )

    if not provider or not raw_sub:
        return None

    return build_provider_sub(provider, raw_sub)


# ── Service principal ─────────────────────────────────────────────────────────


class AuthService:
    """Logique métier liée au callback OAuth et à la gestion des sessions."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def handle_oauth_callback(
        self,
        *,
        gotrue_user_id: str,
        email: str,
        full_name: str | None = None,
        avatar_url: str | None = None,
        provider_sub: str | None = None,
    ) -> tuple[User, LoginOutcome]:
        """Crée ou retrouve l'utilisateur après un callback OAuth Supabase Auth.

        Args:
            gotrue_user_id: UUID fourni par GoTrue (champ `sub` du JWT).
            email:          Adresse e-mail de l'utilisateur.
            full_name:      Nom complet (optionnel, depuis user_metadata).
            avatar_url:     URL de l'avatar (optionnel, depuis user_metadata).
            provider_sub:   Identifiant stable provider (format "google:xxx").

        Returns:
            Tuple (user, outcome) :
              - user    : instance SQLAlchemy de l'utilisateur
              - outcome : "existing" | "gotrue_reset" | "new_user"
        """
        user_uuid = uuid.UUID(gotrue_user_id)

        # ── Étape 1 : Recherche par UUID GoTrue (chemin nominal) ─────────────
        user = await self._find_by_id(user_uuid)
        if user is not None:
            await self._update_login_metadata(user, full_name, avatar_url, provider_sub)
            return user, "existing"

        # ── Étape 2 : Recherche par provider_sub (reset GoTrue) ──────────────
        if provider_sub:
            user = await self._find_by_provider_sub(provider_sub)
            if user is not None:
                # Mise à jour de l'UUID GoTrue — l'utilisateur retrouve ses données
                await self._update_gotrue_id(user, user_uuid, full_name, avatar_url)
                return user, "gotrue_reset"

        # ── Étape 3 : Nouvel utilisateur ─────────────────────────────────────
        user = await self._create_user(
            user_id=user_uuid,
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            provider_sub=provider_sub,
        )
        return user, "new_user"

    # ── Requêtes privées ──────────────────────────────────────────────────────

    async def _find_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def _find_by_provider_sub(self, provider_sub: str) -> User | None:
        result = await self.db.execute(
            select(User).where(User.provider_sub == provider_sub)
        )
        return result.scalar_one_or_none()

    async def _update_gotrue_id(
        self,
        user: User,
        new_id: uuid.UUID,
        full_name: str | None,
        avatar_url: str | None,
    ) -> None:
        """Met à jour l'UUID GoTrue de l'utilisateur après un reset.

        Note : met à jour en mémoire ET en base via UPDATE direct pour éviter
        les problèmes de PK déjà indexée.
        """
        now = datetime.now(timezone.utc)
        await self.db.execute(
            update(User)
            .where(User.provider_sub == user.provider_sub)
            .values(
                id=new_id,
                full_name=full_name or user.full_name,
                avatar_url=avatar_url or user.avatar_url,
                last_login_at=now,
            )
        )
        # Synchronise l'objet en mémoire
        user.id = new_id
        user.last_login_at = now
        if full_name:
            user.full_name = full_name
        if avatar_url:
            user.avatar_url = avatar_url
        await self.db.commit()

    async def _update_login_metadata(
        self,
        user: User,
        full_name: str | None,
        avatar_url: str | None,
        provider_sub: str | None,
    ) -> None:
        """Met à jour last_login_at et renseigne provider_sub si absent (rétrocompat.)."""
        now = datetime.now(timezone.utc)
        updates: dict = {"last_login_at": now}

        # Rétrocompatibilité : renseigne provider_sub si c'était null
        if user.provider_sub is None and provider_sub:
            updates["provider_sub"] = provider_sub
        if full_name and not user.full_name:
            updates["full_name"] = full_name
        if avatar_url and not user.avatar_url:
            updates["avatar_url"] = avatar_url

        await self.db.execute(
            update(User).where(User.id == user.id).values(**updates)
        )
        user.last_login_at = now
        if "provider_sub" in updates:
            user.provider_sub = provider_sub
        await self.db.commit()

    async def _create_user(
        self,
        *,
        user_id: uuid.UUID,
        email: str,
        full_name: str | None,
        avatar_url: str | None,
        provider_sub: str | None,
    ) -> User:
        """Insère un nouvel utilisateur en base."""
        now = datetime.now(timezone.utc)
        user = User(
            id=user_id,
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            provider_sub=provider_sub,
            last_login_at=now,
            is_platform_admin=False,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def has_organization(self, user_id: uuid.UUID) -> bool:
        """Vérifie si l'utilisateur appartient à au moins une organisation.

        Utilisé pour décider s'il faut rediriger vers l'onboarding.
        """
        from sqlalchemy import func
        from app.models.user import OrganizationMembership

        result = await self.db.execute(
            select(func.count())
            .select_from(OrganizationMembership)
            .where(OrganizationMembership.user_id == user_id)
        )
        count = result.scalar_one()
        return count > 0
