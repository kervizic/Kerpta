# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Déplace l'exigibilité TVA des profils de facturation vers l'organisation.

L'exigibilité de la TVA (encaissements / débits) est un choix fiscal de
l'entreprise, pas un paramètre par profil de facturation.

- Ajout de ``vat_exigibility`` sur ``organizations`` (défaut 'encaissements')
- Suppression de ``vat_regime`` sur ``billing_profiles``

Revision ID: 0019
Revises: 0018
"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ajouter vat_exigibility à organizations
    op.add_column(
        "organizations",
        sa.Column(
            "vat_exigibility",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'encaissements'"),
        ),
    )

    # Migrer les données : copier la valeur du profil par défaut vers l'org
    op.execute(sa.text("""
        UPDATE organizations o
        SET vat_exigibility = bp.vat_regime
        FROM billing_profiles bp
        WHERE bp.organization_id = o.id
          AND bp.is_default = true
          AND bp.vat_regime IN ('encaissements', 'debits')
    """))

    # Supprimer vat_regime de billing_profiles
    op.drop_column("billing_profiles", "vat_regime")


def downgrade() -> None:
    # Recréer vat_regime sur billing_profiles
    op.add_column(
        "billing_profiles",
        sa.Column(
            "vat_regime",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'encaissements'"),
        ),
    )

    # Copier la valeur de l'org vers tous les profils
    op.execute(sa.text("""
        UPDATE billing_profiles bp
        SET vat_regime = o.vat_exigibility
        FROM organizations o
        WHERE o.id = bp.organization_id
    """))

    # Supprimer vat_exigibility de organizations
    op.drop_column("organizations", "vat_exigibility")
