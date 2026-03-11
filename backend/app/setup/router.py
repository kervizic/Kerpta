# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Router FastAPI du wizard d'initialisation.

Routes :
  GET  /setup/               → redirect vers l'étape courante
  GET  /setup/dbb            → formulaire BDD
  POST /setup/dbb            → valider + enregistrer BDD
  GET  /setup/oauth          → formulaire OAuth
  POST /setup/oauth          → enregistrer config OAuth
  GET  /setup/admin          → page création admin (boutons OAuth)
  POST /setup/api/finalize   → endpoint JSON : crée l'admin après callback OAuth
  GET  /setup/api/status     → JSON : statut setup (utilisé par middleware)
  POST /setup/api/test-db    → JSON : teste une connexion DB
"""

from __future__ import annotations

import os
import secrets
import threading
import uuid
from typing import Any

import jwt
from fastapi import APIRouter, Depends, Form, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.setup import service

router = APIRouter(prefix="/setup", tags=["setup"])

# Les templates sont résolus depuis /backend/templates/
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


def _get_platform_base_url() -> str:
    from app.core.config import settings
    return os.getenv("APP_BASE_URL", "http://localhost:8000")


def _get_auth_base_url() -> str:
    from app.core.config import settings
    return os.getenv("AUTH_BASE_URL", os.getenv("SUPABASE_URL", ""))


# ── Redirect racine ───────────────────────────────────────────────────────────


@router.get("/", response_class=RedirectResponse)
async def setup_index(db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    """Redirige vers la bonne étape selon l'état du setup."""
    status_data = await service.get_setup_status(db)
    if not status_data["db_reachable"]:
        return RedirectResponse(url="/setup/dbb", status_code=302)
    if status_data["setup_completed"] and status_data["has_admin"]:
        return RedirectResponse(url="/", status_code=302)
    _step_paths = {1: "dbb", 2: "oauth", 3: "admin"}
    step = status_data["setup_step"]
    return RedirectResponse(url=f"/setup/{_step_paths.get(step, 'dbb')}", status_code=302)


# ── Étape 1 — Base de données ─────────────────────────────────────────────────


@router.get("/dbb", response_class=HTMLResponse)
async def step1_get(request: Request) -> HTMLResponse:
    prefill = _env_prefill()
    return templates.TemplateResponse(
        "setup/dbb.html",
        {
            "request": request,
            "prefill": prefill,
            "error": None,
        },
    )


@router.post("/dbb", response_class=HTMLResponse)
async def step1_post(
    request: Request,
    db_host: str = Form(...),
    db_port: int = Form(5432),
    db_name: str = Form(...),
    db_user: str = Form(...),
    db_password: str = Form(""),
    db: AsyncSession = Depends(get_db),
) -> Any:
    # Test de connexion
    test = await service.test_database_connection(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password,
    )
    if not test["ok"]:
        prefill = _env_prefill()
        prefill.update(
            {"db_host": db_host, "db_port": str(db_port), "db_name": db_name, "db_user": db_user}
        )
        return templates.TemplateResponse(
            "setup/dbb.html",
            {"request": request, "prefill": prefill, "error": test["error"]},
            status_code=422,
        )

    # Génère un SECRET_KEY si pas encore défini
    secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)

    try:
        await service.save_database_config(
            host=db_host,
            port=db_port,
            database=db_name,
            user=db_user,
            password=db_password,
            secret_key=secret_key,
        )
    except Exception as exc:  # noqa: BLE001
        prefill = _env_prefill()
        prefill.update(
            {"db_host": db_host, "db_port": str(db_port), "db_name": db_name, "db_user": db_user}
        )
        return templates.TemplateResponse(
            "setup/dbb.html",
            {"request": request, "prefill": prefill, "error": str(exc)},
            status_code=500,
        )

    return RedirectResponse(url="/setup/oauth", status_code=303)


# ── Étape 2 — OAuth ───────────────────────────────────────────────────────────


_PROVIDER_LABELS = {
    "google": "Google",
    "microsoft": "Microsoft",
    "apple": "Apple",
    "github": "GitHub",
    "linkedin": "LinkedIn",
    "facebook": "Facebook",
    "twitter": "X (Twitter)",
    "discord": "Discord",
    "salesforce": "Salesforce",
}


@router.get("/oauth", response_class=HTMLResponse)
async def step2_get(request: Request) -> HTMLResponse:
    prefill = _env_prefill()
    return templates.TemplateResponse(
        "setup/oauth.html",
        {
            "request": request,
            "providers": _PROVIDER_LABELS,
            "prefill": prefill,
            "error": None,
        },
    )


