# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Pièces jointes : tables attachments et document_attachments.

Les PJ sont stockées une seule fois sur S3 et liées à un ou plusieurs
documents via la table de liaison document_attachments.

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Table des pièces jointes
    op.create_table(
        "attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("reference", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("s3_path", sa.Text, nullable=False),
        sa.Column("s3_url", sa.Text, nullable=True),
        sa.Column(
            "mime_type",
            sa.String(100),
            nullable=False,
            server_default="application/pdf",
        ),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        sa.Column("original_size_bytes", sa.BigInteger, nullable=True),
        sa.Column(
            "client_id",
            UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "supplier_id",
            UUID(as_uuid=True),
            sa.ForeignKey("suppliers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_attachments_org_id", "attachments", ["organization_id"]
    )
    op.create_index(
        "ix_attachments_client_id", "attachments", ["client_id"]
    )
    op.create_index(
        "ix_attachments_supplier_id", "attachments", ["supplier_id"]
    )

    # Table de liaison documents ↔ pièces jointes
    op.create_table(
        "document_attachments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "attachment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_type", sa.String(30), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_doc_attachments_doc",
        "document_attachments",
        ["document_type", "document_id"],
    )
    op.create_index(
        "ix_doc_attachments_attachment",
        "document_attachments",
        ["attachment_id"],
    )


def downgrade() -> None:
    op.drop_table("document_attachments")
    op.drop_table("attachments")
