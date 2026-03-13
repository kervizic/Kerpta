# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Add snapshot columns to invoices for immutability.

Stores client and seller identity at time of sending, so the invoice
can be reproduced identically even if the source data changes.
Also adds legal_mentions column.

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("legal_mentions", sa.Text, nullable=True))
    op.add_column("invoices", sa.Column("client_snapshot", postgresql.JSONB, nullable=True))
    op.add_column("invoices", sa.Column("seller_snapshot", postgresql.JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "seller_snapshot")
    op.drop_column("invoices", "client_snapshot")
    op.drop_column("invoices", "legal_mentions")
