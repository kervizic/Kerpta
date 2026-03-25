# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute les champs de facturation avancee sur la table orders.

Champs ajoutes :
- order_type_id : reference vers order_types
- billing_mode : one_shot / progress / recurring
- recurring_* : parametres de facturation recurrente
- progress_total_pct : cumul facture en %
- retention_pct : retenue de garantie
"""

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    op.add_column("orders", sa.Column(
        "order_type_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("order_types.id"), nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "billing_mode", sa.String(20), server_default="one_shot", nullable=False,
    ))
    op.add_column("orders", sa.Column(
        "recurring_frequency", sa.String(20), nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "recurring_interval_days", sa.Integer, nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "recurring_day", sa.Integer, nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "recurring_start", sa.Date, nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "recurring_end", sa.Date, nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "recurring_next_date", sa.Date, nullable=True,
    ))
    op.add_column("orders", sa.Column(
        "progress_total_pct", sa.Numeric(5, 2), server_default="0", nullable=False,
    ))
    op.add_column("orders", sa.Column(
        "retention_pct", sa.Numeric(5, 2), server_default="0", nullable=False,
    ))

    op.create_index("ix_orders_order_type_id", "orders", ["order_type_id"])
    op.create_index("ix_orders_billing_mode", "orders", ["billing_mode"])
    op.create_index("ix_orders_recurring_next_date", "orders", ["recurring_next_date"])


def downgrade() -> None:
    op.drop_index("ix_orders_recurring_next_date")
    op.drop_index("ix_orders_billing_mode")
    op.drop_index("ix_orders_order_type_id")

    op.drop_column("orders", "retention_pct")
    op.drop_column("orders", "progress_total_pct")
    op.drop_column("orders", "recurring_next_date")
    op.drop_column("orders", "recurring_end")
    op.drop_column("orders", "recurring_start")
    op.drop_column("orders", "recurring_day")
    op.drop_column("orders", "recurring_interval_days")
    op.drop_column("orders", "recurring_frequency")
    op.drop_column("orders", "billing_mode")
    op.drop_column("orders", "order_type_id")
