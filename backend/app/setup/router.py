# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Router FastAPI du wizard d'initialisation.

Routes :
  GET  /setup/               → page de configuration (3 onglets)
  GET  /setup/dbb            → redirige vers /setup/?tab=bdd
  GET  /setup/oauth          → redirige vers /setup/?tab=oauth
  GET  /setup/admin          → redirige vers /setup/?tab=admin
  POST /setup/dbb            → valider + enregistrer BDD
  POST /setup/oauth          → enregistrer config OAuth
  GET  /setup/api/status     → JSON : statut setup (utilisé par middleware)
  GET  /setup/api/auth-health → JSON : vérifie que GoTrue est up
  POST /setup/api/test-db    → JSON : teste une connexion DB
  POST /setup/api/finalize   → JSON : crée l'admin après callback OAuth
"""

from __future__ import annotations

import json
import os
import secrets
from typing import Any

import jwt
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.setup import service

router = APIRouter(prefix="/setup", tags=["setup"])

_templates_dir = str(
    __import__("pathlib").Path(__file__).resolve().parents[2] / "templates"
)
templates = Jinja2Templates(directory=_templates_dir)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _env_prefill() -> dict[str, str]:
    """Retourne les valeurs pré-remplies depuis les variables d'environnement Docker."""
    return {
        "db_host": os.getenv("POSTGRES_HOST", os.getenv("DB_HOST", "localhost")),
        "db_port": os.getenv("POSTGRES_PORT", os.getenv("DB_PORT", "5432")),
        "db_name": os.getenv("POSTGRES_DB", os.getenv("DB_NAME", "kerpta")),
        "db_user": os.getenv("POSTGRES_USER", os.getenv("DB_USER", "kerpta")),
        "db_password": os.getenv("POSTGRES_PASSWORD", os.getenv("DB_PASSWORD", "")),
        "app_base_url": os.getenv("APP_BASE_URL", "http://localhost:8000"),
        "auth_base_url": os.getenv("AUTH_BASE_URL", os.getenv("SUPABASE_URL", "")),
    }


_PROVIDER_LABELS = {
    "google":     "Google",
    "microsoft":  "Microsoft",
    "apple":      "Apple",
    "github":     "GitHub",
    "linkedin":   "LinkedIn",
    "facebook":   "Facebook",
    "twitter":    "X (Twitter)",
    "discord":    "Discord",
    "salesforce": "Salesforce",
}

# Correspondance provider → préfixe GOTRUE_EXTERNAL_* dans le .env
_PROVIDER_ENV_KEYS = {
    "google":     "GOOGLE",
    "microsoft":  "MICROSOFT",
    "apple":      "APPLE",
    "github":     "GITHUB",
    "linkedin":   "LINKEDIN",
    "facebook":   "FACEBOOK",
    "twitter":    "TWITTER",
    "discord":    "DISCORD",
    "salesforce": "SALESFORCE",
}


def _oauth_from_env() -> dict:
    """Lit la config OAuth depuis les vars GOTRUE_EXTERNAL_* du .env comme fallback."""
    result: dict = {}
    for provider, env_key in _PROVIDER_ENV_KEYS.items():
        client_id = os.getenv(f"GOTRUE_EXTERNAL_{env_key}_CLIENT_ID", "").strip()
        secret = os.getenv(f"GOTRUE_EXTERNAL_{env_key}_SECRET", "").strip()
        enabled = os.getenv(f"GOTRUE_EXTERNAL_{env_key}_ENABLED", "false").strip().lower() == "true"
        if client_id or secret:
            result[provider] = {
                "enabled": enabled,
                "client_id": client_id,
                "client_secret": secret,
            }
    return result


