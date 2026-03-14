# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout colonne validated_at pour le workflow brouillon → validé → envoyé.

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-14
"""

from alembic import op
from sqlalchemy import text

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ"
    ))


def downgrade() -> None:
    op.drop_column("invoices", "validated_at")
