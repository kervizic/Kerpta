# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout de billing_siret à la table organizations.

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("billing_siret", sa.CHAR(14), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "billing_siret")
