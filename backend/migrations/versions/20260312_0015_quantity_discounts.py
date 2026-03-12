# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute la table product_quantity_discounts pour les paliers de remise quantité.

Permet de définir des remises automatiques basées sur la quantité commandée,
avec support de paliers généraux et client-spécifiques.

Revision ID: 0015
Revises: 0014
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_quantity_discounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=True),
        sa.Column("min_quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_pqd_product", "product_quantity_discounts", ["product_id"])
    op.create_index("ix_pqd_org", "product_quantity_discounts", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_pqd_org", table_name="product_quantity_discounts")
    op.drop_index("ix_pqd_product", table_name="product_quantity_discounts")
    op.drop_table("product_quantity_discounts")
