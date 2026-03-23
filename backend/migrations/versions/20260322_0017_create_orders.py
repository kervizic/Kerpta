# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Cree les tables orders, order_lines, order_quotes, order_invoices.

Remplace les anciennes tables client_purchase_orders / client_purchase_order_lines.
Migre les donnees existantes et supprime les anciennes tables.
"""

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    # ── 1. Creer la table orders ──────────────────────────────────────────
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_reference", sa.String(255), nullable=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("delivery_date", sa.Date, nullable=True),
        sa.Column("currency", sa.CHAR(3), server_default="EUR", nullable=False),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("discount_type", sa.String(10), server_default="none", nullable=False),
        sa.Column("discount_value", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("client_document_url", sa.Text, nullable=True),
        sa.Column("is_archived", sa.Boolean, server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_orders_organization_id", "orders", ["organization_id"])
    op.create_index("ix_orders_client_id", "orders", ["client_id"])
    op.create_index("ix_orders_status", "orders", ["status"])

    # ── 2. Creer la table order_lines ─────────────────────────────────────
    op.create_table(
        "order_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), nullable=False),
    )
    op.create_index("ix_order_lines_order_id", "order_lines", ["order_id"])

    # ── 3. Creer la table order_quotes (N:N) ──────────────────────────────
    op.create_table(
        "order_quotes",
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("quote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── 4. Creer la table order_invoices (N:N) ────────────────────────────
    op.create_table(
        "order_invoices",
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── 5. Migrer les donnees existantes ──────────────────────────────────
    # Migrer client_purchase_orders -> orders
    op.execute("""
        INSERT INTO orders (id, organization_id, client_id, contract_id, client_reference,
                            source, status, issue_date, delivery_date,
                            subtotal_ht, total_vat, total_ttc,
                            notes, is_archived, created_at, updated_at)
        SELECT id, organization_id, client_id, contract_id, client_reference,
               'client_document', status, issue_date, delivery_date,
               subtotal_ht, total_vat, total_ttc,
               notes, false, created_at, updated_at
        FROM client_purchase_orders
    """)

    # Migrer les lignes
    op.execute("""
        INSERT INTO order_lines (id, order_id, product_id, position, description,
                                 quantity, unit, unit_price, vat_rate,
                                 discount_percent, total_ht, total_vat)
        SELECT id, purchase_order_id, product_id, position, description,
               quantity, unit, unit_price, vat_rate,
               0, total_ht, total_vat
        FROM client_purchase_order_lines
    """)

    # Migrer les liens devis -> commandes (via quote_id sur l'ancien modele)
    op.execute("""
        INSERT INTO order_quotes (order_id, quote_id, created_at)
        SELECT id, quote_id, created_at
        FROM client_purchase_orders
        WHERE quote_id IS NOT NULL
    """)

    # Migrer les liens factures -> commandes (via purchase_order_id sur invoices)
    op.execute("""
        INSERT INTO order_invoices (order_id, invoice_id, created_at)
        SELECT i.purchase_order_id, i.id, i.created_at
        FROM invoices i
        WHERE i.purchase_order_id IS NOT NULL
    """)

    # ── 6. Supprimer la colonne purchase_order_id de invoices ─────────────
    op.drop_constraint("invoices_purchase_order_id_fkey", "invoices", type_="foreignkey")
    op.drop_column("invoices", "purchase_order_id")

    # ── 7. Supprimer les anciennes tables ─────────────────────────────────
    op.drop_table("client_purchase_order_lines")
    op.drop_table("client_purchase_orders")


def downgrade() -> None:
    # Recreer les anciennes tables (vides)
    op.create_table(
        "client_purchase_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("quote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("quotes.id"), nullable=True),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("client_reference", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default="received", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("delivery_date", sa.Date, nullable=True),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "client_purchase_order_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("client_purchase_orders.id"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), nullable=False),
    )

    # Remettre purchase_order_id sur invoices
    op.add_column("invoices", sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("invoices_purchase_order_id_fkey", "invoices", "client_purchase_orders", ["purchase_order_id"], ["id"])

    # Supprimer les nouvelles tables
    op.drop_table("order_invoices")
    op.drop_table("order_quotes")
    op.drop_table("order_lines")
    op.drop_table("orders")
