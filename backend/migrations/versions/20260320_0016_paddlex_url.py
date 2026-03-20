# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute ai_paddlex_url dans platform_config pour le serveur OCR distant."""

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "platform_config",
        sa.Column(
            "ai_paddlex_url",
            sa.String(255),
            nullable=True,
            comment="URL du serveur PaddleX Serving pour OCR (ex: http://192.168.1.100:12321)",
        ),
    )


def downgrade() -> None:
    op.drop_column("platform_config", "ai_paddlex_url")
