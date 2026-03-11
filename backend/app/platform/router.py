# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Router FastAPI — API publique du contenu de la page vitrine Kerpta.

Routes :
  GET /api/v1/platform/content         → toutes les sections visibles
  GET /api/v1/platform/content/{section} → une section spécifique
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.platform import service

router = APIRouter(prefix="/api/v1/platform", tags=["platform"])


@router.get("/content")
async def get_content(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Retourne toutes les sections visibles de la page vitrine."""
    sections = await service.get_all_sections(db)

    # Si aucun contenu : seed automatique (premier démarrage sans reset explicite)
    if not sections:
        await service.seed_content(db)
        sections = await service.get_all_sections(db)

    return JSONResponse({"ok": True, "sections": sections})


@router.get("/content/{section}")
async def get_section(
    section: str, db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    """Retourne une section spécifique de la page vitrine."""
    data = await service.get_section(db, section)
    if not data:
        raise HTTPException(status_code=404, detail=f"Section '{section}' introuvable")
    return JSONResponse({"ok": True, "section": data})
