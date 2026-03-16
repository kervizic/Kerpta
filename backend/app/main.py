# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Point d'entrée principal de l'API Kerpta.

Au démarrage, un middleware vérifie si le setup d'installation est terminé.
Si ce n'est pas le cas, toutes les requêtes (sauf /setup/*, /health et
/api/v1/platform/*) sont redirigées vers /setup/ pour compléter la config.

Variable d'environnement :
  KERPTA_DEV_RESET_CONTENT=true  →  supprime et re-seed platform_content
                                     à chaque démarrage (dev uniquement).
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes.billing import router as billing_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.clients import router as clients_router
from app.api.routes.contracts import router as contracts_router
from app.api.routes.invoices import router as invoices_router
from app.api.routes.quotes import router as quotes_router
from app.api.routes.situations import router as situations_router
from app.api.routes.storage import router as storage_router
from app.companies.router import router as companies_router
from app.config.router import router as config_router
from app.core.config import settings
from app.invitations.router import router as invitations_router
from app.organizations.router import router as organizations_router
from app.platform.router import router as platform_router
from app.setup.router import router as setup_router

_log = logging.getLogger(__name__)

# ── Répertoire des templates Jinja2 ──────────────────────────────────────────
_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"


# ── Middleware de redirection vers le wizard ──────────────────────────────────


class SetupRedirectMiddleware(BaseHTTPMiddleware):
    """Redirige vers /setup/ si l'installation n'est pas terminée.

    Les chemins suivants sont toujours autorisés (whitelist) :
    - /setup/*          — le wizard lui-même
    - /health           — healthcheck Docker / CI
    - /api/v1/platform  — API publique de la page vitrine (accessible avant setup)
    - /api/docs, /api/redoc, /openapi.json — swagger (dev uniquement)
    - /static/*         — assets statiques
    """

    WHITELIST_PREFIXES = (
        "/setup",
        "/health",
        "/static",
        "/api/v1/platform",
        "/api/v1/config/providers",  # endpoint public (page login)
        "/api/v1/invitations",       # acceptation invitation sans setup complet
        "/api/docs",
        "/api/redoc",
        "/openapi.json",
    )

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if any(path.startswith(prefix) for prefix in self.WHITELIST_PREFIXES):
            return await call_next(request)

        try:
            from sqlalchemy import text
            from app.core.database import AsyncSessionLocal

            if not settings.DATABASE_URL:
                return RedirectResponse(url="/setup/dbb", status_code=302)

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    text("SELECT setup_completed FROM platform_config LIMIT 1")
                )
                row = result.fetchone()
                if row is None or not row[0]:
                    return RedirectResponse(url="/setup/", status_code=302)

        except Exception:
            return RedirectResponse(url="/setup/dbb", status_code=302)

        return await call_next(request)


# ── Application FastAPI ───────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie.

    Au démarrage :
    1. Lance alembic upgrade head pour appliquer les nouvelles migrations.
    2. Si KERPTA_DEV_RESET_CONTENT=true, supprime et re-seed platform_content.
    """
    import subprocess

    db_url = settings.DATABASE_URL

    # ── 1. Migrations Alembic ─────────────────────────────────────────────────
    if db_url:
        try:
            result = subprocess.run(
                ["alembic", "upgrade", "head"],
                cwd="/app",
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode == 0:
                _log.info("[startup] Migrations Alembic appliquées avec succès")
            else:
                _log.warning("[startup] Alembic a retourné une erreur : %s", result.stderr)
        except FileNotFoundError:
            _log.warning("[startup] Commande alembic introuvable — migrations ignorées")
        except Exception as exc:  # noqa: BLE001
            _log.warning("[startup] Impossible de lancer alembic : %s", exc)

    # ── 2. Reset contenu vitrine (dev uniquement) ─────────────────────────────
    if os.getenv("KERPTA_DEV_RESET_CONTENT", "").lower() == "true":
        if db_url:
            try:
                from app.platform.service import reset_and_seed_content
                await reset_and_seed_content(db_url)
                _log.warning(
                    "[DEV] platform_content réinitialisé (KERPTA_DEV_RESET_CONTENT=true)"
                )
            except Exception as exc:  # noqa: BLE001
                _log.error("[DEV] Échec reset contenu : %s", exc)
        else:
            _log.warning("[DEV] KERPTA_DEV_RESET_CONTENT ignoré : DATABASE_URL non configuré")

    yield


app = FastAPI(
    title="Kerpta API",
    version="0.1.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ── Middlewares ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SetupRedirectMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(setup_router)
app.include_router(platform_router)
app.include_router(config_router)
app.include_router(companies_router)
app.include_router(organizations_router)
app.include_router(invitations_router)

# ── Routes métier (Module Vente) ─────────────────────────────────────────────
app.include_router(billing_router)
app.include_router(clients_router)
app.include_router(catalog_router)
app.include_router(quotes_router)
app.include_router(contracts_router)
app.include_router(situations_router)
app.include_router(invoices_router)

# ── Routes stockage ───────────────────────────────────────────────────────────
app.include_router(storage_router)


# ── Routes de base ────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Point de contrôle de santé — utilisé par Docker et le CI/CD."""
    return {"status": "ok", "version": "0.1.0"}