@router.post("/oauth", response_class=HTMLResponse)
async def step2_post(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Any:
    form = await request.form()
    base_url: str = str(form.get("base_url", "")).strip()
    auth_url: str = str(form.get("auth_url", "")).strip()

    if not base_url or not auth_url:
        prefill = _env_prefill()
        return templates.TemplateResponse(
            "setup/oauth.html",
            {
                "request": request,
                "providers": _PROVIDER_LABELS,
                "prefill": prefill,
                "error": "Les URLs de l'application et de l'authentification sont obligatoires.",
            },
            status_code=422,
        )

    # Collecte config par provider
    providers: dict[str, dict[str, Any]] = {}
    for provider in service.KNOWN_PROVIDERS:
        enabled = form.get(f"{provider}_enabled") == "on"
        client_id = str(form.get(f"{provider}_client_id", "")).strip()
        client_secret = str(form.get(f"{provider}_client_secret", "")).strip()
        providers[provider] = {
            "enabled": enabled,
            "client_id": client_id,
            "client_secret": client_secret,
        }

    # OIDC personnalisé
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
            db=db,
            base_url=base_url,
            auth_url=auth_url,
            providers=providers,
            custom_oidc=custom_oidc,
        )
    except RuntimeError as exc:
        # platform_config absent → étape 1 non complétée
        return RedirectResponse(url="/setup/dbb", status_code=303)

    # Redémarre GoTrue en arrière-plan pour qu'il recharge la config OAuth
    # (GOTRUE_EXTERNAL_* écrites dans .env par save_oauth_config)
    threading.Thread(target=service.restart_auth_service, daemon=True).start()

    return RedirectResponse(url="/setup/admin", status_code=303)


# ── Étape 3 — Administrateur principal ────────────────────────────────────────


@router.get("/admin", response_class=HTMLResponse)
async def step3_get(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    from sqlalchemy import text

    # Récupère la config OAuth et les URLs depuis platform_config
    result = await db.execute(
        text("SELECT oauth_config, base_url, auth_url FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    oauth_config: dict = {}
    base_url = _get_platform_base_url()
    auth_url = _get_auth_base_url()

    if row:
        oauth_config = row[0] or {}
        base_url = row[1] or base_url
        auth_url = row[2] or auth_url

    # Construit la liste des providers activés
    enabled_providers: list[dict[str, str]] = []
    for provider, label in _PROVIDER_LABELS.items():
        cfg = oauth_config.get(provider, {})
        if cfg.get("enabled"):
            enabled_providers.append({"key": provider, "label": label})
    if oauth_config.get("custom_oidc", {}).get("enabled"):
        enabled_providers.append({"key": "oidc", "label": "Fournisseur personnalisé"})

    # URL de callback après auth OAuth
    callback_url = f"{base_url}/setup/admin"

    return templates.TemplateResponse(
        "setup/admin.html",
        {
            "request": request,
            "enabled_providers": enabled_providers,
            "auth_url": auth_url.rstrip("/"),
            "callback_url": callback_url,
            "error": None,
        },
    )


# ── API JSON ───────────────────────────────────────────────────────────────────


@router.get("/api/status")
async def api_status(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Statut du setup — utilisé par le middleware de redirection."""
    data = await service.get_setup_status(db)
    return JSONResponse(data)


@router.get("/api/auth-health")
async def api_auth_health(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Vérifie que GoTrue est opérationnel — utilisé par l'étape 3 (polling JS).

    L'admin page appelle cet endpoint toutes les 2 s après l'étape 2 jusqu'à
    ce que GoTrue soit prêt (il redémarre pour recharger la config OAuth).
    """
    try:
        result = await db.execute(
            text("SELECT auth_url FROM platform_config LIMIT 1")
        )
        row = result.fetchone()
    except Exception:  # noqa: BLE001
        return JSONResponse({"ok": False, "reason": "BDD non configurée"})

    if not row or not row[0]:
        return JSONResponse({"ok": False, "reason": "auth_url non configuré"})

    health = await service.check_auth_service_health(row[0])
    return JSONResponse(health)


@router.post("/api/test-db")
async def api_test_db(request: Request) -> JSONResponse:
    """Teste une connexion PostgreSQL — appelé en AJAX depuis step1."""
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
    """Finalise le setup : crée l'admin depuis le token JWT Supabase.

    Le frontend envoie le token récupéré dans le hash de l'URL après
    le callback OAuth Supabase Auth :
      POST /setup/api/finalize
      Authorization: Bearer <supabase_access_token>

    On décode le JWT (sans vérification de signature côté setup car
    SUPABASE_JWT_SECRET peut ne pas être encore défini) pour extraire
    sub (user_id), email et user_metadata.full_name.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"ok": False, "error": "Token manquant"}, status_code=401)

    token = auth_header[7:]

    try:
        # Décodage sans vérification de signature (setup uniquement — la DB
        # n'est pas encore sécurisée par JWT Supabase à ce stade)
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
        db=db,
        supabase_user_id=user_id,
        email=email,
        full_name=full_name,
        avatar_url=avatar_url,
    )

    return JSONResponse({"ok": True, "redirect": "/"})
