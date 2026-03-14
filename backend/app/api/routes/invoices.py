# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Factures et avoirs."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.invoices import (
    InvoiceCreate,
    InvoiceDetailOut,
    InvoiceUpdate,
    PaginatedInvoices,
)
from app.services import invoices as svc

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


@router.get("", response_model=PaginatedInvoices)
async def list_invoices(
    status: str | None = None,
    client_id: str | None = None,
    contract_id: str | None = None,
    is_credit_note: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_invoices(
        ctx.org_id, db,
        status=status, client_id=client_id,
        contract_id=contract_id, is_credit_note=is_credit_note,
        page=page, page_size=page_size,
    )


@router.post("", status_code=201)
async def create_invoice(
    data: InvoiceCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_invoice(ctx.org_id, ctx.user_id, data, db)


@router.get("/{invoice_id}", response_model=InvoiceDetailOut)
async def get_invoice(
    invoice_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_invoice(ctx.org_id, invoice_id, db)


@router.patch("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    data: InvoiceUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_invoice(ctx.org_id, invoice_id, data, db)


@router.post("/{invoice_id}/validate")
async def validate_invoice(
    invoice_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.validate_invoice(ctx.org_id, invoice_id, db)


@router.post("/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.send_invoice(ctx.org_id, invoice_id, db)


@router.post("/{invoice_id}/mark-paid")
async def mark_paid(
    invoice_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.mark_paid(ctx.org_id, invoice_id, db)


@router.post("/{invoice_id}/credit-note")
async def create_credit_note(
    invoice_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_credit_note(ctx.org_id, ctx.user_id, invoice_id, db)
