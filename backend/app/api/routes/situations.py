# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Situations d'avancement."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.situations import SituationDetailOut, SituationUpdate
from app.services import situations as svc

router = APIRouter(prefix="/api/v1/situations", tags=["situations"])


@router.get("/{situation_id}", response_model=SituationDetailOut)
async def get_situation(
    situation_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_situation(ctx.org_id, situation_id, db)


@router.patch("/{situation_id}")
async def update_situation(
    situation_id: str,
    data: SituationUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_situation(ctx.org_id, situation_id, data, db)


@router.post("/{situation_id}/validate")
async def validate_situation(
    situation_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.validate_situation(ctx.org_id, situation_id, db)
