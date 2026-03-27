# Kerpta - Migration : extraction asynchrone (status + error_message)
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Ajoute extraction_status et error_message sur document_imports
pour le suivi de l'extraction asynchrone via Celery.
"""

revision = "0029"
down_revision = "0028"

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "document_imports",
        sa.Column(
            "extraction_status",
            sa.String(20),
            server_default="done",
            nullable=False,
        ),
    )
    op.add_column(
        "document_imports",
        sa.Column("error_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("document_imports", "error_message")
    op.drop_column("document_imports", "extraction_status")
