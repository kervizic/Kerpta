# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — Gestion des pièces jointes.

Upload, liaison et listing des PJ avec stockage S3.
Les images sont converties en PDF, tous les PDF sont compressés.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import storage as storage_svc
from app.services.numbering import generate_number
from app.storage.utils import (
    compress_pdf,
    image_to_pdf,
    is_image_mime,
    sanitize_filename,
)

_log = logging.getLogger(__name__)


async def upload_attachment(
    org_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
    label: str,
    mime_type: str,
    db: AsyncSession,
    *,
    client_id: str | None = None,
    supplier_id: str | None = None,
) -> dict:
    """Upload une pièce jointe vers S3.

    - Les images (JPEG, PNG, HEIC…) sont converties en PDF A4
    - Tous les PDF sont compressés avant stockage
    - Le fichier reçoit un numéro PJ-YYYY-NNNN

    Args:
        org_id: UUID de l'organisation
        file_bytes: contenu du fichier
        original_filename: nom du fichier original
        label: nom saisi par l'utilisateur
        mime_type: type MIME du fichier uploadé
        db: session BDD
        client_id: UUID du client (optionnel)
        supplier_id: UUID du fournisseur (optionnel)

    Returns:
        dict avec id, reference, label, s3_url, size_bytes
    """
    original_size = len(file_bytes)

    # Conversion image → PDF si nécessaire
    if is_image_mime(mime_type):
        _log.info("Conversion image → PDF : %s (%s)", original_filename, mime_type)
        file_bytes = image_to_pdf(file_bytes)
        mime_type = "application/pdf"
    elif mime_type == "application/pdf":
        file_bytes = compress_pdf(file_bytes)
    else:
        raise HTTPException(
            422,
            f"Type de fichier non supporté : {mime_type}. "
            "Seuls les PDF et images (JPEG, PNG, HEIC) sont acceptés.",
        )

    final_size = len(file_bytes)

    # Générer le numéro PJ-YYYY-NNNN
    reference = await generate_number("attachment", org_id, db)

    # Construire le nom de fichier S3
    label_clean = sanitize_filename(label)
    s3_filename = f"{reference}-{label_clean}.pdf"

    # Construire le chemin S3 via l'arborescence
    remote_path = await storage_svc.build_document_path(
        org_id, db,
        doc_type="piece-jointe",
        filename=s3_filename,
        client_id=client_id,
        supplier_id=supplier_id,
    )

    # Upload vers S3
    s3_url = await storage_svc.upload_document(
        org_id, file_bytes, remote_path, db,
        content_type="application/pdf",
    )

    # Sauvegarder en base
    attachment_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    await db.execute(
        text("""
            INSERT INTO attachments
                (id, organization_id, reference, label, original_filename,
                 s3_path, s3_url, mime_type, size_bytes, original_size_bytes,
                 client_id, supplier_id, created_at)
            VALUES (:id, :org_id, :ref, :label, :orig_name,
                    :s3_path, :s3_url, :mime, :size, :orig_size,
                    :client_id, :supplier_id, :now)
        """),
        {
            "id": str(attachment_id),
            "org_id": str(org_id),
            "ref": reference,
            "label": label,
            "orig_name": original_filename,
            "s3_path": remote_path,
            "s3_url": s3_url,
            "mime": mime_type,
            "size": final_size,
            "orig_size": original_size,
            "client_id": client_id,
            "supplier_id": supplier_id,
            "now": now,
        },
    )
    await db.commit()

    _log.info(
        "PJ uploadée : %s (%s) — %d → %d octets",
        reference, label, original_size, final_size,
    )

    return {
        "id": str(attachment_id),
        "reference": reference,
        "label": label,
        "s3_url": s3_url,
        "size_bytes": final_size,
        "original_size_bytes": original_size,
    }


