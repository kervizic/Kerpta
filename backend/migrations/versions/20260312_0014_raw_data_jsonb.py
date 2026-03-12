# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute raw_data JSONB sur companies et establishments.

Stocke la réponse brute de l'API recherche-entreprises pour ne perdre
aucune donnée (effectifs, CA, finances, catégorie entreprise, etc.).

Revision ID: 0014
Revises: 0013
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("raw_data", JSONB, nullable=True))
    op.add_column("establishments", sa.Column("raw_data", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("establishments", "raw_data")
    op.drop_column("companies", "raw_data")
