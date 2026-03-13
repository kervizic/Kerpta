# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Add snapshot columns to invoices for immutability.

Copies client name, billing profile name, and legal mentions directly
on the invoice so it can be reproduced identically even if source data changes.
Also adds reference column to invoice_lines and JSONB snapshots for PDF generation.

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
    # Snapshot colonnes sur invoices
    op.add_column("invoices", sa.Column("client_name", sa.String(255), nullable=True))
    op.add_column("invoices", sa.Column("billing_profile_name", sa.String(100), nullable=True))
    op.add_column("invoices", sa.Column("legal_mentions", sa.Text, nullable=True))
    op.add_column("invoices", sa.Column("client_snapshot", postgresql.JSONB, nullable=True))
    op.add_column("invoices", sa.Column("seller_snapshot", postgresql.JSONB, nullable=True))

    # Référence article sur les lignes de facture
    op.add_column("invoice_lines", sa.Column("reference", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("invoice_lines", "reference")
    op.drop_column("invoices", "seller_snapshot")
    op.drop_column("invoices", "client_snapshot")
    op.drop_column("invoices", "legal_mentions")
    op.drop_column("invoices", "billing_profile_name")
    op.drop_column("invoices", "client_name")
