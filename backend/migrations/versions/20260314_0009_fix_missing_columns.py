# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Fix missing columns from migrations 0007/0008 that were skipped.

Uses IF NOT EXISTS to be idempotent — safe to run even if columns already exist.

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-14
"""

from alembic import op
from sqlalchemy import text

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Colonnes de la migration 0007 (invoice_snapshots)
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_name VARCHAR(255)"))
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_profile_name VARCHAR(100)"))
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS legal_mentions TEXT"))
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_snapshot JSONB"))
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_snapshot JSONB"))
    conn.execute(text("ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS reference VARCHAR(100)"))

    # Colonnes de la migration 0008 (invoice_references)
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_reference VARCHAR(255)"))
    conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(255)"))


def downgrade() -> None:
    # Rien à faire — migration corrective idempotente
    pass
