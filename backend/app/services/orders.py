# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service metier — commandes clients.

Pivot de la chaine Devis -> Commande -> Facture.
Pas de numerotation interne : l'affichage repose sur client_reference
(reference BC du client) ou les numeros de devis lies.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.order import OrderCreate, OrderLineIn, OrderUpdate


# ── Helpers ───────────────────────────────────────────────────────────────────


def _calc_order_line(line: OrderLineIn) -> dict:
    """Calcule total_ht et total_vat d'une ligne de commande."""
    qty = Decimal(str(line.quantity))
    price = Decimal(str(line.unit_price))
    discount = Decimal(str(line.discount_percent)) / Decimal("100")
    total_ht = (qty * price * (Decimal("1") - discount)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    total_vat = (total_ht * Decimal(str(line.vat_rate)) / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return {"total_ht": total_ht, "total_vat": total_vat}


def get_display_reference(
    client_ref: str | None,
    linked_quotes: list[dict] | None,
    client_name: str | None,
    issue_date: date | None,
) -> str:
    """Calcule la reference affichee pour une commande.

    Priorite : client_reference > numeros de devis > date + client.
    """
    if client_ref:
        if linked_quotes:
            quote_nums = ", ".join(q["number"] for q in linked_quotes if q.get("number"))
            if quote_nums:
                return f"{client_ref} ({quote_nums})"
        return client_ref

    if linked_quotes:
        quote_nums = ", ".join(q["number"] for q in linked_quotes if q.get("number"))
        if quote_nums:
            return quote_nums

    parts = []
    if issue_date:
        parts.append(issue_date.strftime("%d/%m/%Y"))
    if client_name:
        parts.append(client_name)
    return " - ".join(parts) if parts else "Commande"


# ── Liste ─────────────────────────────────────────────────────────────────────


async def list_orders(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    status: str | None = None,
    client_id: str | None = None,
    search: str | None = None,
    archived: bool | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginee des commandes."""
    conditions = ["o.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}

    if archived is not None:
        conditions.append("o.is_archived = :archived")
        params["archived"] = archived
    else:
        conditions.append("o.is_archived = false")

    if status:
        conditions.append("o.status = :status")
        params["status"] = status
    if client_id:
        conditions.append("o.client_id = :client_id")
        params["client_id"] = client_id
    if search:
        conditions.append(
            "(o.client_reference ILIKE :search OR c.name ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"""
            SELECT COUNT(*) FROM orders o
            LEFT JOIN clients c ON c.id = o.client_id
            WHERE {where}
        """),
        params,
    )
    total = count_result.scalar() or 0
    offset = (page - 1) * page_size

    result = await db.execute(
        text(f"""
            SELECT o.id::text, o.client_id::text, c.name AS client_name,
                   o.client_reference, o.source, o.status,
                   o.issue_date, o.delivery_date,
                   o.subtotal_ht, o.total_vat, o.total_ttc,
                   o.discount_type, o.discount_value,
                   o.notes, o.is_archived,
                   o.created_at, o.updated_at,
                   o.contract_id::text
            FROM orders o
            LEFT JOIN clients c ON c.id = o.client_id
            WHERE {where}
            ORDER BY o.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {**params, "limit": page_size, "offset": offset},
    )
    rows = result.fetchall()

    items = []
    for r in rows:
        oid = r[0]
        # Charger les devis lies pour le display_reference
        lq_result = await db.execute(
            text("SELECT q.id::text, q.number FROM order_quotes oq JOIN quotes q ON q.id = oq.quote_id WHERE oq.order_id = :oid"),
            {"oid": oid},
        )
        linked_quotes = [{"id": lq[0], "number": lq[1]} for lq in lq_result.fetchall()]

        display_ref = get_display_reference(r[3], linked_quotes, r[2], r[6])

        items.append({
            "id": oid,
            "client_id": r[1],
            "client_name": r[2],
            "client_reference": r[3],
            "display_reference": display_ref,
            "source": r[4],
            "status": r[5],
            "issue_date": r[6],
            "delivery_date": r[7],
            "subtotal_ht": r[8],
            "total_vat": r[9],
            "total_ttc": r[10],
            "discount_type": r[11],
            "discount_value": r[12],
            "notes": r[13],
            "is_archived": r[14],
            "created_at": r[15],
            "updated_at": r[16],
            "contract_id": r[17],
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── Detail ────────────────────────────────────────────────────────────────────


async def get_order(
    org_id: uuid.UUID, order_id: str, db: AsyncSession
) -> dict:
    """Detail d'une commande avec lignes, devis et factures lies."""
    result = await db.execute(
        text("""
            SELECT o.id::text, o.client_id::text, c.name AS client_name,
                   o.client_reference, o.source, o.status,
                   o.issue_date, o.delivery_date, o.currency,
                   o.subtotal_ht, o.total_vat, o.total_ttc,
                   o.discount_type, o.discount_value,
                   o.notes, o.client_document_url, o.is_archived,
                   o.created_at, o.updated_at,
                   o.contract_id::text
            FROM orders o
            LEFT JOIN clients c ON c.id = o.client_id
            WHERE o.id = :oid AND o.organization_id = :org_id
        """),
        {"oid": order_id, "org_id": str(org_id)},
    )
    r = result.fetchone()
    if r is None:
        raise HTTPException(404, "Commande introuvable")

    # Lignes
    lines_result = await db.execute(
        text("""
            SELECT l.id::text, l.product_id::text, l.position,
                   l.reference, l.description,
                   l.quantity, l.unit, l.unit_price, l.vat_rate,
                   l.discount_percent, l.total_ht, l.total_vat
            FROM order_lines l
            WHERE l.order_id = :oid
            ORDER BY l.position
        """),
        {"oid": order_id},
    )
    lines = [
        {
            "id": ln[0], "product_id": ln[1], "position": ln[2],
            "reference": ln[3], "description": ln[4],
            "quantity": ln[5], "unit": ln[6], "unit_price": ln[7],
            "vat_rate": ln[8], "discount_percent": ln[9],
            "total_ht": ln[10], "total_vat": ln[11],
        }
        for ln in lines_result.fetchall()
    ]

    # Devis lies
    lq_result = await db.execute(
        text("SELECT q.id::text, q.number FROM order_quotes oq JOIN quotes q ON q.id = oq.quote_id WHERE oq.order_id = :oid"),
        {"oid": order_id},
    )
    linked_quotes = [{"id": lq[0], "number": lq[1]} for lq in lq_result.fetchall()]

    # Factures liees
    li_result = await db.execute(
        text("SELECT i.id::text, i.number, i.proforma_number FROM order_invoices oi JOIN invoices i ON i.id = oi.invoice_id WHERE oi.order_id = :oid"),
        {"oid": order_id},
    )
    linked_invoices = [{"id": li[0], "number": li[1], "proforma_number": li[2]} for li in li_result.fetchall()]

    display_ref = get_display_reference(r[3], linked_quotes, r[2], r[6])

    return {
        "id": r[0],
        "client_id": r[1],
        "client_name": r[2],
        "client_reference": r[3],
        "display_reference": display_ref,
        "source": r[4],
        "status": r[5],
        "issue_date": r[6],
        "delivery_date": r[7],
        "currency": r[8],
        "subtotal_ht": r[9],
        "total_vat": r[10],
        "total_ttc": r[11],
        "discount_type": r[12],
        "discount_value": r[13],
        "notes": r[14],
        "client_document_url": r[15],
        "is_archived": r[16],
        "created_at": r[17],
        "updated_at": r[18],
        "contract_id": r[19],
        "lines": lines,
        "linked_quotes": linked_quotes,
        "linked_invoices": linked_invoices,
    }


# ── Creation manuelle ────────────────────────────────────────────────────────


async def create_order(
    org_id: uuid.UUID, data: OrderCreate, db: AsyncSession
) -> dict:
    """Cree une commande manuelle (source=manual ou client_document)."""
    order_id = uuid.uuid4()

    subtotal_ht = Decimal("0")
    total_vat = Decimal("0")
    for line in data.lines:
        calc = _calc_order_line(line)
        subtotal_ht += calc["total_ht"]
        total_vat += calc["total_vat"]
    total_ttc = subtotal_ht + total_vat

    await db.execute(
        text("""
            INSERT INTO orders (
                id, organization_id, client_id, contract_id,
                client_reference, source, status,
                issue_date, delivery_date,
                subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value,
                notes, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :contract_id,
                :client_ref, :source, 'draft',
                :issue_date, :delivery_date,
                :ht, :vat, :ttc,
                :disc_type, :disc_val,
                :notes, now(), now()
            )
        """),
        {
            "id": str(order_id),
            "org_id": str(org_id),
            "client_id": data.client_id,
            "contract_id": data.contract_id,
            "client_ref": data.client_reference,
            "source": data.source,
            "issue_date": data.issue_date,
            "delivery_date": data.delivery_date,
            "ht": str(subtotal_ht),
            "vat": str(total_vat),
            "ttc": str(total_ttc),
            "disc_type": data.discount_type,
            "disc_val": str(data.discount_value),
            "notes": data.notes,
        },
    )

    # Inserer les lignes
    for i, line in enumerate(data.lines):
        calc = _calc_order_line(line)
        await db.execute(
            text("""
                INSERT INTO order_lines (
                    id, order_id, product_id, position,
                    reference, description, quantity, unit,
                    unit_price, vat_rate, discount_percent,
                    total_ht, total_vat
                ) VALUES (
                    :lid, :oid, :pid, :pos,
                    :ref, :desc, :qty, :unit,
                    :price, :vat_rate, :disc,
                    :ht, :vat
                )
            """),
            {
                "lid": str(uuid.uuid4()),
                "oid": str(order_id),
                "pid": line.product_id,
                "pos": i,
                "ref": line.reference,
                "desc": line.description,
                "qty": str(line.quantity),
                "unit": line.unit,
                "price": str(line.unit_price),
                "vat_rate": str(line.vat_rate),
                "disc": str(line.discount_percent),
                "ht": str(calc["total_ht"]),
                "vat": str(calc["total_vat"]),
            },
        )

    # Lier les devis si fournis
    if data.quote_ids:
        for qid in data.quote_ids:
            await db.execute(
                text("INSERT INTO order_quotes (order_id, quote_id) VALUES (:oid, :qid) ON CONFLICT DO NOTHING"),
                {"oid": str(order_id), "qid": qid},
            )

    await db.commit()
    return {"id": str(order_id)}


# ── Creation depuis un devis ──────────────────────────────────────────────────


async def create_from_quote(
    org_id: uuid.UUID,
    quote_id: str,
    source: str,
    client_reference: str | None,
    db: AsyncSession,
) -> str:
    """Cree une commande a partir d'un devis existant.

    Copie les lignes du devis dans la commande et cree la liaison order_quotes.
    Ne commit pas (appele dans un contexte plus large).

    Returns:
        L'UUID de la commande creee (str).
    """
    # Charger le devis
    q_result = await db.execute(
        text("""
            SELECT id::text, client_id::text, contract_id::text,
                   subtotal_ht, total_vat, total_ttc,
                   discount_type, discount_value, issue_date
            FROM quotes
            WHERE id = :qid AND organization_id = :org_id
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    quote = q_result.fetchone()
    if quote is None:
        raise HTTPException(404, "Devis introuvable")

    order_id = uuid.uuid4()

    await db.execute(
        text("""
            INSERT INTO orders (
                id, organization_id, client_id, contract_id,
                client_reference, source, status,
                issue_date, subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value,
                created_at, updated_at
            ) VALUES (
                :oid, :org_id, :client_id, :contract_id,
                :client_ref, :source, 'confirmed',
                :issue_date, :ht, :vat, :ttc,
                :disc_type, :disc_val,
                now(), now()
            )
        """),
        {
            "oid": str(order_id),
            "org_id": str(org_id),
            "client_id": quote[1],
            "contract_id": quote[2],
            "client_ref": client_reference,
            "source": source,
            "issue_date": quote[8],
            "ht": str(quote[3]),
            "vat": str(quote[4]),
            "ttc": str(quote[5]),
            "disc_type": quote[6],
            "disc_val": str(quote[7]),
        },
    )

    # Copier les lignes du devis
    await db.execute(
        text("""
            INSERT INTO order_lines (
                id, order_id, product_id, position,
                reference, description, quantity, unit,
                unit_price, vat_rate, discount_percent,
                total_ht, total_vat
            )
            SELECT gen_random_uuid(), :oid, product_id, position,
                   reference, description, quantity, unit,
                   unit_price, vat_rate, discount_percent,
                   total_ht, total_vat
            FROM quote_lines
            WHERE quote_id = :qid
            ORDER BY position
        """),
        {"oid": str(order_id), "qid": quote_id},
    )

    # Liaison order_quotes
    await db.execute(
        text("INSERT INTO order_quotes (order_id, quote_id) VALUES (:oid, :qid)"),
        {"oid": str(order_id), "qid": quote_id},
    )

    return str(order_id)


# ── Mise a jour ───────────────────────────────────────────────────────────────


async def update_order(
    org_id: uuid.UUID, order_id: str, data: OrderUpdate, db: AsyncSession
) -> dict:
    """Met a jour une commande (draft ou confirmed uniquement).

    Supporte la mise a jour complete : en-tete + lignes.
    Les lignes sont remplacees integralement si fournies.
    """
    # Verifier statut
    check = await db.execute(
        text("SELECT status FROM orders WHERE id = :oid AND organization_id = :org_id"),
        {"oid": order_id, "org_id": str(org_id)},
    )
    row = check.fetchone()
    if row is None:
        raise HTTPException(404, "Commande introuvable")
    if row[0] not in ("draft", "confirmed"):
        raise HTTPException(422, "Seules les commandes en brouillon ou confirmees peuvent etre modifiees")

    updates = []
    params: dict = {"oid": order_id, "org_id": str(org_id)}

    if data.client_id is not None:
        updates.append("client_id = :client_id")
        params["client_id"] = data.client_id
    if data.client_reference is not None:
        updates.append("client_reference = :client_ref")
        params["client_ref"] = data.client_reference
    if data.issue_date is not None:
        updates.append("issue_date = :issue_date")
        params["issue_date"] = data.issue_date
    if data.delivery_date is not None:
        updates.append("delivery_date = :delivery_date")
        params["delivery_date"] = data.delivery_date
    if data.discount_type is not None:
        updates.append("discount_type = :disc_type")
        params["disc_type"] = data.discount_type
    if data.discount_value is not None:
        updates.append("discount_value = :disc_val")
        params["disc_val"] = str(data.discount_value)
    if data.notes is not None:
        updates.append("notes = :notes")
        params["notes"] = data.notes
    if data.status is not None:
        updates.append("status = :status")
        params["status"] = data.status

    # Remplacement complet des lignes si fournies
    if data.lines is not None:
        # Supprimer les anciennes lignes
        await db.execute(
            text("DELETE FROM order_lines WHERE order_id = :oid"),
            {"oid": order_id},
        )
        # Inserer les nouvelles lignes et recalculer les totaux
        subtotal_ht = Decimal("0")
        total_vat = Decimal("0")
        for i, line in enumerate(data.lines):
            calc = _calc_order_line(line)
            subtotal_ht += calc["total_ht"]
            total_vat += calc["total_vat"]
            await db.execute(
                text("""
                    INSERT INTO order_lines (
                        id, order_id, product_id, position,
                        reference, description, quantity, unit,
                        unit_price, vat_rate, discount_percent,
                        total_ht, total_vat
                    ) VALUES (
                        :lid, :oid, :pid, :pos,
                        :ref, :desc, :qty, :unit,
                        :price, :vat_rate, :disc,
                        :ht, :vat
                    )
                """),
                {
                    "lid": str(uuid.uuid4()),
                    "oid": order_id,
                    "pid": line.product_id,
                    "pos": i,
                    "ref": line.reference,
                    "desc": line.description,
                    "qty": str(line.quantity),
                    "unit": line.unit,
                    "price": str(line.unit_price),
                    "vat_rate": str(line.vat_rate),
                    "disc": str(line.discount_percent),
                    "ht": str(calc["total_ht"]),
                    "vat": str(calc["total_vat"]),
                },
            )
        total_ttc = subtotal_ht + total_vat
        updates.append("subtotal_ht = :ht")
        updates.append("total_vat = :vat")
        updates.append("total_ttc = :ttc")
        params["ht"] = str(subtotal_ht)
        params["vat"] = str(total_vat)
        params["ttc"] = str(total_ttc)

    if not updates:
        return {"id": order_id}

    updates.append("updated_at = now()")
    set_clause = ", ".join(updates)

    await db.execute(
        text(f"UPDATE orders SET {set_clause} WHERE id = :oid AND organization_id = :org_id"),
        params,
    )
    await db.commit()
    return {"id": order_id}


# ── Facturation ───────────────────────────────────────────────────────────────


async def invoice_order(
    org_id: uuid.UUID, order_id: str, db: AsyncSession
) -> dict:
    """Cree une facture a partir d'une commande.

    Copie les lignes de la commande dans la facture, cree la liaison
    order_invoices et met a jour le statut de la commande.
    """
    from app.services.invoices import create_invoice
    from app.schemas.invoices import InvoiceCreate, InvoiceLineIn

    # Charger la commande
    order = await get_order(org_id, order_id, db)
    if order["status"] in ("invoiced", "cancelled"):
        raise HTTPException(422, "Cette commande ne peut pas etre facturee")

    # Construire les lignes de facture depuis la commande
    invoice_lines = [
        InvoiceLineIn(
            product_id=ln.get("product_id"),
            position=ln["position"],
            reference=ln.get("reference"),
            description=ln.get("description"),
            quantity=ln["quantity"],
            unit=ln.get("unit"),
            unit_price=ln["unit_price"],
            vat_rate=ln["vat_rate"],
            discount_percent=ln.get("discount_percent", 0),
        )
        for ln in order["lines"]
    ]

    invoice_data = InvoiceCreate(
        client_id=order["client_id"],
        quote_id=order["linked_quotes"][0]["id"] if order["linked_quotes"] else None,
        contract_id=order.get("contract_id"),
        issue_date=date.today(),
        discount_type=order.get("discount_type", "none"),
        discount_value=order.get("discount_value", 0),
        purchase_order_number=order.get("client_reference"),
        lines=invoice_lines,
    )

    invoice_result = await create_invoice(org_id, uuid.UUID(int=0), invoice_data, db)
    invoice_id = invoice_result["id"]

    # Liaison order_invoices
    await db.execute(
        text("INSERT INTO order_invoices (order_id, invoice_id) VALUES (:oid, :iid)"),
        {"oid": order_id, "iid": invoice_id},
    )

    # Maj statut
    await db.execute(
        text("UPDATE orders SET status = 'invoiced', updated_at = now() WHERE id = :oid"),
        {"oid": order_id},
    )
    await db.commit()

    return {"order_id": order_id, "invoice_id": invoice_id}


# ── Lier des devis ────────────────────────────────────────────────────────────


async def link_quotes(
    org_id: uuid.UUID, order_id: str, quote_ids: list[str], db: AsyncSession
) -> dict:
    """Lie des devis a une commande existante."""
    # Verifier que la commande existe
    check = await db.execute(
        text("SELECT 1 FROM orders WHERE id = :oid AND organization_id = :org_id"),
        {"oid": order_id, "org_id": str(org_id)},
    )
    if check.fetchone() is None:
        raise HTTPException(404, "Commande introuvable")

    count = 0
    for qid in quote_ids:
        # Verifier que le devis appartient a l'org
        q_check = await db.execute(
            text("SELECT 1 FROM quotes WHERE id = :qid AND organization_id = :org_id"),
            {"qid": qid, "org_id": str(org_id)},
        )
        if q_check.fetchone() is None:
            continue
        await db.execute(
            text("INSERT INTO order_quotes (order_id, quote_id) VALUES (:oid, :qid) ON CONFLICT DO NOTHING"),
            {"oid": order_id, "qid": qid},
        )
        count += 1

    await db.commit()
    return {"linked": count}


# ── Annulation / Restauration ─────────────────────────────────────────────────


async def cancel_order(
    org_id: uuid.UUID, order_id: str, db: AsyncSession
) -> dict:
    """Annule une commande et repasse les devis lies en draft.

    Reversible via restore_order.
    Interdit si la commande a deja ete facturee (invoiced/partially_invoiced).
    """
    row = (await db.execute(
        text("SELECT status FROM orders WHERE id = :oid AND organization_id = :org_id"),
        {"oid": order_id, "org_id": str(org_id)},
    )).mappings().first()
    if not row:
        raise HTTPException(404, "Commande introuvable")
    if row["status"] in ("invoiced", "partially_invoiced"):
        raise HTTPException(422, "Impossible d'annuler une commande deja facturee")

    # Passer la commande en cancelled + archiver automatiquement
    await db.execute(
        text("UPDATE orders SET status = 'cancelled', is_archived = true, updated_at = now() WHERE id = :oid AND organization_id = :org_id"),
        {"oid": order_id, "org_id": str(org_id)},
    )

    # Repasser les devis lies en draft
    await db.execute(
        text("""
            UPDATE quotes SET status = 'draft', updated_at = now()
            WHERE id IN (SELECT quote_id FROM order_quotes WHERE order_id = :oid)
              AND organization_id = :org_id
        """),
        {"oid": order_id, "org_id": str(org_id)},
    )

    await db.commit()
    return {"status": "cancelled"}


async def restore_order(
    org_id: uuid.UUID, order_id: str, db: AsyncSession
) -> dict:
    """Restaure une commande annulee et repasse les devis lies en accepted."""
    row = (await db.execute(
        text("SELECT status FROM orders WHERE id = :oid AND organization_id = :org_id"),
        {"oid": order_id, "org_id": str(org_id)},
    )).mappings().first()
    if not row:
        raise HTTPException(404, "Commande introuvable")
    if row["status"] != "cancelled":
        raise HTTPException(422, "Seule une commande annulee peut etre restauree")

    # Repasser en confirmed + desarchiver
    await db.execute(
        text("UPDATE orders SET status = 'confirmed', is_archived = false, updated_at = now() WHERE id = :oid AND organization_id = :org_id"),
        {"oid": order_id, "org_id": str(org_id)},
    )

    # Repasser les devis lies en accepted
    await db.execute(
        text("""
            UPDATE quotes SET status = 'accepted', updated_at = now()
            WHERE id IN (SELECT quote_id FROM order_quotes WHERE order_id = :oid)
              AND organization_id = :org_id
        """),
        {"oid": order_id, "org_id": str(org_id)},
    )

    await db.commit()
    return {"status": "confirmed"}


# ── Archivage ─────────────────────────────────────────────────────────────────


async def archive_orders(
    org_id: uuid.UUID, order_ids: list[str], db: AsyncSession
) -> dict:
    """Archive/desarchive des commandes."""
    for oid in order_ids:
        await db.execute(
            text("""
                UPDATE orders SET is_archived = NOT is_archived, updated_at = now()
                WHERE id = :oid AND organization_id = :org_id
            """),
            {"oid": oid, "org_id": str(org_id)},
        )
    await db.commit()
    return {"archived": len(order_ids)}
