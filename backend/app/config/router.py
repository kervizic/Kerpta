# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Router de configuration de la plateforme (providers OAuth, clés API).

Routes exposées :
  GET  /api/v1/config/providers         — public, retourne les providers actifs
  GET  /api/v1/config/api-keys          — admin, retourne oauth_config + api_keys
  PUT  /api/v1/config/oauth             — admin, met à jour les providers OAuth + redémarre GoTrue
  PUT  /api/v1/config/api-keys          — admin, met à jour les clés API externes (INSEE)
  POST /api/v1/config/api-keys/insee-test — admin, teste la connexion INSEE
"""

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_platform_admin
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


class ApiKeysUpdateRequest(BaseModel):
    insee_consumer_key: str = ""
    insee_consumer_secret: str = ""


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
        "api_keys": {
            "insee_consumer_key": api_keys.get("insee_consumer_key", ""),
            # Secret INSEE : masqué comme OAuth
            "insee_consumer_secret": (
                ("••••" + api_keys.get("insee_consumer_secret", "")[-4:])
                if len(api_keys.get("insee_consumer_secret", "")) > 4
                else ("••••" if api_keys.get("insee_consumer_secret") else "")
            ),
        },
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


# ── PUT /api-keys — platform_admin ───────────────────────────────────────────


@router.put("/api-keys", status_code=status.HTTP_200_OK)
async def update_api_keys(
    body: ApiKeysUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: object = Depends(require_platform_admin),
) -> dict:
    """Met à jour les clés API externes (INSEE / Sirene) dans platform_config."""
    # Récupère les clés existantes pour ne pas écraser ce qui n'est pas fourni
    result = await db.execute(
        text("SELECT api_keys FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    existing: dict = (row[0] or {}) if row else {}

    updates: dict = dict(existing)
    if body.insee_consumer_key:
        updates["insee_consumer_key"] = body.insee_consumer_key
    if body.insee_consumer_secret:
        updates["insee_consumer_secret"] = body.insee_consumer_secret

    await db.execute(
        text("UPDATE platform_config SET api_keys = :keys"),
        {"keys": updates},
    )
    await db.commit()

    _log.info("[config] Clés API mises à jour")
    return {"ok": True}


# ── POST /api-keys/insee-test — platform_admin ───────────────────────────────


@router.post("/api-keys/insee-test", status_code=status.HTTP_200_OK)
async def test_insee_connection(
    db: AsyncSession = Depends(get_db),
    _admin: object = Depends(require_platform_admin),
) -> dict:
    """Teste la connexion à l'API INSEE via OAuth2 client_credentials."""
    result = await db.execute(
        text("SELECT api_keys FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    api_keys: dict = (row[0] or {}) if row else {}

    consumer_key = api_keys.get("insee_consumer_key", "")
    consumer_secret = api_keys.get("insee_consumer_secret", "")

    if not consumer_key or not consumer_secret:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consumer Key ou Consumer Secret manquant — enregistrez d'abord les clés",
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.insee.fr/token",
                data={"grant_type": "client_credentials"},
                auth=(consumer_key, consumer_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if response.status_code == 200:
            data = response.json()
            return {
                "ok": True,
                "expires_in": data.get("expires_in"),
                "token_type": data.get("token_type", "Bearer"),
            }
        else:
            return {
                "ok": False,
                "error": f"INSEE a répondu {response.status_code}",
                "detail": response.text[:200],
            }

    except httpx.ConnectError:
        return {"ok": False, "error": "Impossible de joindre api.insee.fr"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Délai d'attente dépassé (10 s)"}
    except Exception as exc:  # noqa: BLE001
        _log.exception("[config] Erreur test INSEE : %s", exc)
        return {"ok": False, "error": str(exc)}
