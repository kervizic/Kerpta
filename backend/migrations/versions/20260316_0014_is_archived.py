# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout du champ is_archived sur quotes et invoices."""

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("quotes", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("invoices", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_quotes_archived", "quotes", ["organization_id", "is_archived"])
    op.create_index("ix_invoices_archived", "invoices", ["organization_id", "is_archived"])


def downgrade() -> None:
    op.drop_index("ix_invoices_archived", "invoices")
    op.drop_index("ix_quotes_archived", "quotes")
    op.drop_column("invoices", "is_archived")
    op.drop_column("quotes", "is_archived")
