# Kerpta - Migration : ajout prompt envoye sur document_imports
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Ajout colonne prompt_sent sur document_imports pour debug/audit."""

revision = "0025"
down_revision = "0024"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column("document_imports", sa.Column("prompt_sent", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("document_imports", "prompt_sent")
