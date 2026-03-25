# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Tache Celery - Facturation recurrente.

Genere des factures brouillon pour les commandes recurrentes
dont l'echeance est atteinte ou depassee.
"""

import logging
import uuid
from datetime import date, timedelta

from app.tasks.celery_app import celery

_log = logging.getLogger(__name__)


def _compute_next_date(current: date, frequency: str, interval_days: int | None = None) -> date:
    """Calcule la prochaine date d'echeance selon la frequence."""
    if frequency == "weekly":
        return current + timedelta(weeks=1)
    elif frequency == "monthly":
        # Meme jour du mois suivant
        month = current.month + 1
        year = current.year
        if month > 12:
            month = 1
            year += 1
        day = min(current.day, 28)  # Securite fin de mois
        return date(year, month, day)
    elif frequency == "quarterly":
        month = current.month + 3
        year = current.year
        while month > 12:
            month -= 12
            year += 1
        day = min(current.day, 28)
        return date(year, month, day)
    elif frequency == "biannual":
        month = current.month + 6
        year = current.year
        while month > 12:
            month -= 12
            year += 1
        day = min(current.day, 28)
        return date(year, month, day)
    elif frequency == "yearly":
        return date(current.year + 1, current.month, min(current.day, 28))
    elif frequency == "custom" and interval_days:
        return current + timedelta(days=interval_days)
    else:
        # Fallback : mensuel
        return _compute_next_date(current, "monthly")


@celery.task(name="app.tasks.recurring_invoices.generate_recurring_invoices")
def generate_recurring_invoices():
    """Cree des factures brouillon pour les commandes recurrentes dont l'echeance est aujourd'hui.

    1. Cherche les commandes avec billing_mode='recurring'
       ET recurring_next_date <= today
       ET status IN ('confirmed', 'partially_invoiced')
    2. Pour chaque commande :
       - Cree une facture brouillon avec les lignes de la commande
       - Met a jour recurring_next_date selon la frequence
    3. Logue le nombre de factures creees

    La facture creee est TOUJOURS en brouillon (draft).
    """
    import asyncio
    asyncio.run(_generate_recurring_invoices_async())


async def _generate_recurring_invoices_async():
    """Implementation async de la generation de factures recurrentes."""
    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal as async_session_factory
    from app.schemas.invoices import InvoiceCreate, InvoiceLineIn
    from app.services.invoices import create_invoice

    today = date.today()
    invoices_created = 0

    async with async_session_factory() as db:
        # Chercher les commandes recurrentes a facturer
        result = await db.execute(
            text("""
                SELECT o.id::text, o.organization_id::text, o.client_id::text,
                       o.contract_id::text, o.client_reference,
                       o.discount_type, o.discount_value,
                       o.recurring_frequency, o.recurring_interval_days,
                       o.recurring_end
                FROM orders o
                WHERE o.billing_mode = 'recurring'
                  AND o.recurring_next_date <= :today
                  AND o.status IN ('confirmed', 'partially_invoiced')
                  AND o.is_archived = false
            """),
            {"today": today},
        )
        orders = result.fetchall()

        for order in orders:
            order_id = order[0]
            org_id = uuid.UUID(order[1])
            client_id = order[2]
            contract_id = order[3]
            client_ref = order[4]
            discount_type = order[5]
            discount_value = order[6]
            frequency = order[7]
            interval_days = order[8]
            recurring_end = order[9]

            # Verifier si la date de fin est depassee
            if recurring_end and today > recurring_end:
                _log.info("Commande %s : fin de recurrence atteinte, ignoree", order_id)
                continue

            try:
                # Charger les lignes de la commande
                lines_result = await db.execute(
                    text("""
                        SELECT product_id::text, position, reference, description,
                               quantity, unit, unit_price, vat_rate, discount_percent
                        FROM order_lines
                        WHERE order_id = :oid
                        ORDER BY position
                    """),
                    {"oid": order_id},
                )
                order_lines = lines_result.fetchall()

                invoice_lines = [
                    InvoiceLineIn(
                        product_id=ln[0],
                        position=ln[1],
                        reference=ln[2],
                        description=ln[3],
                        quantity=ln[4],
                        unit=ln[5],
                        unit_price=ln[6],
                        vat_rate=ln[7],
                        discount_percent=ln[8] or 0,
                    )
                    for ln in order_lines
                ]

                invoice_data = InvoiceCreate(
                    client_id=client_id,
                    contract_id=contract_id,
                    issue_date=today,
                    discount_type=discount_type or "none",
                    discount_value=discount_value or 0,
                    purchase_order_number=client_ref,
                    lines=invoice_lines,
                )

                # Creer la facture brouillon (user_id = zero UUID pour les taches auto)
                invoice_result = await create_invoice(
                    org_id, uuid.UUID(int=0), invoice_data, db,
                )
                invoice_id = invoice_result["id"]

                # Liaison order_invoices
                await db.execute(
                    text("INSERT INTO order_invoices (order_id, invoice_id) VALUES (:oid, :iid)"),
                    {"oid": order_id, "iid": invoice_id},
                )

                # Mettre a jour recurring_next_date
                next_date = _compute_next_date(today, frequency or "monthly", interval_days)
                await db.execute(
                    text("""
                        UPDATE orders
                        SET recurring_next_date = :next_date,
                            status = 'partially_invoiced',
                            updated_at = now()
                        WHERE id = :oid
                    """),
                    {"next_date": next_date, "oid": order_id},
                )

                await db.commit()
                invoices_created += 1
                _log.info(
                    "Facture brouillon %s creee pour commande recurrente %s (prochaine : %s)",
                    invoice_id, order_id, next_date,
                )

            except Exception:
                await db.rollback()
                _log.exception("Erreur lors de la facturation recurrente de la commande %s", order_id)

    _log.info("Facturation recurrente terminee : %d facture(s) creee(s)", invoices_created)
    return {"invoices_created": invoices_created}
