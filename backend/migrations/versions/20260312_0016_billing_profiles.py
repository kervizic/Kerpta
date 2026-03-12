# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute les tables billing (comptes bancaires, profils, unités).

Permet de configurer les informations de paiement et mentions légales
utilisées sur les devis et factures. Les unités personnalisées remplacent
le champ texte libre pour les unités de mesure.

Revision ID: 0016
Revises: 0015
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Comptes bancaires
    op.create_table(
        "bank_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("bank_name", sa.String(100), nullable=True),
        sa.Column("iban", sa.String(34), nullable=False),
        sa.Column("bic", sa.String(11), nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ba_org", "bank_accounts", ["organization_id"])

    # Profils de facturation
    op.create_table(
        "billing_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id"), nullable=True),
        sa.Column("payment_terms", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("late_penalty_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("discount_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("legal_mentions", sa.Text, nullable=True),
        sa.Column("footer", sa.Text, nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_bp_org", "billing_profiles", ["organization_id"])

    # Unités personnalisées
    op.create_table(
        "custom_units",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.UniqueConstraint("organization_id", "label"),
    )

    # billing_profile_id sur quotes et invoices
    op.add_column("quotes", sa.Column("billing_profile_id", UUID(as_uuid=True), sa.ForeignKey("billing_profiles.id"), nullable=True))
    op.add_column("invoices", sa.Column("billing_profile_id", UUID(as_uuid=True), sa.ForeignKey("billing_profiles.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "billing_profile_id")
    op.drop_column("quotes", "billing_profile_id")
    op.drop_table("custom_units")
    op.drop_index("ix_bp_org", table_name="billing_profiles")
    op.drop_table("billing_profiles")
    op.drop_index("ix_ba_org", table_name="bank_accounts")
    op.drop_table("bank_accounts")
