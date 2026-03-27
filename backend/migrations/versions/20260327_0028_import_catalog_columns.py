# Kerpta - Migration : colonnes catalogue sur document_import_lines
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Ajoute matched_product_id et import_action sur document_import_lines
pour le workflow d'import vers le catalogue produits.
"""

revision = "0028"
down_revision = "0027"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.add_column(
        "document_import_lines",
        sa.Column("matched_product_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_import_lines_product",
        "document_import_lines",
        "products",
        ["matched_product_id"],
        ["id"],
    )
    op.add_column(
        "document_import_lines",
        sa.Column(
            "import_action",
            sa.String(20),
            server_default="pending",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("document_import_lines", "import_action")
    op.drop_constraint("fk_import_lines_product", "document_import_lines", type_="foreignkey")
    op.drop_column("document_import_lines", "matched_product_id")
