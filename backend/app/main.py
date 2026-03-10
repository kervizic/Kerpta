# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Point d'entrée principal de l'API Kerpta.

Au démarrage, un middleware vérifie si le setup d'installation est terminé.
Si ce n'est pas le cas, toutes les requêtes (sauf /setup/* et /health) sont
redirigées vers /setup/ pour compléter la configuration.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.setup.router import router as setup_router

# ── Répertoire des templates Jinja2 ──────────────────────────────────────────
_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"


# ── Middleware de redirection vers le wizard ──────────────────────────────────


class SetupRedirectMiddleware(BaseHTTPMiddleware):
    """Redirige vers /setup/ si l'installation n'est pas terminée.

    Les chemins suivants sont toujours autorisés (whitelist) :
    - /setup/* (le wizard lui-même)
    - /health  (healthcheck Docker / CI)
    - /api/docs, /api/redoc, /openapi.json (swagger — dev uniquement)
    - /static/* (assets statiques)
    """

    WHITELIST_PREFIXES = ("/setup", "/health", "/static", "/api/docs", "/api/redoc", "/openapi.json")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Toujours autoriser les chemins de la whitelist
        if any(path.startswith(prefix) for prefix in self.WHITELIST_PREFIXES):
            return await call_next(request)

        # Vérifie le statut du setup via la base de données
        try:
            # Import différé pour éviter les problèmes de démarrage si la DB
            # n'est pas encore configurée (étape 1 du wizard)
            from sqlalchemy import text
            from app.core.database import AsyncSessionLocal

            if not settings.DATABASE_URL:
                return RedirectResponse(url="/setup/step1", status_code=302)

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    text(
                        "SELECT setup_completed FROM platform_config LIMIT 1"
                    )
                )
                row = result.fetchone()
                if row is None or not row[0]:
                    return RedirectResponse(url="/setup/", status_code=302)

        except Exception:
            # DB inaccessible → redirection vers le wizard
            return RedirectResponse(url="/setup/step1", status_code=302)

        return await call_next(request)


# ── Application FastAPI ───────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie de l'application."""
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

# Le middleware de setup doit être ajouté APRÈS CORS pour être exécuté en premier
app.add_middleware(SetupRedirectMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(setup_router)

# Les routes métier seront enregistrées ici au fur et à mesure des modules :
# from app.api.routes import invoices, quotes, clients, ...
# app.include_router(invoices.router, prefix="/api/v1")


# ── Routes de base ────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Point de contrôle de santé — utilisé par Docker et le CI/CD."""
    return {"status": "ok", "version": "0.1.0"}
