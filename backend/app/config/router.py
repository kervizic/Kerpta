# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Router de configuration de la plateforme (providers OAuth + clés API externes).

Routes exposées :
  GET  /api/v1/config/providers         — public, retourne les providers actifs
  GET  /api/v1/config/api-keys          — admin, retourne oauth_config + api_keys externes
  PUT  /api/v1/config/oauth             — admin, met à jour les providers OAuth + redémarre GoTrue
  PUT  /api/v1/config/external-keys     — admin, met à jour les clés API externes (INPI, etc.)
"""

import asyncio
import json
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


class InpiConfig(BaseModel):
    username: str = ""
    password: str = ""


class ExternalKeysUpdateRequest(BaseModel):
    inpi: InpiConfig | None = None


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

    # Masque les mots de passe des API externes
    masked_api_keys: dict = {}
    if api_keys:
        for service, cfg in api_keys.items():
            if isinstance(cfg, dict):
                masked_cfg = {}
                for k, v in cfg.items():
                    if k in ("password", "secret", "api_key") and isinstance(v, str) and v:
                        masked_cfg[k] = ("••••" + v[-4:]) if len(v) > 4 else "••••"
                    else:
                        masked_cfg[k] = v
                masked_api_keys[service] = masked_cfg

    return {
        "auth_url": auth_url,
        "oauth_config": masked_oauth,
        "api_keys": masked_api_keys,
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


# ── PUT /external-keys — platform_admin ──────────────────────────────────────


@router.put("/external-keys", status_code=status.HTTP_200_OK)
async def update_external_keys(
    body: ExternalKeysUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: object = Depends(require_platform_admin),
) -> dict:
    """Met à jour les clés API externes (INPI, etc.) dans platform_config.api_keys."""
    # Récupérer les api_keys existantes
    result = await db.execute(
        text("SELECT api_keys FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    existing: dict = (row[0] if row and row[0] else {}) or {}

    # Fusionner les nouvelles valeurs
    if body.inpi is not None:
        existing["inpi"] = {
            "username": body.inpi.username,
            "password": body.inpi.password,
        }

    # UPSERT dans platform_config
    updated = await db.execute(
        text("""
            UPDATE platform_config
            SET api_keys = CAST(:keys AS jsonb)
            RETURNING 1
        """),
        {"keys": json.dumps(existing)},
    )
    if updated.rowcount == 0:
        # Pas de ligne platform_config — INSERT
        await db.execute(
            text("""
                INSERT INTO platform_config (api_keys) VALUES (CAST(:keys AS jsonb))
            """),
            {"keys": json.dumps(existing)},
        )
    await db.commit()

    _log.info("[config] Clés API externes mises à jour (services: %s)", list(existing.keys()))
    return {"ok": True}
