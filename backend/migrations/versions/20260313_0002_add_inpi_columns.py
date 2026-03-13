"""Ajout colonnes INPI sur organizations (capital_variable, objet_social, dates)

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-13 00:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("capital_variable", sa.Boolean, nullable=True))
    op.add_column("organizations", sa.Column("objet_social", sa.Text, nullable=True))
    op.add_column("organizations", sa.Column("date_cloture_exercice", sa.String(4), nullable=True))
    op.add_column("organizations", sa.Column("date_immatriculation_rcs", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "date_immatriculation_rcs")
    op.drop_column("organizations", "date_cloture_exercice")
    op.drop_column("organizations", "objet_social")
    op.drop_column("organizations", "capital_variable")
