# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout site web et toggle auto/manuel pour les informations légales.

- ``website`` : URL du site web de l'entreprise (toujours éditable)
- ``company_info_manual`` : si true, les informations légales sont
  gérées manuellement (pas synchronisées avec le registre SIRENE)

Revision ID: 0020
Revises: 0019
"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("website", sa.String(255), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "company_info_manual",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "company_info_manual")
    op.drop_column("organizations", "website")
