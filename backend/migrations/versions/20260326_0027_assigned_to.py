# Kerpta - Migration : ajout colonne assigned_to sur les documents
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Ajoute assigned_to (UUID -> users) sur quotes, invoices, orders et document_imports."""

revision = "0027"
down_revision = "0026"

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("quotes", sa.Column("assigned_to", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_quotes_assigned_to", "quotes", "users", ["assigned_to"], ["id"])

    op.add_column("invoices", sa.Column("assigned_to", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_invoices_assigned_to", "invoices", "users", ["assigned_to"], ["id"])

    op.add_column("orders", sa.Column("assigned_to", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_orders_assigned_to", "orders", "users", ["assigned_to"], ["id"])

    op.add_column("document_imports", sa.Column("assigned_to", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_document_imports_assigned_to", "document_imports", "users", ["assigned_to"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_document_imports_assigned_to", "document_imports", type_="foreignkey")
    op.drop_column("document_imports", "assigned_to")

    op.drop_constraint("fk_orders_assigned_to", "orders", type_="foreignkey")
    op.drop_column("orders", "assigned_to")

    op.drop_constraint("fk_invoices_assigned_to", "invoices", type_="foreignkey")
    op.drop_column("invoices", "assigned_to")

    op.drop_constraint("fk_quotes_assigned_to", "quotes", type_="foreignkey")
    op.drop_column("quotes", "assigned_to")
