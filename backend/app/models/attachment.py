# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Modèles — Pièces jointes (attachments).

Chaque pièce jointe est stockée une seule fois sur S3.
La table de liaison `document_attachments` permet de rattacher
une PJ à plusieurs documents (devis, facture, BL…) sans duplication.
"""

import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Attachment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Pièce jointe stockée sur S3.

    Numérotée PJ-YYYY-NNNN par organisation.
    Le fichier physique est unique — les liens sont dans DocumentAttachment.
    """

    __tablename__ = "attachments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    # Référence séquentielle (PJ-2026-0001)
    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    # Nom saisi par l'utilisateur lors de l'import
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Nom du fichier original uploadé
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    # Chemin S3 complet
    s3_path: Mapped[str] = mapped_column(Text, nullable=False)
    # URL publique retournée par S3
    s3_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Type MIME final (toujours application/pdf après conversion)
    mime_type: Mapped[str] = mapped_column(
        String(100), default="application/pdf", nullable=False
    )
    # Taille en octets (après compression)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Taille originale avant compression (info)
    original_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # ID du client associé (pour le dossier S3)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
    )
    # ID du fournisseur associé (pour le dossier S3)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )


class DocumentAttachment(Base, TimestampMixin):
    """Liaison N:N entre un document et une pièce jointe.

    Permet de rattacher la même PJ à un devis, une facture, un BL, etc.
    sans duplication du fichier sur S3.
    """

    __tablename__ = "document_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    attachment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Type de document lié (invoice, quote, delivery_note, purchase_order, etc.)
    document_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # UUID du document lié
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
