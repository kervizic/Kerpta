# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Ajoute le champ ai_extraction_prompt dans platform_config.

Permet de personnaliser le prompt d'extraction VLM depuis l'admin.
"""

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("platform_config", sa.Column(
        "ai_extraction_prompt", sa.Text, nullable=True,
    ))


def downgrade() -> None:
    op.drop_column("platform_config", "ai_extraction_prompt")
