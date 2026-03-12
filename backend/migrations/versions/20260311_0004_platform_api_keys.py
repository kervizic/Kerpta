# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout de la colonne api_keys JSONB à platform_config.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "platform_config",
        sa.Column("api_keys", JSONB, nullable=True, comment="Clés API externes (INSEE, etc.)"),
    )


def downgrade() -> None:
    op.drop_column("platform_config", "api_keys")
