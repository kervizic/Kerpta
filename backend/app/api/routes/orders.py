# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Commandes clients."""

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.order import OrderCreate, OrderDetailOut, OrderTypeCreate, OrderTypeUpdate, OrderUpdate
from app.schemas.quotes import DocumentImport
from app.services import orders as svc
from app.services import document_import as import_svc

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


# ── Types de commande ────────────────────────────────────────────────────────


@router.get("/types")
async def list_order_types(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_order_types(ctx.org_id, db)


@router.post("/types", status_code=201)
async def create_order_type(
    data: OrderTypeCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_order_type(ctx.org_id, data, db)


@router.patch("/types/{type_id}")
async def update_order_type(
    type_id: str,
    data: OrderTypeUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_order_type(ctx.org_id, type_id, data, db)


@router.delete("/types/{type_id}")
async def delete_order_type(
    type_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_order_type(ctx.org_id, type_id, db)


# ── Commandes ────────────────────────────────────────────────────────────────


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


@router.post("/{order_id}/uninvoice")
async def uninvoice_order(
    order_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.uninvoice_order(ctx.org_id, order_id, db)


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


@router.post("/import", status_code=201)
async def import_order(
    data: DocumentImport,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Importe une commande depuis un JSON Factur-X extrait par l'IA."""
    return await import_svc.import_as_order(
        ctx.org_id, data.extracted_data, db,
        client_id=data.client_id,
        quote_ids=data.quote_ids,
        source_filename=data.source_filename,
    )


@router.post("/batch/archive")
async def batch_archive(
    ids: list[str] = Body(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.archive_orders(ctx.org_id, ids, db)