async def _build_context(
    request: Request,
    db: AsyncSession,
    tab: str,
    bdd_error: str | None = None,
    oauth_error: str | None = None,
    prefill_override: dict | None = None,
) -> dict[str, Any]:
    """Construit le contexte complet pour la page setup (tous onglets)."""
    status_data = await service.get_setup_status(db)

    saved_oauth: dict = {}
    base_url = os.getenv("APP_BASE_URL", "http://localhost:8000")
    auth_url = os.getenv("AUTH_BASE_URL", os.getenv("SUPABASE_URL", ""))

    if status_data["db_reachable"] and status_data["setup_step"] >= 2:
        try:
            result = await db.execute(
                text("SELECT oauth_config, base_url, auth_url FROM platform_config LIMIT 1")
            )
            row = result.fetchone()
            if row:
                saved_oauth = row[0] or {}
                base_url = row[1] or base_url
                auth_url = row[2] or auth_url
        except Exception:  # noqa: BLE001
            pass

    # Fallback : pré-remplir depuis GOTRUE_EXTERNAL_* pour les providers absents de la BDD
    for provider, cfg in _oauth_from_env().items():
        if provider not in saved_oauth or not saved_oauth[provider].get("client_id"):
            saved_oauth[provider] = cfg

    prefill = _env_prefill()
    prefill["app_base_url"] = base_url
    prefill["auth_base_url"] = auth_url
    if prefill_override:
        prefill.update(prefill_override)

    enabled_providers: list[dict] = []
    for provider, label in _PROVIDER_LABELS.items():
        if saved_oauth.get(provider, {}).get("enabled"):
            enabled_providers.append({"key": provider, "label": label})
    if saved_oauth.get("custom_oidc", {}).get("enabled"):
        enabled_providers.append({"key": "oidc", "label": "Fournisseur personnalisé"})

    callback_url = f"{base_url.rstrip('/')}/setup/"

    return {
        "request": request,
        "tab": tab,
        "setup_step": status_data["setup_step"],
        "db_reachable": status_data["db_reachable"],
        "prefill": prefill,
        "providers": _PROVIDER_LABELS,
        "saved_oauth_json": json.dumps(saved_oauth),
        "enabled_providers": enabled_providers,
        "auth_url": auth_url.rstrip("/"),
        "callback_url": callback_url,
        "bdd_error": bdd_error,
        "oauth_error": oauth_error,
    }


# ── Page principale (3 onglets) ───────────────────────────────────────────────


@router.get("/", response_class=HTMLResponse)
async def setup_main(
    request: Request,
    tab: str = "",
    db: AsyncSession = Depends(get_db),
) -> Any:
    status_data = await service.get_setup_status(db)

    if status_data["setup_completed"] and status_data["has_admin"]:
        return RedirectResponse(url="/", status_code=302)

    if not tab:
        step = status_data["setup_step"]
        tab = {1: "bdd", 2: "oauth", 3: "admin"}.get(step, "bdd")

    ctx = await _build_context(request, db, tab=tab)
    return templates.TemplateResponse("setup/index.html", ctx)


# ── Compatibilité — anciennes URLs ────────────────────────────────────────────


@router.get("/dbb", response_class=RedirectResponse)
async def step1_compat() -> RedirectResponse:
    return RedirectResponse(url="/setup/", status_code=302)


@router.get("/oauth", response_class=RedirectResponse)
async def step2_compat() -> RedirectResponse:
    return RedirectResponse(url="/setup/", status_code=302)


@router.get("/admin", response_class=RedirectResponse)
async def step3_compat() -> RedirectResponse:
    return RedirectResponse(url="/setup/", status_code=302)


# ── Étape 1 — Base de données ─────────────────────────────────────────────────


@router.post("/dbb")
async def step1_post(
    request: Request,
    db_host: str = Form(...),
    db_port: int = Form(5432),
    db_name: str = Form(...),
    db_user: str = Form(...),
    db_password: str = Form(""),
    db: AsyncSession = Depends(get_db),
) -> Any:
    test = await service.test_database_connection(
        host=db_host, port=db_port, database=db_name, user=db_user, password=db_password,
    )
    if not test["ok"]:
        ctx = await _build_context(
            request, db, tab="bdd", bdd_error=test["error"],
            prefill_override={
                "db_host": db_host, "db_port": str(db_port),
                "db_name": db_name, "db_user": db_user,
            },
        )
        return templates.TemplateResponse("setup/index.html", ctx, status_code=422)

    secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    try:
        await service.save_database_config(
            host=db_host, port=db_port, database=db_name,
            user=db_user, password=db_password, secret_key=secret_key,
        )
    except Exception as exc:  # noqa: BLE001
        ctx = await _build_context(
            request, db, tab="bdd", bdd_error=str(exc),
            prefill_override={
                "db_host": db_host, "db_port": str(db_port),
                "db_name": db_name, "db_user": db_user,
            },
        )
        return templates.TemplateResponse("setup/index.html", ctx, status_code=500)

    return RedirectResponse(url="/setup/", status_code=303)


