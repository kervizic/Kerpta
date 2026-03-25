# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Cree la table order_types et insere les valeurs par defaut.

Types de commande configurables par organisation : Commande, Contrat,
Abonnement, Bail, Marche, chacun avec un mode de facturation
(one_shot, progress, recurring).
"""

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    # ── 1. Creer la table order_types ────────────────────────────────────
    op.create_table(
        "order_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("billing_mode", sa.String(20), server_default="one_shot", nullable=False),
        sa.Column("is_default", sa.Boolean, server_default="false", nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("is_archived", sa.Boolean, server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_order_types_organization_id", "order_types", ["organization_id"])

    # ── 2. Inserer les valeurs par defaut pour chaque organisation ───────
    op.execute("""
        INSERT INTO order_types (organization_id, label, billing_mode, is_default, position)
        SELECT id, 'Commande', 'one_shot', true, 0 FROM organizations
        UNION ALL
        SELECT id, 'Contrat', 'progress', false, 1 FROM organizations
        UNION ALL
        SELECT id, 'Abonnement', 'recurring', false, 2 FROM organizations
        UNION ALL
        SELECT id, 'Bail', 'recurring', false, 3 FROM organizations
        UNION ALL
        SELECT id, 'Marche', 'progress', false, 4 FROM organizations
    """)


def downgrade() -> None:
    op.drop_index("ix_order_types_organization_id")
    op.drop_table("order_types")
