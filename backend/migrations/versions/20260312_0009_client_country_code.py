# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout de country_code sur clients et suppliers.

- country_code CHAR(2) DEFAULT 'FR' — code pays ISO 3166-1 alpha-2
- Permet de distinguer les sociétés françaises liées au SIRENE,
  les sociétés françaises saisies manuellement (SIREN non trouvé),
  et les sociétés étrangères (UE ou hors UE).

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ajout country_code sur clients
    op.add_column(
        "clients",
        sa.Column(
            "country_code",
            sa.CHAR(2),
            nullable=False,
            server_default="FR",
        ),
    )

    # Ajout country_code sur suppliers
    op.add_column(
        "suppliers",
        sa.Column(
            "country_code",
            sa.CHAR(2),
            nullable=False,
            server_default="FR",
        ),
    )

    # Index pour filtrer/grouper par pays
    op.create_index("idx_clients_country", "clients", ["country_code"])
    op.create_index("idx_suppliers_country", "suppliers", ["country_code"])


def downgrade() -> None:
    op.drop_index("idx_suppliers_country", table_name="suppliers")
    op.drop_index("idx_clients_country", table_name="clients")
    op.drop_column("suppliers", "country_code")
    op.drop_column("clients", "country_code")
