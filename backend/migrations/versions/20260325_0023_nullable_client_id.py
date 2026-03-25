# Kerpta - Migration : client_id nullable sur quotes, invoices, orders
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Rendre client_id nullable sur quotes, invoices, orders.

Permet de creer des brouillons sans client (import IA).
"""

revision = "0023"
down_revision = "0022"

from alembic import op


def upgrade():
    op.alter_column("quotes", "client_id", nullable=True)
    op.alter_column("invoices", "client_id", nullable=True)
    op.alter_column("orders", "client_id", nullable=True)


def downgrade():
    op.alter_column("orders", "client_id", nullable=False)
    op.alter_column("invoices", "client_id", nullable=False)
    op.alter_column("quotes", "client_id", nullable=False)
