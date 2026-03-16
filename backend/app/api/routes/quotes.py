# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Devis (DEV/BPU/Attachements/Avenants)."""

import io
import zipfile

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.quotes import PaginatedQuotes, QuoteCreate, QuoteDetailOut, QuoteUpdate
from app.services import quotes as svc
from app.services import pdf as pdf_svc

router = APIRouter(prefix="/api/v1/quotes", tags=["quotes"])


@router.get("", response_model=PaginatedQuotes)
async def list_quotes(
    status: str | None = None,
    document_type: str | None = None,
    contract_id: str | None = None,
    client_id: str | None = None,
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
    return await svc.list_quotes(
        ctx.org_id, db,
        status=status, document_type=document_type,
        contract_id=contract_id, client_id=client_id,
        search=search, client_search=client_search,
        date_from=date_from, date_to=date_to,
        archived=archived,
        page=page, page_size=page_size,
    )


@router.post("", status_code=201)
async def create_quote(
    data: QuoteCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_quote(ctx.org_id, ctx.user_id, data, db)


@router.get("/{quote_id}", response_model=QuoteDetailOut)
async def get_quote(
    quote_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_quote(ctx.org_id, quote_id, db)


@router.patch("/{quote_id}")
async def update_quote(
    quote_id: str,
    data: QuoteUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_quote(ctx.org_id, quote_id, data, db)


@router.post("/{quote_id}/send")
async def send_quote(
    quote_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.send_quote(ctx.org_id, quote_id, db)


@router.post("/{quote_id}/accept")
async def accept_quote(
    quote_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.accept_quote(ctx.org_id, quote_id, db)


@router.post("/{quote_id}/refuse")
async def refuse_quote(
    quote_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.refuse_quote(ctx.org_id, quote_id, db)


@router.post("/{quote_id}/duplicate")
async def duplicate_quote(
    quote_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.duplicate_quote(ctx.org_id, quote_id, db)


@router.post("/{quote_id}/convert-to-contract")
async def convert_to_contract(
    quote_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.convert_to_contract(ctx.org_id, ctx.user_id, quote_id, db)


@router.post("/batch/archive")
async def batch_archive_quotes(
    ids: list[str] = Body(..., embed=True),
    archive: bool = Body(True, embed=True),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Archive ou désarchive un lot de devis."""
    return await svc.batch_archive(ctx.org_id, ids, archive, db)


@router.post("/batch/pdf")
async def batch_download_pdf(
    ids: list[str] = Body(..., embed=True),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Télécharge les PDF d'un lot de devis (ZIP si plusieurs, PDF direct si un seul)."""
    if not ids:
        raise HTTPException(400, "Aucun devis sélectionné")

    if len(ids) == 1:
        # Un seul → PDF direct
        try:
            pdf_bytes, filename = await pdf_svc.generate_quote_pdf(ctx.org_id, ids[0], db)
        except ValueError as e:
            raise HTTPException(404, str(e))
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Plusieurs → ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for qid in ids:
            try:
                pdf_bytes, filename = await pdf_svc.generate_quote_pdf(ctx.org_id, qid, db)
                zf.writestr(filename, pdf_bytes)
            except ValueError:
                continue  # Devis introuvable → on skip
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="devis.zip"'},
    )


@router.get("/{quote_id}/pdf")
async def get_quote_pdf(
    quote_id: str,
    download: bool = False,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Génère et retourne le PDF du devis."""
    try:
        pdf_bytes, filename = await pdf_svc.generate_quote_pdf(
            ctx.org_id, quote_id, db,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    disposition = "attachment" if download else "inline"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )
