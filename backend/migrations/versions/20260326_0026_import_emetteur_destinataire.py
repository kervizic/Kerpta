# Kerpta - Migration : separation emetteur/destinataire sur document_imports
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0

"""Renomme les colonnes extracted_client_* en extracted_emetteur_*
et ajoute les colonnes extracted_destinataire_* pour suivre la structure Factur-X.
"""

revision = "0026"
down_revision = "0025"

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Renommer les colonnes client existantes en emetteur
    op.alter_column("document_imports", "extracted_client_name",
                    new_column_name="extracted_emetteur_name")
    op.alter_column("document_imports", "extracted_client_siret",
                    new_column_name="extracted_emetteur_siret")
    op.alter_column("document_imports", "extracted_client_siren",
                    new_column_name="extracted_emetteur_siren")
    op.alter_column("document_imports", "extracted_client_tva",
                    new_column_name="extracted_emetteur_tva")
    op.alter_column("document_imports", "extracted_client_address",
                    new_column_name="extracted_emetteur_address")

    # Ajouter les colonnes destinataire
    op.add_column("document_imports",
                  sa.Column("extracted_destinataire_name", sa.String(255), nullable=True))
    op.add_column("document_imports",
                  sa.Column("extracted_destinataire_siret", sa.String(14), nullable=True))
    op.add_column("document_imports",
                  sa.Column("extracted_destinataire_siren", sa.String(9), nullable=True))
    op.add_column("document_imports",
                  sa.Column("extracted_destinataire_tva", sa.String(20), nullable=True))
    op.add_column("document_imports",
                  sa.Column("extracted_destinataire_address", sa.Text(), nullable=True))


def downgrade() -> None:
    # Supprimer les colonnes destinataire
    op.drop_column("document_imports", "extracted_destinataire_address")
    op.drop_column("document_imports", "extracted_destinataire_tva")
    op.drop_column("document_imports", "extracted_destinataire_siren")
    op.drop_column("document_imports", "extracted_destinataire_siret")
    op.drop_column("document_imports", "extracted_destinataire_name")

    # Renommer les colonnes emetteur en client
    op.alter_column("document_imports", "extracted_emetteur_name",
                    new_column_name="extracted_client_name")
    op.alter_column("document_imports", "extracted_emetteur_siret",
                    new_column_name="extracted_client_siret")
    op.alter_column("document_imports", "extracted_emetteur_siren",
                    new_column_name="extracted_client_siren")
    op.alter_column("document_imports", "extracted_emetteur_tva",
                    new_column_name="extracted_client_tva")
    op.alter_column("document_imports", "extracted_emetteur_address",
                    new_column_name="extracted_client_address")
