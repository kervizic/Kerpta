# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute le type de délai de paiement aux profils de facturation.

payment_term_type : 'net' (défaut), 'end_of_month', 'end_of_month_the'
payment_term_day  : jour du mois pour 'end_of_month_the' (ex: 15)

Revision ID: 0017
Revises: 0016
"""

from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "billing_profiles",
        sa.Column(
            "payment_term_type",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'net'"),
        ),
    )
    op.add_column(
        "billing_profiles",
        sa.Column("payment_term_day", sa.Integer, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("billing_profiles", "payment_term_day")
    op.drop_column("billing_profiles", "payment_term_type")
