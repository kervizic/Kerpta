"""Ajout oauth_config, base_url et auth_url à platform_config

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-10 01:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ajout des colonnes OAuth sur platform_config
    op.add_column(
        "platform_config",
        sa.Column("base_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "platform_config",
        sa.Column("auth_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "platform_config",
        sa.Column(
            "oauth_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment=(
                "Config OAuth par provider. Structure : "
                '{provider: {enabled, client_id, client_secret, ...}}'
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column("platform_config", "oauth_config")
    op.drop_column("platform_config", "auth_url")
    op.drop_column("platform_config", "base_url")
