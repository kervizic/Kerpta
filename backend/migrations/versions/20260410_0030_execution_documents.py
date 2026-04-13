# Kerpta - Migration : refonte documents d'execution
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Refonte documents d'execution - table unifiee pour commandes, BL,
attachements et situations d'avancement.

Supprime : situation_lines, situations, order_invoices, order_quotes,
           order_lines, orders, order_types.
Cree    : execution_documents, execution_lines, execution_links.
Modifie : invoices (execution_document_id), organizations (enabled_exec_types),
          quotes (type attachement -> devis).
"""

revision = "0030"
down_revision = "0029"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


def upgrade() -> None:
    # ── 0. Supprimer les FK qui pointent vers les tables a dropper ──────────
    op.drop_constraint("invoices_situation_id_fkey", "invoices", type_="foreignkey")
    op.drop_column("invoices", "situation_id")

    # ── 1. Supprimer les anciennes tables (ordre FK) ────────────────────────
    op.drop_table("situation_lines")
    op.drop_table("situations")
    op.drop_table("order_invoices")
    op.drop_table("order_quotes")
    op.drop_table("order_lines")
    op.drop_table("orders")
    op.drop_table("order_types")

    # ── 2. Creer execution_documents ────────────────────────────────────────
    op.create_table(
        "execution_documents",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exec_type", sa.String(20), nullable=False),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_quote_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("period_label", sa.String(255), nullable=True),
        sa.Column("client_reference", sa.String(255), nullable=True),
        sa.Column("observation_date", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("billing_profile_id", UUID(as_uuid=True), sa.ForeignKey("billing_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("discount_type", sa.String(10), server_default="none", nullable=False),
        sa.Column("discount_value", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("situation_number", sa.Integer, nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_archived", sa.Boolean, server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "number"),
        sa.CheckConstraint("exec_type IN ('order', 'delivery', 'work_report', 'progress')", name="check_exec_type"),
        sa.CheckConstraint("status IN ('draft', 'validated', 'invoiced')", name="check_exec_status"),
    )

    op.create_index("ix_exec_docs_org_type", "execution_documents", ["organization_id", "exec_type"])
    op.create_index("ix_exec_docs_org_status", "execution_documents", ["organization_id", "status"])
    op.create_index("ix_exec_docs_source_quote", "execution_documents", ["source_quote_id"], postgresql_where=sa.text("source_quote_id IS NOT NULL"))
    op.create_index("ix_exec_docs_contract", "execution_documents", ["contract_id"], postgresql_where=sa.text("contract_id IS NOT NULL"))
    op.create_index("ix_exec_docs_client", "execution_documents", ["client_id"], postgresql_where=sa.text("client_id IS NOT NULL"))

    # ── 3. Creer execution_lines ────────────────────────────────────────────
    op.create_table(
        "execution_lines",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("execution_document_id", UUID(as_uuid=True), sa.ForeignKey("execution_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_line_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_quote_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), server_default="0", nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0", nullable=True),
        # Champs quantite (order, delivery, work_report)
        sa.Column("quantity", sa.Numeric(15, 4), server_default="0", nullable=True),
        sa.Column("total_ht", sa.Numeric(15, 2), server_default="0", nullable=True),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=True),
        # Champs avancement (progress)
        sa.Column("total_contract", sa.Numeric(15, 2), server_default="0", nullable=True),
        sa.Column("previous_pct", sa.Numeric(5, 2), server_default="0", nullable=True),
        sa.Column("current_pct", sa.Numeric(5, 2), server_default="0", nullable=True),
        sa.Column("cumulative_amount", sa.Numeric(15, 2), server_default="0", nullable=True),
        sa.Column("previously_invoiced", sa.Numeric(15, 2), server_default="0", nullable=True),
        sa.Column("line_invoice_amount", sa.Numeric(15, 2), server_default="0", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("current_pct BETWEEN 0 AND 100", name="check_current_pct"),
        sa.CheckConstraint("previous_pct BETWEEN 0 AND 100", name="check_previous_pct"),
    )

    op.create_index("ix_exec_lines_doc", "execution_lines", ["execution_document_id"])
    op.create_index("ix_exec_lines_source_quote", "execution_lines", ["source_quote_id"], postgresql_where=sa.text("source_quote_id IS NOT NULL"))

    # ── 4. Creer execution_links ────────────────────────────────────────────
    op.create_table(
        "execution_links",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("execution_a_id", UUID(as_uuid=True), sa.ForeignKey("execution_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("execution_b_id", UUID(as_uuid=True), sa.ForeignKey("execution_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("link_type", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("execution_a_id", "execution_b_id"),
        sa.CheckConstraint("execution_a_id != execution_b_id", name="check_no_self_link"),
        sa.CheckConstraint("link_type IN ('fulfills', 'consolidates')", name="check_link_type"),
    )

    op.create_index("ix_exec_links_a", "execution_links", ["execution_a_id"])
    op.create_index("ix_exec_links_b", "execution_links", ["execution_b_id"])

    # ── 5. Modifier invoices (ajouter execution_document_id) ──────────────
    op.add_column(
        "invoices",
        sa.Column(
            "execution_document_id",
            UUID(as_uuid=True),
            sa.ForeignKey("execution_documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # ── 6. Modifier organizations ───────────────────────────────────────────
    op.add_column(
        "organizations",
        sa.Column(
            "enabled_exec_types",
            JSONB,
            server_default='["order"]',
            nullable=False,
        ),
    )

    # Mettre a jour quote_document_types par defaut (retirer Attachement)
    op.execute("""
        UPDATE organizations
        SET quote_document_types = '["Devis", "BPU"]'::jsonb
        WHERE quote_document_types = '["Devis", "Attachement", "BPU"]'::jsonb
    """)

    # ── 7. Nettoyer les quotes de type attachement ──────────────────────────
    op.execute("""
        UPDATE quotes SET document_type = 'devis'
        WHERE document_type = 'attachement'
    """)


def downgrade() -> None:
    # Restaurer situation_id sur invoices
    op.add_column(
        "invoices",
        sa.Column("situation_id", UUID(as_uuid=True), nullable=True),
    )
    op.drop_column("invoices", "execution_document_id")

    # Supprimer enabled_exec_types
    op.drop_column("organizations", "enabled_exec_types")

    # Supprimer les nouvelles tables
    op.drop_table("execution_links")
    op.drop_table("execution_lines")
    op.drop_table("execution_documents")

    # Note : les anciennes tables (orders, situations, etc.) ne sont pas
    # recrees dans le downgrade car les donnees sont perdues.
