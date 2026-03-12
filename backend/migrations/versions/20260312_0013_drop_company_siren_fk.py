# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Supprime la FK company_siren → companies.siren sur clients et suppliers.

La FK empêchait de créer un client avec un SIREN non encore présent dans
le cache SIRENE (table companies remplie par Celery nightly). On garde la
colonne CHAR(9) pour stocker le SIREN, mais sans contrainte FK.
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Supprimer les FK (nom auto-généré par Alembic/SA)
    # clients.company_siren → companies.siren
    op.drop_constraint(
        "clients_company_siren_fkey", "clients", type_="foreignkey"
    )
    # suppliers.company_siren → companies.siren
    op.drop_constraint(
        "suppliers_company_siren_fkey", "suppliers", type_="foreignkey"
    )


def downgrade() -> None:
    op.create_foreign_key(
        "clients_company_siren_fkey",
        "clients",
        "companies",
        ["company_siren"],
        ["siren"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "suppliers_company_siren_fkey",
        "suppliers",
        "companies",
        ["company_siren"],
        ["siren"],
        ondelete="SET NULL",
    )
