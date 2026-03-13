# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Add customer_reference and purchase_order_number to invoices.

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("customer_reference", sa.String(255), nullable=True))
    op.add_column("invoices", sa.Column("purchase_order_number", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "purchase_order_number")
    op.drop_column("invoices", "customer_reference")
