# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Staging d'import IA et pieces jointes universelles.

Cree les tables :
- document_imports : staging des extractions IA (pending/validated/rejected)
- import_file_attachments : pieces jointes liees aux documents (PDF source)

Note : la table est nommee import_file_attachments (et non document_attachments)
car document_attachments existe deja (migration 0012) pour la liaison PJ ↔ documents.

Revision ID: 0021
Revises: 0020
Create Date: 2026-03-25
"""

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


def upgrade() -> None:
    # ── Table de staging des imports IA ───────────────────────────────────────
    op.create_table(
        "document_imports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("source_file_url", sa.Text, nullable=True),
        sa.Column("source_filename", sa.String(255), nullable=True),
        sa.Column("extracted_json", JSONB, nullable=True),
        sa.Column("corrected_json", JSONB, nullable=True),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id"), nullable=True),
        sa.Column("target_type", sa.String(20), nullable=True),
        sa.Column("target_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(20), server_default="create"),
        sa.Column("confidence", sa.Numeric(3, 2), nullable=True),
        sa.Column("model_used", sa.String(100), nullable=True),
        sa.Column("extraction_duration_ms", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_document_imports_org_status",
        "document_imports",
        ["organization_id", "status"],
    )

    # ── Table des pieces jointes universelles ─────────────────────────────────
    op.create_table(
        "import_file_attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("parent_type", sa.String(20), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), nullable=False),
        sa.Column("file_url", sa.Text, nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("import_id", UUID(as_uuid=True), sa.ForeignKey("document_imports.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_import_file_attachments_parent",
        "import_file_attachments",
        ["parent_type", "parent_id"],
    )


def downgrade() -> None:
    op.drop_table("import_file_attachments")
    op.drop_table("document_imports")
