# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Cache SIRENE local + thumbnail logo.

- Ajout de logo_thumb_b64 sur organization_logos (miniature 64×64 pour la sidebar)
- Création de la table companies (cache SIREN depuis l'API SIRENE/recherche-entreprises)
- Création de la table establishments (cache SIRET avec statut actif/fermé)
- Ajout de company_siren (FK nullable) sur clients et suppliers

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Logo thumbnail ──────────────────────────────────────────────────────────
    op.add_column(
        "organization_logos",
        sa.Column("logo_thumb_b64", sa.Text, nullable=True),
    )

    # ── Table companies (cache SIREN) ───────────────────────────────────────────
    # Une ligne par SIREN — alimentée par le job Celery Beat nocturne.
    # Statut : active | closed (mappe etat_administratif A/F de l'INSEE)
    op.create_table(
        "companies",
        sa.Column("siren", sa.CHAR(9), primary_key=True, nullable=False),
        sa.Column("denomination", sa.String(500), nullable=True),
        sa.Column("sigle", sa.String(100), nullable=True),
        sa.Column("legal_form_code", sa.String(10), nullable=True),   # code catégorie juridique INSEE
        sa.Column("legal_form", sa.String(50), nullable=True),         # libellé ex: "SAS"
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("ape_code", sa.String(10), nullable=True),
        sa.Column("rcs_city", sa.String(100), nullable=True),
        sa.Column("capital", sa.Numeric(15, 2), nullable=True),
        sa.Column("creation_date", sa.Date, nullable=True),
        sa.Column("closure_date", sa.Date, nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),  # active | closed
        sa.Column(
            "last_synced_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
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
    op.create_index("idx_companies_status", "companies", ["status"])

    # ── Table establishments (cache SIRET avec statut) ──────────────────────────
    # Une ligne par SIRET — statut mis à jour chaque nuit par le job SIRENE.
    # Règle métier : billing_siret doit pointer vers un établissement status='active'.
    op.create_table(
        "establishments",
        sa.Column("siret", sa.CHAR(14), primary_key=True, nullable=False),
        sa.Column(
            "siren",
            sa.CHAR(9),
            sa.ForeignKey("companies.siren", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nic", sa.CHAR(5), nullable=True),
        sa.Column("is_siege", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),  # active | closed
        sa.Column("address", JSONB, nullable=True),
        sa.Column("activite_principale", sa.String(10), nullable=True),
        sa.Column("closure_date", sa.Date, nullable=True),
        sa.Column(
            "last_synced_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
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
    op.create_index("idx_establishments_siren", "establishments", ["siren"])
    op.create_index("idx_establishments_status", "establishments", ["status"])

    # ── FK company_siren sur clients ────────────────────────────────────────────
    # Nullable — lien optionnel vers le cache SIREN pour les clients de type 'company'.
    # Mis à jour lors du sync SIRENE ou lors de la saisie d'un SIREN client.
    op.add_column(
        "clients",
        sa.Column(
            "company_siren",
            sa.CHAR(9),
            sa.ForeignKey("companies.siren", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_clients_company_siren", "clients", ["company_siren"])

    # ── FK company_siren sur suppliers ──────────────────────────────────────────
    op.add_column(
        "suppliers",
        sa.Column(
            "company_siren",
            sa.CHAR(9),
            sa.ForeignKey("companies.siren", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_suppliers_company_siren", "suppliers", ["company_siren"])


def downgrade() -> None:
    op.drop_index("idx_suppliers_company_siren", table_name="suppliers")
    op.drop_column("suppliers", "company_siren")
    op.drop_index("idx_clients_company_siren", table_name="clients")
    op.drop_column("clients", "company_siren")
    op.drop_index("idx_establishments_status", table_name="establishments")
    op.drop_index("idx_establishments_siren", table_name="establishments")
    op.drop_table("establishments")
    op.drop_index("idx_companies_status", table_name="companies")
    op.drop_table("companies")
    op.drop_column("organization_logos", "logo_thumb_b64")