async def link_attachment(
    org_id: uuid.UUID,
    attachment_id: str,
    document_type: str,
    document_id: str,
    db: AsyncSession,
) -> dict:
    """Lie une pièce jointe existante à un document.

    Permet de rattacher la même PJ à plusieurs documents
    (devis → facture → BL) sans duplication du fichier.
    """
    # Vérifier que la PJ existe et appartient à l'org
    result = await db.execute(
        text("""
            SELECT id::text FROM attachments
            WHERE id = :aid AND organization_id = :org_id
        """),
        {"aid": attachment_id, "org_id": str(org_id)},
    )
    if not result.fetchone():
        raise HTTPException(404, "Pièce jointe introuvable")

    # Vérifier le doublon
    existing = await db.execute(
        text("""
            SELECT id FROM document_attachments
            WHERE attachment_id = :aid AND document_type = :dtype AND document_id = :did
        """),
        {"aid": attachment_id, "dtype": document_type, "did": document_id},
    )
    if existing.fetchone():
        return {"status": "already_linked"}

    # Créer la liaison
    now = datetime.now(timezone.utc)
    await db.execute(
        text("""
            INSERT INTO document_attachments
                (organization_id, attachment_id, document_type, document_id, created_at)
            VALUES (:org_id, :aid, :dtype, :did, :now)
        """),
        {
            "org_id": str(org_id),
            "aid": attachment_id,
            "dtype": document_type,
            "did": document_id,
            "now": now,
        },
    )
    await db.commit()
    return {"status": "linked"}


async def unlink_attachment(
    org_id: uuid.UUID,
    attachment_id: str,
    document_type: str,
    document_id: str,
    db: AsyncSession,
) -> dict:
    """Supprime le lien entre une PJ et un document."""
    result = await db.execute(
        text("""
            DELETE FROM document_attachments
            WHERE attachment_id = :aid
              AND document_type = :dtype
              AND document_id = :did
              AND organization_id = :org_id
        """),
        {
            "aid": attachment_id,
            "dtype": document_type,
            "did": document_id,
            "org_id": str(org_id),
        },
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Liaison introuvable")
    await db.commit()
    return {"status": "unlinked"}


async def list_document_attachments(
    org_id: uuid.UUID,
    document_type: str,
    document_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Liste les PJ rattachées à un document."""
    result = await db.execute(
        text("""
            SELECT a.id::text, a.reference, a.label, a.original_filename,
                   a.s3_url, a.mime_type, a.size_bytes, a.original_size_bytes,
                   a.created_at
            FROM attachments a
            JOIN document_attachments da ON da.attachment_id = a.id
            WHERE da.document_type = :dtype
              AND da.document_id = :did
              AND da.organization_id = :org_id
            ORDER BY a.created_at
        """),
        {"dtype": document_type, "did": document_id, "org_id": str(org_id)},
    )
    return [
        {
            "id": r[0],
            "reference": r[1],
            "label": r[2],
            "original_filename": r[3],
            "s3_url": r[4],
            "mime_type": r[5],
            "size_bytes": r[6],
            "original_size_bytes": r[7],
            "created_at": str(r[8]) if r[8] else None,
        }
        for r in result.fetchall()
    ]


async def list_client_attachments(
    org_id: uuid.UUID,
    client_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Liste toutes les PJ d'un client."""
    result = await db.execute(
        text("""
            SELECT id::text, reference, label, original_filename,
                   s3_url, mime_type, size_bytes, original_size_bytes, created_at
            FROM attachments
            WHERE organization_id = :org_id AND client_id = :cid
            ORDER BY created_at DESC
        """),
        {"org_id": str(org_id), "cid": client_id},
    )
    return [
        {
            "id": r[0],
            "reference": r[1],
            "label": r[2],
            "original_filename": r[3],
            "s3_url": r[4],
            "mime_type": r[5],
            "size_bytes": r[6],
            "original_size_bytes": r[7],
            "created_at": str(r[8]) if r[8] else None,
        }
        for r in result.fetchall()
    ]


async def delete_attachment(
    org_id: uuid.UUID,
    attachment_id: str,
    db: AsyncSession,
) -> dict:
    """Supprime une pièce jointe (base + S3)."""
    # Récupérer le chemin S3
    result = await db.execute(
        text("""
            SELECT s3_path FROM attachments
            WHERE id = :aid AND organization_id = :org_id
        """),
        {"aid": attachment_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Pièce jointe introuvable")

    # Supprimer en base (CASCADE supprime les document_attachments)
    await db.execute(
        text("DELETE FROM attachments WHERE id = :aid AND organization_id = :org_id"),
        {"aid": attachment_id, "org_id": str(org_id)},
    )
    await db.commit()

    # TODO : supprimer le fichier sur S3 via l'adapter
    _log.info("PJ supprimée : %s (S3 path : %s)", attachment_id, row[0])

    return {"status": "deleted"}