# ── Étape 2 — OAuth ───────────────────────────────────────────────────────────


@router.post("/oauth")
async def step2_post(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Any:
    form = await request.form()
    base_url: str = str(form.get("base_url", "")).strip()
    auth_url: str = str(form.get("auth_url", "")).strip()

    if not base_url or not auth_url:
        ctx = await _build_context(
            request, db, tab="oauth",
            oauth_error="Les URLs de l'application et de l'authentification sont obligatoires.",
        )
        return templates.TemplateResponse("setup/index.html", ctx, status_code=422)

    providers: dict[str, dict[str, Any]] = {}
    for provider in service.KNOWN_PROVIDERS:
        enabled = form.get(f"{provider}_enabled") == "on"
        client_id = str(form.get(f"{provider}_client_id", "")).strip()
        client_secret = str(form.get(f"{provider}_client_secret", "")).strip()
        providers[provider] = {
            "enabled": enabled, "client_id": client_id, "client_secret": client_secret,
        }

    custom_oidc: dict[str, Any] | None = None
    if form.get("custom_oidc_enabled") == "on":
        custom_oidc = {
            "enabled": True,
            "client_id": str(form.get("custom_oidc_client_id", "")).strip(),
            "client_secret": str(form.get("custom_oidc_client_secret", "")).strip(),
            "issuer_url": str(form.get("custom_oidc_issuer_url", "")).strip(),
        }

    try:
        await service.save_oauth_config(
            db=db, base_url=base_url, auth_url=auth_url,
            providers=providers, custom_oidc=custom_oidc,
        )
    except RuntimeError:
        return RedirectResponse(url="/setup/", status_code=303)

    import threading
    threading.Thread(target=service.restart_auth_service, daemon=True).start()
    return RedirectResponse(url="/setup/", status_code=303)


# ── API JSON ───────────────────────────────────────────────────────────────────


@router.get("/api/status")
async def api_status(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Statut du setup — utilisé par le middleware de redirection."""
    data = await service.get_setup_status(db)
    return JSONResponse(data)


@router.get("/api/auth-health")
async def api_auth_health(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Vérifie que GoTrue est opérationnel — utilisé par l'onglet admin (polling JS)."""
    try:
        result = await db.execute(text("SELECT auth_url FROM platform_config LIMIT 1"))
        row = result.fetchone()
    except Exception:  # noqa: BLE001
        return JSONResponse({"ok": False, "reason": "BDD non configurée"})

    if not row or not row[0]:
        return JSONResponse({"ok": False, "reason": "auth_url non configuré"})

    health = await service.check_auth_service_health(row[0])
    return JSONResponse(health)


@router.post("/api/test-db")
async def api_test_db(request: Request) -> JSONResponse:
    """Teste une connexion PostgreSQL — appelé en AJAX depuis l'onglet BDD."""
    body = await request.json()
    result = await service.test_database_connection(
        host=body.get("host", "localhost"),
        port=int(body.get("port", 5432)),
        database=body.get("database", "kerpta"),
        user=body.get("user", "kerpta"),
        password=body.get("password", ""),
    )
    return JSONResponse(result)


@router.post("/api/finalize")
async def api_finalize(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Finalise le setup : crée l'admin depuis le token JWT Supabase."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"ok": False, "error": "Token manquant"}, status_code=401)

    token = auth_header[7:]
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"ok": False, "error": f"Token invalide : {exc}"}, status_code=401)

    user_id: str | None = payload.get("sub")
    email: str | None = payload.get("email")
    if not user_id or not email:
        return JSONResponse(
            {"ok": False, "error": "Token incomplet (sub/email manquants)"},
            status_code=401,
        )

    user_meta: dict = payload.get("user_metadata", {})
    full_name: str | None = user_meta.get("full_name") or user_meta.get("name")
    avatar_url: str | None = user_meta.get("avatar_url") or user_meta.get("picture")

    await service.finalize_setup(
        db=db, supabase_user_id=user_id, email=email,
        full_name=full_name, avatar_url=avatar_url,
    )

    return JSONResponse({"ok": True, "redirect": "/"})
