# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Pièces jointes (upload, liaison, listing)."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.services import attachment as svc

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])


@router.post("/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    label: str = Form(...),
    client_id: str | None = Form(None),
    supplier_id: str | None = Form(None),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload une pièce jointe (PDF ou image → PDF compressé)."""
    file_bytes = await file.read()
    return await svc.upload_attachment(
        ctx.org_id,
        file_bytes,
        file.filename or "fichier",
        label,
        file.content_type or "application/octet-stream",
        db,
        client_id=client_id,
        supplier_id=supplier_id,
    )


@router.post("/link")
async def link_attachment(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Lie une PJ existante à un document (devis, facture, BL…)."""
    return await svc.link_attachment(
        ctx.org_id,
        data["attachment_id"],
        data["document_type"],
        data["document_id"],
        db,
    )


@router.post("/unlink")
async def unlink_attachment(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Supprime le lien entre une PJ et un document."""
    return await svc.unlink_attachment(
        ctx.org_id,
        data["attachment_id"],
        data["document_type"],
        data["document_id"],
        db,
    )


@router.get("/document/{document_type}/{document_id}")
async def list_document_attachments(
    document_type: str,
    document_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Liste les PJ rattachées à un document."""
    return await svc.list_document_attachments(
        ctx.org_id, document_type, document_id, db
    )


@router.get("/client/{client_id}")
async def list_client_attachments(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Liste toutes les PJ d'un client."""
    return await svc.list_client_attachments(ctx.org_id, client_id, db)


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Supprime une pièce jointe."""
    return await svc.delete_attachment(ctx.org_id, attachment_id, db)
