# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API - Pieces jointes universelles de documents (import_file_attachments)."""

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.services import document_attachments as doc_attach_svc

router = APIRouter(prefix="/api/v1/attachments/files", tags=["Pieces jointes documents"])


@router.post("", status_code=201)
async def upload_attachment(
    file: UploadFile = File(...),
    parent_type: str = Form(..., description="quote, invoice ou order"),
    parent_id: str = Form(..., description="UUID du document parent"),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload une piece jointe et la rattache a un document."""
    file_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "document"
    return await doc_attach_svc.upload_attachment(
        ctx.org_id,
        parent_type=parent_type,
        parent_id=parent_id,
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type,
        db=db,
    )


@router.get("")
async def list_attachments(
    parent_type: str = Query(..., description="quote, invoice ou order"),
    parent_id: str = Query(..., description="UUID du document parent"),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Liste les pieces jointes d'un document."""
    return await doc_attach_svc.list_attachments(
        ctx.org_id, parent_type, parent_id, db,
    )


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Supprime une piece jointe."""
    return await doc_attach_svc.delete_attachment(
        ctx.org_id, attachment_id, db,
    )
