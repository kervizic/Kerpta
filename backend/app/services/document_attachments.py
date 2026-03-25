# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service metier - Pieces jointes universelles de documents.

Upload, listing et suppression des fichiers attaches aux documents
(devis, factures, commandes). Les fichiers sont stockes sur S3 au
format PDF A4, les images sont converties automatiquement.

Table utilisee : import_file_attachments
(distincte de document_attachments qui est la table de liaison PJ ↔ documents)
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import storage as storage_svc
from app.storage.utils import (
    compress_pdf,
    image_to_pdf,
    is_image_mime,
    sanitize_filename,
)

_log = logging.getLogger(__name__)

VALID_PARENT_TYPES = ("quote", "invoice", "order")


async def upload_attachment(
    org_id: uuid.UUID,
    parent_type: str,
    parent_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    db: AsyncSession,
    *,
    import_id: str | None = None,
) -> dict:
    """Upload une piece jointe et la rattache a un document.

    - Si c'est un PDF : compresse via pikepdf
    - Si c'est une image (JPEG, PNG, HEIC...) : convertit en PDF A4 via Pillow
    - Upload sur S3 via le service storage existant
    - Insere dans import_file_attachments

    Returns:
        dict avec id, file_url, original_filename, file_size
    """
    if parent_type not in VALID_PARENT_TYPES:
        raise HTTPException(422, f"parent_type invalide : {parent_type}")

    # Verifier que le stockage S3 est configure
    await storage_svc.require_active_storage(org_id, db)

    original_size = len(file_bytes)

    # Conversion image -> PDF si necessaire
    if is_image_mime(content_type):
        _log.info("Conversion image -> PDF : %s (%s)", filename, content_type)
        file_bytes = image_to_pdf(file_bytes)
        content_type = "application/pdf"
    elif content_type == "application/pdf":
        file_bytes = compress_pdf(file_bytes)
    else:
        raise HTTPException(
            422,
            f"Type de fichier non supporte : {content_type}. "
            "Seuls les PDF et images (JPEG, PNG, HEIC) sont acceptes.",
        )

    final_size = len(file_bytes)

    # Construire le nom de fichier S3
    base_name = sanitize_filename(filename)
    unique_suffix = uuid.uuid4().hex[:8]
    s3_filename = f"{base_name}-{unique_suffix}.pdf"

    # Construire le chemin S3
    remote_path = await storage_svc.build_document_path(
        org_id, db,
        doc_type="piece-jointe",
        filename=s3_filename,
    )

    # Upload vers S3
    file_url = await storage_svc.upload_document(
        org_id, file_bytes, remote_path, db,
        content_type="application/pdf",
    )

    if not file_url:
        raise HTTPException(500, "Echec de l'upload S3")

    # Inserer en base
    attachment_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO import_file_attachments
                (id, organization_id, parent_type, parent_id,
                 file_url, original_filename, file_size, import_id, created_at)
            VALUES (:id, :org_id, :parent_type, :parent_id,
                    :file_url, :filename, :file_size, :import_id, :now)
        """),
        {
            "id": str(attachment_id),
            "org_id": str(org_id),
            "parent_type": parent_type,
            "parent_id": parent_id,
            "file_url": file_url,
            "filename": filename,
            "file_size": final_size,
            "import_id": import_id,
            "now": datetime.now(timezone.utc),
        },
    )
    await db.commit()

    _log.info(
        "PJ document uploadee : %s -> %s/%s (%d -> %d octets)",
        filename, parent_type, parent_id, original_size, final_size,
    )

    return {
        "id": str(attachment_id),
        "file_url": file_url,
        "original_filename": filename,
        "file_size": final_size,
    }


async def list_attachments(
    org_id: uuid.UUID,
    parent_type: str,
    parent_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Liste les pieces jointes d'un document."""
    result = await db.execute(
        text("""
            SELECT id::text, file_url, original_filename, file_size,
                   import_id::text, created_at
            FROM import_file_attachments
            WHERE organization_id = :org_id
              AND parent_type = :parent_type
              AND parent_id = :parent_id
            ORDER BY created_at
        """),
        {
            "org_id": str(org_id),
            "parent_type": parent_type,
            "parent_id": parent_id,
        },
    )
    return [
        {
            "id": r[0],
            "file_url": r[1],
            "original_filename": r[2],
            "file_size": r[3],
            "import_id": r[4],
            "created_at": str(r[5]) if r[5] else None,
        }
        for r in result.fetchall()
    ]


async def delete_attachment(
    org_id: uuid.UUID,
    attachment_id: str,
    db: AsyncSession,
) -> dict:
    """Supprime une piece jointe (base + S3)."""
    # Recuperer l'URL pour le log
    result = await db.execute(
        text("""
            SELECT file_url FROM import_file_attachments
            WHERE id = :aid AND organization_id = :org_id
        """),
        {"aid": attachment_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Piece jointe introuvable")

    # Supprimer en base
    await db.execute(
        text("DELETE FROM import_file_attachments WHERE id = :aid AND organization_id = :org_id"),
        {"aid": attachment_id, "org_id": str(org_id)},
    )
    await db.commit()

    # TODO : supprimer le fichier sur S3 via l'adapter
    _log.info("PJ document supprimee : %s (URL : %s)", attachment_id, row[0])

    return {"status": "deleted"}
