# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Proforma numbering: number nullable + proforma_number on invoices.

Brouillons reçoivent un numéro PF-YYYY-NNNN à la création.
Le vrai numéro FA-YYYY-NNNN (ou AV-YYYY-NNNN pour les avoirs)
est attribué uniquement à la validation.

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rendre number nullable (sera rempli à la validation, plus à la création)
    op.alter_column("invoices", "number", existing_type=sa.String(50), nullable=True)
    # Ajouter le numéro de proforma
    op.add_column("invoices", sa.Column("proforma_number", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "proforma_number")
    op.alter_column("invoices", "number", existing_type=sa.String(50), nullable=False)
