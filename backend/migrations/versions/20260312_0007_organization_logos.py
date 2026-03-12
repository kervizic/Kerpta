# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Création de la table organization_logos.

Stockage du logo de chaque organisation dans une table dédiée pour éviter
de charger les données binaires lors des requêtes sur organizations.

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_logos",
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("logo_b64", sa.Text, nullable=False),
        sa.Column("original_name", sa.String(255), nullable=True),
        sa.Column("mime_type", sa.String(50), nullable=True),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column("width_px", sa.SmallInteger, nullable=True),
        sa.Column("height_px", sa.SmallInteger, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("organization_logos")
