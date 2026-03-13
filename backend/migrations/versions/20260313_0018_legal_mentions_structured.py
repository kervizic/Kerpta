# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Mentions légales structurées sur les profils de facturation.

Remplace le champ texte libre par des données structurées permettant
de générer automatiquement les mentions légales conformes.

Nouveaux champs :
- vat_regime         : encaissements / debits / non_assujetti / franchise
- recovery_fee       : indemnité forfaitaire de recouvrement (défaut 40.00€)
- early_payment_discount : escompte pour paiement anticipé oui/non
- payment_note       : note libre de règlement (ex: affacturage)
- legal_mentions_auto: true = générer auto, false = texte libre

Revision ID: 0018
Revises: 0017
"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "billing_profiles",
        sa.Column("vat_regime", sa.String(20), nullable=False, server_default=sa.text("'encaissements'")),
    )
    op.add_column(
        "billing_profiles",
        sa.Column("recovery_fee", sa.Numeric(6, 2), nullable=False, server_default=sa.text("40.00")),
    )
    op.add_column(
        "billing_profiles",
        sa.Column("early_payment_discount", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "billing_profiles",
        sa.Column("payment_note", sa.Text, nullable=True),
    )
    op.add_column(
        "billing_profiles",
        sa.Column("legal_mentions_auto", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("billing_profiles", "legal_mentions_auto")
    op.drop_column("billing_profiles", "payment_note")
    op.drop_column("billing_profiles", "early_payment_discount")
    op.drop_column("billing_profiles", "recovery_fee")
    op.drop_column("billing_profiles", "vat_regime")
