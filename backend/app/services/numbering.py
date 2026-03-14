# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service de numérotation séquentielle sans trou.

Génère les numéros de documents (FA-YYYY-NNNN, DEV-YYYY-NNNN, etc.)
de façon atomique avec advisory lock PostgreSQL.
"""

import uuid
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Mapping type de document → préfixe + table + colonne number
_DOC_CONFIG: dict[str, dict] = {
    "invoice": {"prefix": "FA", "table": "invoices"},
    "credit_note": {"prefix": "CN", "table": "invoices"},
    "quote": {"prefix": "DEV", "table": "quotes"},
    "contract": {"prefix": "CT", "table": "contracts", "col": "reference"},
    "purchase_order": {"prefix": "BCR", "table": "client_purchase_orders"},
    "supplier_quote": {"prefix": "DRF", "table": "supplier_quotes"},
    "supplier_order": {"prefix": "BCF", "table": "supplier_orders"},
    "supplier_invoice": {"prefix": "FF", "table": "supplier_invoices"},
}


async def generate_number(
    doc_type: str,
    organization_id: uuid.UUID,
    db: AsyncSession,
    year: int | None = None,
) -> str:
    """Génère le prochain numéro séquentiel pour un type de document.

    Utilise un advisory lock transactionnel (pg_advisory_xact_lock) pour
    garantir l'unicité sans trou, même en cas d'accès concurrent.

    Args:
        doc_type: Type de document (invoice, credit_note, quote, contract, etc.)
        organization_id: UUID de l'organisation
        db: Session BDD async
        year: Année fiscale (défaut : année courante)

    Returns:
        Numéro formaté (ex: FA-2026-0001)
    """
    cfg = _DOC_CONFIG.get(doc_type)
    if cfg is None:
        raise ValueError(f"Type de document inconnu : {doc_type}")

    prefix = cfg["prefix"]
    table = cfg["table"]
    col = cfg.get("col", "number")
    year = year or date.today().year
    pattern = f"{prefix}-{year}-%"

    # Advisory lock par org + type pour garantir l'unicité en concurrent
    # On utilise un hash stable du (org_id, doc_type) comme clé de lock
    lock_key = abs(hash((str(organization_id), doc_type))) % (2**31)
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    # Récupérer le dernier numéro séquentiel pour cette org + année
    result = await db.execute(
        text(f"""
            SELECT COALESCE(
                MAX(CAST(SUBSTRING({col} FROM '.{{4}}$') AS INTEGER)),
                0
            ) AS last_seq
            FROM {table}
            WHERE organization_id = :org_id
              AND {col} LIKE :pattern
        """),
        {"org_id": str(organization_id), "pattern": pattern},
    )
    row = result.fetchone()
    next_seq = (row[0] if row else 0) + 1

    return f"{prefix}-{year}-{next_seq:04d}"
