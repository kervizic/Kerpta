# Kerpta - Migration : colonnes structurees d'import IA + table des lignes
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Colonnes structurees sur document_imports et table document_import_lines.

Stocke les donnees extraites par l'IA dans des colonnes SQL propres
au lieu de tout mettre dans le blob JSON. Permet de lier chaque element
IA a son homologue dans la commande/facture.
"""

revision = "0024"
down_revision = "0023"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    # -- Colonnes structurees sur document_imports (en-tete du document) ------
    op.add_column("document_imports", sa.Column("extracted_client_name", sa.String(255), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_client_siret", sa.String(14), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_client_siren", sa.String(9), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_client_tva", sa.String(20), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_client_address", sa.Text, nullable=True))
    op.add_column("document_imports", sa.Column("extracted_doc_number", sa.String(100), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_doc_date", sa.Date, nullable=True))
    op.add_column("document_imports", sa.Column("extracted_doc_due_date", sa.Date, nullable=True))
    op.add_column("document_imports", sa.Column("extracted_doc_type", sa.String(50), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_total_ht", sa.Numeric(12, 2), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_total_tva", sa.Numeric(12, 2), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_total_ttc", sa.Numeric(12, 2), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_iban", sa.String(34), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_payment_mode", sa.String(50), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_currency", sa.String(3), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_reference", sa.String(100), nullable=True))
    op.add_column("document_imports", sa.Column("extracted_order_number", sa.String(100), nullable=True))

    # -- Table des lignes extraites -------------------------------------------
    op.create_table(
        "document_import_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("import_id", UUID(as_uuid=True), sa.ForeignKey("document_imports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("extracted_reference", sa.String(100), nullable=True),
        sa.Column("extracted_designation", sa.Text, nullable=True),
        sa.Column("extracted_description", sa.Text, nullable=True),
        sa.Column("extracted_quantity", sa.Numeric(12, 4), nullable=True),
        sa.Column("extracted_unit", sa.String(20), nullable=True),
        sa.Column("extracted_unit_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("extracted_vat_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("extracted_total_ht", sa.Numeric(12, 2), nullable=True),
        sa.Column("extracted_total_ttc", sa.Numeric(12, 2), nullable=True),
        sa.Column("matched_line_id", UUID(as_uuid=True), nullable=True),
        sa.Column("match_confidence", sa.Numeric(3, 2), nullable=True),
        sa.Column("match_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_document_import_lines_import", "document_import_lines", ["import_id"])


def downgrade() -> None:
    op.drop_table("document_import_lines")

    op.drop_column("document_imports", "extracted_order_number")
    op.drop_column("document_imports", "extracted_reference")
    op.drop_column("document_imports", "extracted_currency")
    op.drop_column("document_imports", "extracted_payment_mode")
    op.drop_column("document_imports", "extracted_iban")
    op.drop_column("document_imports", "extracted_total_ttc")
    op.drop_column("document_imports", "extracted_total_tva")
    op.drop_column("document_imports", "extracted_total_ht")
    op.drop_column("document_imports", "extracted_doc_type")
    op.drop_column("document_imports", "extracted_doc_due_date")
    op.drop_column("document_imports", "extracted_doc_date")
    op.drop_column("document_imports", "extracted_doc_number")
    op.drop_column("document_imports", "extracted_client_address")
    op.drop_column("document_imports", "extracted_client_tva")
    op.drop_column("document_imports", "extracted_client_siren")
    op.drop_column("document_imports", "extracted_client_siret")
    op.drop_column("document_imports", "extracted_client_name")
