# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Commandes clients."""

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.order import OrderCreate, OrderDetailOut, OrderUpdate
from app.services import orders as svc

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


@router.get("")
async def list_orders(
    status: str | None = None,
    client_id: str | None = None,
    search: str | None = None,
    archived: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_orders(
        ctx.org_id, db,
        status=status,
        client_id=client_id,
        search=search,
        archived=archived,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=201)
async def create_order(
    data: OrderCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_order(ctx.org_id, data, db)


@router.get("/{order_id}")
async def get_order(
    order_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_order(ctx.org_id, order_id, db)


@router.patch("/{order_id}")
async def update_order(
    order_id: str,
    data: OrderUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_order(ctx.org_id, order_id, data, db)


@router.post("/{order_id}/invoice")
async def invoice_order(
    order_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.invoice_order(ctx.org_id, order_id, db)


@router.post("/{order_id}/link-quotes")
async def link_quotes(
    order_id: str,
    quote_ids: list[str] = Body(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.link_quotes(ctx.org_id, order_id, quote_ids, db)


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.cancel_order(ctx.org_id, order_id, db)


@router.post("/{order_id}/restore")
async def restore_order(
    order_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.restore_order(ctx.org_id, order_id, db)


@router.post("/batch/archive")
async def batch_archive(
    ids: list[str] = Body(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.archive_orders(ctx.org_id, ids, db)
