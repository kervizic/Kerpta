# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Module Vente — contracts, situations, situation_lines + enrichissement quotes/invoices.

- Table contracts (enveloppe légère)
- Table situations (facturation progressive)
- Table situation_lines (détail par ligne de BPU)
- Colonnes ajoutées sur quotes : contract_id, is_avenant, avenant_number, bpu_source_id
- Colonne document_type sur quotes : type réduit à VARCHAR(20), défaut 'devis'
- Colonnes ajoutées sur invoices : contract_id, situation_id, is_situation, situation_number
- Colonne ajoutée sur client_purchase_orders : contract_id
- Colonne ajoutée sur quote_lines : reference
- Colonne ajoutée sur organizations : module_contracts_enabled
- Index de performance

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Table contracts ──────────────────────────────────────────────────
    op.create_table(
        "contracts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supplier_id", UUID(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("reference", sa.String(50), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("auto_renew", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("renewal_notice_days", sa.Integer, nullable=False, server_default="30"),
        sa.Column("bpu_quote_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_budget", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total_invoiced", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("signed_pdf_url", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── Table situations ──────────────────────────────────────────────────
    op.create_table(
        "situations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bpu_quote_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("situation_number", sa.Integer, nullable=False),
        sa.Column("period_label", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("cumulative_total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("previously_invoiced", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("invoice_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("contract_id", "situation_number"),
    )

    # ── Table situation_lines ─────────────────────────────────────────────
    op.create_table(
        "situation_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("situation_id", UUID(as_uuid=True), sa.ForeignKey("situations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quote_line_id", UUID(as_uuid=True), sa.ForeignKey("quote_lines.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("total_contract", sa.Numeric(15, 2), nullable=False),
        sa.Column("previous_completion_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("completion_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("cumulative_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("previously_invoiced", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("line_invoice_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.CheckConstraint("completion_percent BETWEEN 0 AND 100", name="check_completion"),
        sa.CheckConstraint("completion_percent >= previous_completion_percent", name="check_cumulative"),
    )

    # ── Colonnes sur quotes ───────────────────────────────────────────────
    op.add_column("quotes", sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True))
    op.add_column("quotes", sa.Column("is_avenant", sa.Boolean, nullable=False, server_default=sa.text("false")))
    op.add_column("quotes", sa.Column("avenant_number", sa.Integer, nullable=True))
    op.add_column("quotes", sa.Column("bpu_source_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True))

    # Modifier document_type : VARCHAR(100) → VARCHAR(20), default 'devis'
    op.alter_column(
        "quotes", "document_type",
        type_=sa.String(20),
        server_default="devis",
        existing_type=sa.String(100),
        existing_nullable=False,
    )
    # Normaliser les valeurs existantes si nécessaire
    op.execute("UPDATE quotes SET document_type = LOWER(document_type) WHERE document_type != LOWER(document_type)")

    # Ajouter reference sur quote_lines (colonne optionnelle pour la ref article)
    op.add_column("quote_lines", sa.Column("reference", sa.String(100), nullable=True))

    # ── Colonnes sur invoices ─────────────────────────────────────────────
    op.add_column("invoices", sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True))
    op.add_column("invoices", sa.Column("situation_id", UUID(as_uuid=True), sa.ForeignKey("situations.id", ondelete="SET NULL"), nullable=True))
    op.add_column("invoices", sa.Column("is_situation", sa.Boolean, nullable=False, server_default=sa.text("false")))
    op.add_column("invoices", sa.Column("situation_number", sa.Integer, nullable=True))

    # ── Colonne sur client_purchase_orders ────────────────────────────────
    op.add_column("client_purchase_orders", sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True))

    # ── Colonne module_contracts_enabled sur organizations ────────────────
    op.add_column("organizations", sa.Column("module_contracts_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")))

    # ── Index de performance ──────────────────────────────────────────────
    op.create_index("idx_quotes_contract", "quotes", ["contract_id"])
    op.create_index("idx_quotes_bpu_source", "quotes", ["bpu_source_id"])
    op.create_index("idx_invoices_contract", "invoices", ["contract_id"])
    op.create_index("idx_invoices_situation", "invoices", ["situation_id"])
    op.create_index("idx_contracts_org", "contracts", ["organization_id"])
    op.create_index("idx_contracts_client", "contracts", ["client_id"])
    op.create_index("idx_situations_contract", "situations", ["contract_id"])
    op.create_index("idx_situation_lines_situation", "situation_lines", ["situation_id"])


def downgrade() -> None:
    # Index
    op.drop_index("idx_situation_lines_situation", table_name="situation_lines")
    op.drop_index("idx_situations_contract", table_name="situations")
    op.drop_index("idx_contracts_client", table_name="contracts")
    op.drop_index("idx_contracts_org", table_name="contracts")
    op.drop_index("idx_invoices_situation", table_name="invoices")
    op.drop_index("idx_invoices_contract", table_name="invoices")
    op.drop_index("idx_quotes_bpu_source", table_name="quotes")
    op.drop_index("idx_quotes_contract", table_name="quotes")

    # Colonnes
    op.drop_column("organizations", "module_contracts_enabled")
    op.drop_column("client_purchase_orders", "contract_id")
    op.drop_column("invoices", "situation_number")
    op.drop_column("invoices", "is_situation")
    op.drop_column("invoices", "situation_id")
    op.drop_column("invoices", "contract_id")
    op.drop_column("quote_lines", "reference")
    op.alter_column(
        "quotes", "document_type",
        type_=sa.String(100),
        server_default="Devis",
        existing_type=sa.String(20),
        existing_nullable=False,
    )
    op.drop_column("quotes", "bpu_source_id")
    op.drop_column("quotes", "avenant_number")
    op.drop_column("quotes", "is_avenant")
    op.drop_column("quotes", "contract_id")

    # Tables
    op.drop_table("situation_lines")
    op.drop_table("situations")
    op.drop_table("contracts")
