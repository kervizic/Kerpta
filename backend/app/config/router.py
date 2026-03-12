# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Router de configuration de la plateforme (providers OAuth).

Routes exposées :
  GET  /api/v1/config/providers         — public, retourne les providers actifs
  GET  /api/v1/config/api-keys          — admin, retourne oauth_config
  PUT  /api/v1/config/oauth             — admin, met à jour les providers OAuth + redémarre GoTrue
"""

import asyncio
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id, require_platform_admin
from app.setup.service import KNOWN_PROVIDERS, restart_auth_service, save_oauth_config

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/config", tags=["config"])


# ── Schémas Pydantic ──────────────────────────────────────────────────────────


class ProviderConfig(BaseModel):
    enabled: bool = False
    client_id: str = ""
    client_secret: str = ""


class OAuthUpdateRequest(BaseModel):
    providers: dict[str, ProviderConfig]
    custom_oidc: dict[str, Any] | None = None


# ── GET /me — utilisateur courant ─────────────────────────────────────────────


@router.get("/me")
async def get_me(
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    """Retourne les informations de l'utilisateur connecté (id, email, is_platform_admin).

    Si l'utilisateur n'est pas encore enregistré en base (ex: première connexion),
    retourne is_platform_admin: false.
    """
    result = await db.execute(
        text("SELECT is_platform_admin, email, full_name FROM users WHERE id = :id"),
        {"id": user_id},
    )
    row = result.fetchone()
    return {
        "id": str(user_id),
        "is_platform_admin": bool(row[0]) if row else False,
        "email": str(row[1]) if row and row[1] else None,
        "name": str(row[2]) if row and row[2] else None,
    }


# ── GET /providers — public ───────────────────────────────────────────────────


@router.get("/providers")
async def get_providers(db: AsyncSession = Depends(get_db)) -> dict:
    """Retourne la liste des providers OAuth actifs et l'URL GoTrue.

    Endpoint public utilisé par la page de connexion pour afficher les boutons.
    """
    result = await db.execute(
        text("SELECT auth_url, oauth_config FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    if not row:
        return {"providers": [], "auth_url": ""}

    auth_url: str = row[0] or ""
    oauth_config: dict = row[1] or {}

    active_providers = [
        p
        for p in KNOWN_PROVIDERS
        if oauth_config.get(p, {}).get("enabled", False)
        and oauth_config[p].get("client_id")
    ]

    return {"providers": active_providers, "auth_url": auth_url}


# ── GET /api-keys — platform_admin ───────────────────────────────────────────


@router.get("/api-keys")
async def get_api_keys(
    db: AsyncSession = Depends(get_db),
    _admin: object = Depends(require_platform_admin),
) -> dict:
    """Retourne la config OAuth (secrets masqués) et les clés API externes."""
    result = await db.execute(
        text(
            "SELECT auth_url, oauth_config, api_keys FROM platform_config LIMIT 1"
        )
    )
    row = result.fetchone()
    if not row:
        return {"auth_url": "", "oauth_config": {}, "api_keys": {}}

    auth_url: str = row[0] or ""
    oauth_config: dict = row[1] or {}
    api_keys: dict = row[2] or {}

    # Masque les secrets OAuth (les expose partiellement pour l'UI)
    masked_oauth: dict = {}
    for provider, cfg in oauth_config.items():
        secret = cfg.get("client_secret", "")
        masked_oauth[provider] = {
            "enabled": cfg.get("enabled", False),
            "client_id": cfg.get("client_id", ""),
            # Masque en conservant les 4 derniers caractères pour vérification
            "client_secret": ("••••" + secret[-4:]) if len(secret) > 4 else ("••••" if secret else ""),
        }

    return {
        "auth_url": auth_url,
        "oauth_config": masked_oauth,
    }


# ── PUT /oauth — platform_admin ───────────────────────────────────────────────


@router.put("/oauth", status_code=status.HTTP_200_OK)
async def update_oauth_config(
    body: OAuthUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: object = Depends(require_platform_admin),
) -> dict:
    """Met à jour la config OAuth des providers et redémarre GoTrue en arrière-plan."""
    # Récupère base_url / auth_url depuis platform_config
    result = await db.execute(
        text("SELECT base_url, auth_url FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    if not row or not row[0] or not row[1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="base_url ou auth_url manquant dans platform_config",
        )

    base_url: str = row[0]
    auth_url: str = row[1]

    providers_dict = {
        name: {
            "enabled": cfg.enabled,
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
        }
        for name, cfg in body.providers.items()
    }

    await save_oauth_config(
        db=db,
        base_url=base_url,
        auth_url=auth_url,
        providers=providers_dict,
        custom_oidc=body.custom_oidc,
    )

    # Redémarre GoTrue en arrière-plan (opération bloquante ~5 s)
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, restart_auth_service)

    _log.info("[config] OAuth mis à jour — GoTrue en cours de redémarrage")
    return {"ok": True, "restarting": True}
