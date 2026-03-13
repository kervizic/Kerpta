# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Remplacement du toggle global ``company_info_manual`` par
``manual_fields`` (JSONB array) pour un contrôle par champ.

Chaque champ synchronisable peut être individuellement en mode auto
(synchronisé SIRENE) ou manuel (éditable librement).

Champs synchronisables : name, legal_form, siren, siret,
vat_number, ape_code, address.

Migration des données : si ``company_info_manual`` était true,
tous les champs synchronisables passent en manuel.

Revision ID: 0021
Revises: 0020
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

# Liste des champs synchronisables depuis data.gouv / SIRENE
_SYNCABLE_FIELDS = '["name", "legal_form", "siren", "siret", "vat_number", "ape_code", "address"]'


def upgrade() -> None:
    # 1. Ajouter la colonne manual_fields (JSONB array, défaut [])
    op.add_column(
        "organizations",
        sa.Column(
            "manual_fields",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # 2. Migrer les données : company_info_manual=true → tous les champs synchronisables en manuel
    op.execute(
        sa.text(
            f"UPDATE organizations SET manual_fields = '{_SYNCABLE_FIELDS}'::jsonb "
            "WHERE company_info_manual = true"
        )
    )

    # 3. Supprimer l'ancienne colonne
    op.drop_column("organizations", "company_info_manual")


def downgrade() -> None:
    # 1. Recréer la colonne company_info_manual
    op.add_column(
        "organizations",
        sa.Column(
            "company_info_manual",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # 2. Migrer les données : si manual_fields n'est pas vide → company_info_manual = true
    op.execute(
        sa.text(
            "UPDATE organizations SET company_info_manual = true "
            "WHERE manual_fields != '[]'::jsonb"
        )
    )

    # 3. Supprimer manual_fields
    op.drop_column("organizations", "manual_fields")
