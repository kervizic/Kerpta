# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Configuration du stockage externe (S3, FTP, etc.)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.services import storage as svc

router = APIRouter(prefix="/api/v1/storage", tags=["storage"])


@router.get("/connections")
async def list_connections(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Liste les connexions de stockage de l'organisation."""
    return await svc.list_connections(ctx.org_id, db)


@router.post("/connect")
async def connect_storage(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Crée ou met à jour une connexion de stockage."""
    return await svc.connect_storage(ctx.org_id, data, db)


@router.post("/connections/{config_id}/test")
async def test_connection(
    config_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Teste une connexion de stockage existante."""
    return await svc.test_connection(ctx.org_id, config_id, db)


@router.delete("/connections/{config_id}")
async def disconnect_storage(
    config_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Supprime une connexion de stockage."""
    return await svc.disconnect_storage(ctx.org_id, config_id, db)
