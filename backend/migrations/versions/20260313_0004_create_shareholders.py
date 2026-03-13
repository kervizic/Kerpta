# Kerpta — Migration : tables shareholders et shareholder_representatives
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Création des tables shareholders et shareholder_representatives

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-13 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shareholders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(10), nullable=False, server_default="physical"),
        # Personne physique
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        # Personne morale
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("company_siren", sa.String(9), nullable=True),
        # Commun
        sa.Column("address", JSONB, nullable=True),
        sa.Column("quality", sa.String(100), nullable=True),
        sa.Column("shares_count", sa.Integer, nullable=True),
        sa.Column("ownership_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("entry_date", sa.Date, nullable=True),
        sa.Column("exit_date", sa.Date, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "shareholder_representatives",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "shareholder_id",
            UUID(as_uuid=True),
            sa.ForeignKey("shareholders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("quality", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("shareholder_representatives")
    op.drop_table("shareholders")
