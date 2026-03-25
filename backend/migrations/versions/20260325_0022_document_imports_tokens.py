# Kerpta - Migration : ajout tokens_in/tokens_out sur document_imports
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Ajout colonnes tokens_in et tokens_out sur document_imports."""

revision = "20260325_0022"
down_revision = "20260325_0021"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column("document_imports", sa.Column("tokens_in", sa.Integer(), nullable=True))
    op.add_column("document_imports", sa.Column("tokens_out", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("document_imports", "tokens_out")
    op.drop_column("document_imports", "tokens_in")
