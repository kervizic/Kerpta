# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API - Staging des imports IA (document_imports)."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context, require_permission
from app.services import document_import as import_svc
from app.services import import_to_catalog as catalog_svc
from app.services import storage as storage_svc

router = APIRouter(prefix="/api/v1/imports", tags=["Imports IA"])


class LineAction(BaseModel):
    line_id: str
    action: str  # create_client, create_catalog, link_existing, skip
    existing_product_id: str | None = None


class ImportToCatalogRequest(BaseModel):
    client_id: str | None = None
    line_actions: list[LineAction]


class ValidateImportBody(BaseModel):
    action: str           # create ou attach
    target_type: str      # quote, invoice, order
    target_id: str | None = None
    client_id: str | None = None
    corrected_json: dict | None = None
    quote_ids: list[str] | None = None


@router.get("")
async def list_imports(
    status: str | None = Query(None, description="Filtrer par statut (pending, validated, rejected)"),
    search: str | None = Query(None, description="Recherche texte (nom fichier, client)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:read")),
    db: AsyncSession = Depends(get_db),
):
    """Liste les imports IA, filtrable par statut et recherche."""
    all_imports = await import_svc.list_imports(ctx.org_id, status, db)
    # Filtre recherche cote serveur
    if search:
        s = search.lower()
        all_imports = [
            i for i in all_imports
            if s in (i.get("source_filename") or "").lower()
            or s in (i.get("client_name") or "").lower()
            or s in (i.get("extracted_emetteur_name") or "").lower()
            or s in (i.get("extracted_destinataire_name") or "").lower()
            or s in (i.get("extracted_doc_number") or "").lower()
        ]
    total = len(all_imports)
    start = (page - 1) * page_size
    items = all_imports[start:start + page_size]
    return {"items": items, "total": total}


@router.get("/{import_id}")
async def get_import(
    import_id: str,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:read")),
    db: AsyncSession = Depends(get_db),
):
    """Detail d'un import."""
    return await import_svc.get_import(ctx.org_id, import_id, db)


@router.post("/{import_id}/validate")
async def validate_import(
    import_id: str,
    body: ValidateImportBody,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:write")),
    db: AsyncSession = Depends(get_db),
):
    """Valide un import : cree le document ou attache le fichier."""
    return await import_svc.validate_import(
        ctx.org_id, import_id,
        action=body.action,
        target_type=body.target_type,
        client_id=body.client_id,
        corrected_json=body.corrected_json,
        db=db,
        target_id=body.target_id,
        quote_ids=body.quote_ids,
    )


class UpdateImportBody(BaseModel):
    doc_type: str | None = None
    client_id: str | None = None
    doc_number: str | None = None
    doc_date: str | None = None
    doc_due_date: str | None = None
    reference: str | None = None
    order_number: str | None = None


@router.patch("/{import_id}")
async def update_import(
    import_id: str,
    body: UpdateImportBody,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:write")),
    db: AsyncSession = Depends(get_db),
):
    """Met a jour les champs editables d'un import."""
    return await import_svc.update_import(ctx.org_id, import_id, body.model_dump(exclude_none=True), db)


@router.get("/{import_id}/lines")
async def get_import_lines(
    import_id: str,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:read")),
    db: AsyncSession = Depends(get_db),
):
    """Lignes extraites d'un import avec leur statut de matching."""
    # Verifier que l'import appartient a l'organisation
    await import_svc.get_import(ctx.org_id, import_id, db)
    return await import_svc.get_import_lines(import_id, db)


@router.post("/{import_id}/reject")
async def reject_import(
    import_id: str,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:write")),
    db: AsyncSession = Depends(get_db),
):
    """Rejette un import."""
    return await import_svc.reject_import(ctx.org_id, import_id, db)


@router.delete("/{import_id}")
async def delete_import(
    import_id: str,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:write")),
    db: AsyncSession = Depends(get_db),
):
    """Supprime un import et ses lignes (cascade)."""
    return await import_svc.delete_import(ctx.org_id, import_id, db)


@router.get("/{import_id}/file")
async def get_import_file(
    import_id: str,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:read")),
    db: AsyncSession = Depends(get_db),
):
    """Telecharge le fichier source d'un import depuis S3 et le sert en proxy."""
    detail = await import_svc.get_import(ctx.org_id, import_id, db)
    file_url = detail.get("source_file_url")
    if not file_url:
        raise HTTPException(404, "Aucun fichier source pour cet import")

    filename = detail.get("source_filename") or "document"
    file_bytes = await storage_svc.download_document(file_url, db)
    if not file_bytes:
        raise HTTPException(404, "Fichier introuvable sur le stockage")

    content_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{import_id}/catalog")
async def import_to_catalog(
    import_id: str,
    body: ImportToCatalogRequest,
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:write")),
    db: AsyncSession = Depends(get_db),
):
    """Importe les lignes selectionnees dans le catalogue produits."""
    return await catalog_svc.import_lines_to_catalog(
        org_id=ctx.org_id,
        import_id=import_id,
        client_id=body.client_id,
        line_actions=[la.model_dump() for la in body.line_actions],
        db=db,
    )


@router.get("/{import_id}/catalog-suggestions")
async def get_catalog_suggestions(
    import_id: str,
    client_id: str | None = Query(None, description="ID client pour filtrer les suggestions"),
    ctx: OrgContext = Depends(get_org_context),
    _perm=Depends(require_permission("imports:read")),
    db: AsyncSession = Depends(get_db),
):
    """Retourne les suggestions de matching pour chaque ligne."""
    return await catalog_svc.auto_match_products(
        org_id=ctx.org_id,
        import_id=import_id,
        db=db,
    )
