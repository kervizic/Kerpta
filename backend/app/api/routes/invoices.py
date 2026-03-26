# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Factures et avoirs."""

import io
import zipfile

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
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
from app.services import pdf as pdf_svc
from app.services import document_import as import_svc

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


@router.get("", response_model=PaginatedInvoices)
async def list_invoices(
    status: str | None = None,
    client_id: str | None = None,
    contract_id: str | None = None,
    is_credit_note: bool | None = None,
    search: str | None = None,
    client_search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    archived: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_invoices(
        ctx.org_id, db,
        status=status, client_id=client_id,
        contract_id=contract_id, is_credit_note=is_credit_note,
        search=search, client_search=client_search,
        date_from=date_from, date_to=date_to,
        archived=archived,
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


@router.post("/batch/archive")
async def batch_archive_invoices(
    ids: list[str] = Body(..., embed=True),
    archive: bool = Body(True, embed=True),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Archive ou désarchive un lot de factures."""
    return await svc.batch_archive(ctx.org_id, ids, archive, db)


@router.post("/batch/pdf")
async def batch_download_invoice_pdf(
    ids: list[str] = Body(..., embed=True),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Télécharge les PDF d'un lot de factures (ZIP si plusieurs)."""
    if not ids:
        raise HTTPException(400, "Aucune facture sélectionnée")

    if len(ids) == 1:
        try:
            pdf_bytes, filename = await pdf_svc.generate_invoice_pdf(ctx.org_id, ids[0], db)
        except ValueError as e:
            raise HTTPException(404, str(e))
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for inv_id in ids:
            try:
                pdf_bytes, filename = await pdf_svc.generate_invoice_pdf(ctx.org_id, inv_id, db)
                zf.writestr(filename, pdf_bytes)
            except ValueError:
                continue
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="factures.zip"'},
    )


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    proforma: bool = False,
    download: bool = False,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Génère et retourne le PDF de la facture."""
    try:
        pdf_bytes, filename = await pdf_svc.generate_invoice_pdf(
            ctx.org_id, invoice_id, db, proforma=proforma,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    disposition = "attachment" if download else "inline"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.get("/{invoice_id}/import-data")
async def get_invoice_import_data(
    invoice_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Donnees d'import IA structurees liees a cette facture."""
    data = await import_svc.get_import_data_for_target(ctx.org_id, "invoice", invoice_id, db)
    if data is None:
        return {"import": None}
    return {"import": data}
