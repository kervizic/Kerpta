# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajout du champ rib_attachment_id sur bank_accounts.

Permet d'attacher un PDF de RIB à chaque compte bancaire.
Le fichier est stocké sur S3 dans Kerpta/{SIREN}/config/.

Revision ID: 0013
Revises: 0012
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column(
            "rib_attachment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("bank_accounts", "rib_attachment_id")
