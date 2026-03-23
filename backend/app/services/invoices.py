# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — factures et avoirs."""

import json
import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.invoices import InvoiceCreate, InvoiceLineIn, InvoiceUpdate
from app.services.numbering import generate_number


def _calc_invoice_line(line: InvoiceLineIn) -> dict:
    """Calcule total_ht et total_vat d'une ligne de facture."""
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


async def list_invoices(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    status: str | None = None,
    client_id: str | None = None,
    contract_id: str | None = None,
    is_credit_note: bool | None = None,
    search: str | None = None,
    client_search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    archived: bool | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginée des factures."""
    conditions = ["i.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}

    # Par défaut : non archivées
    if archived is not None:
        conditions.append("i.is_archived = :archived")
        params["archived"] = archived
    else:
        conditions.append("i.is_archived = false")

    if status:
        conditions.append("i.status = :status")
        params["status"] = status
    if client_id:
        conditions.append("i.client_id = :client_id")
        params["client_id"] = client_id
    if contract_id:
        conditions.append("i.contract_id = :contract_id")
        params["contract_id"] = contract_id
    if is_credit_note is not None:
        conditions.append("i.is_credit_note = :is_cn")
        params["is_cn"] = is_credit_note
    if search:
        conditions.append(
            "(i.number ILIKE :search OR i.proforma_number ILIKE :search)"
        )
        params["search"] = f"%{search}%"
    if client_search:
        conditions.append(
            "(COALESCE(i.client_name, c.name) ILIKE :client_search)"
        )
        params["client_search"] = f"%{client_search}%"
    if date_from:
        conditions.append("i.issue_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        conditions.append("i.issue_date <= :date_to")
        params["date_to"] = date_to

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM invoices i WHERE {where}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT i.id::text, i.number, i.proforma_number,
                   i.client_id::text,
                   COALESCE(i.client_name, c.name) AS client_name,
                   i.quote_id::text,                    i.contract_id::text, i.situation_id::text,
                   i.is_situation, i.situation_number,
                   i.is_credit_note, i.credit_note_for::text,
                   i.status, i.issue_date, i.due_date,
                   i.subtotal_ht, i.total_vat, i.total_ttc,
                   i.amount_paid, i.discount_type, i.discount_value,
                   i.payment_terms, i.payment_method,
                   i.customer_reference, i.purchase_order_number,
                   i.notes, i.pdf_url, i.sent_at, i.paid_at,
                   i.created_at, i.updated_at
            FROM invoices i
            LEFT JOIN clients c ON c.id = i.client_id
            WHERE {where}
            ORDER BY i.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [dict(row._mapping) for row in result.fetchall()]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def create_invoice(
    org_id: uuid.UUID, user_id: uuid.UUID, data: InvoiceCreate, db: AsyncSession
) -> dict:
    """Crée une facture brouillon avec ses lignes.

    Le numéro définitif FA-YYYY-NNNN est attribué à la validation.
    En attendant, un numéro proforma PF-YYYY-NNNN est généré.
    """
    invoice_id = uuid.uuid4()
    proforma_number = await generate_number("proforma", org_id, db)

    # Copier le nom du client en dur
    client_name_result = await db.execute(
        text("SELECT name FROM clients WHERE id = :cid AND organization_id = :org_id"),
        {"cid": data.client_id, "org_id": str(org_id)},
    )
    client_name_row = client_name_result.fetchone()
    client_name = client_name_row[0] if client_name_row else None

    # Profil de facturation : celui fourni ou le profil par défaut
    billing_profile_id = data.billing_profile_id
    billing_profile_name = None
    if not billing_profile_id:
        default_bp = await db.execute(
            text("SELECT id::text, name FROM billing_profiles WHERE organization_id = :org_id AND is_default = true LIMIT 1"),
            {"org_id": str(org_id)},
        )
        bp_row = default_bp.fetchone()
        if bp_row:
            billing_profile_id = bp_row[0]
            billing_profile_name = bp_row[1]
    if billing_profile_id and not billing_profile_name:
        bp_name_result = await db.execute(
            text("SELECT name FROM billing_profiles WHERE id = :bpid"),
            {"bpid": billing_profile_id},
        )
        bp_name_row = bp_name_result.fetchone()
        if bp_name_row:
            billing_profile_name = bp_name_row[0]

    subtotal_ht = Decimal("0")
    total_vat = Decimal("0")
    for line in data.lines:
        calc = _calc_invoice_line(line)
        subtotal_ht += calc["total_ht"]
        total_vat += calc["total_vat"]
    total_ttc = subtotal_ht + total_vat

    # RIB : fourni par le frontend, sinon charge depuis le profil de facturation
    bank_details = data.bank_details
    if not bank_details and billing_profile_id:
        bank_result = await db.execute(
            text("""
                SELECT ba.iban, ba.bic, ba.bank_name
                FROM billing_profiles bp
                JOIN bank_accounts ba ON ba.id = bp.bank_account_id
                WHERE bp.id = :bpid
            """),
            {"bpid": billing_profile_id},
        )
        bank_row = bank_result.fetchone()
        if bank_row:
            bank_details = {"iban": bank_row[0], "bic": bank_row[1], "bank_name": bank_row[2]}
    bank_json = json.dumps(bank_details) if bank_details else None

    await db.execute(
        text("""
            INSERT INTO invoices (
                id, organization_id, client_id, client_name,
                proforma_number,
                quote_id, contract_id,
                billing_profile_id, billing_profile_name,
                customer_reference, purchase_order_number,
                is_credit_note, status, issue_date, due_date,
                currency, subtotal_ht, total_vat, total_ttc,
                amount_paid, discount_type, discount_value,
                payment_terms, payment_method, bank_details,
                notes, footer, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :client_name,
                :proforma_number,
                :quote_id, :contract_id,
                :billing_profile_id, :billing_profile_name,
                :customer_reference, :purchase_order_number,
                false, 'draft', :issue_date, :due_date,
                'EUR', :ht, :vat, :ttc,
                0, :disc_type, :disc_val,
                :terms, :method, CAST(:bank AS jsonb),
                :notes, :footer, now(), now()
            )
        """),
        {
            "id": str(invoice_id),
            "org_id": str(org_id),
            "client_id": data.client_id,
            "client_name": client_name,
            "proforma_number": proforma_number,
            "quote_id": data.quote_id,
            "contract_id": data.contract_id,
            "billing_profile_id": billing_profile_id,
            "billing_profile_name": billing_profile_name,
            "issue_date": data.issue_date,
            "due_date": data.due_date,
            "ht": str(subtotal_ht),
            "vat": str(total_vat),
            "ttc": str(total_ttc),
            "disc_type": data.discount_type,
            "disc_val": str(data.discount_value),
            "terms": data.payment_terms,
            "method": data.payment_method,
            "bank": bank_json,
            "customer_reference": data.customer_reference,
            "purchase_order_number": data.purchase_order_number,
            "notes": data.notes,
            "footer": data.footer,
        },
    )

    for i, line in enumerate(data.lines):
        calc = _calc_invoice_line(line)
        line_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO invoice_lines (
                    id, invoice_id, product_id, position,
                    reference, description, quantity, unit, unit_price,
                    vat_rate, discount_percent, total_ht, total_vat,
                    account_code
                ) VALUES (
                    :id, :iid, :pid, :pos,
                    :ref, :desc, :qty, :unit, :price,
                    :vat, :disc, :ht, :vat_amt,
                    :acct
                )
            """),
            {
                "id": str(line_id),
                "iid": str(invoice_id),
                "pid": line.product_id,
                "pos": line.position or i,
                "ref": line.reference,
                "desc": line.description,
                "qty": str(line.quantity),
                "unit": line.unit,
                "price": str(line.unit_price),
                "vat": str(line.vat_rate),
                "disc": str(line.discount_percent),
                "ht": str(calc["total_ht"]),
                "vat_amt": str(calc["total_vat"]),
                "acct": line.account_code,
            },
        )

    await db.commit()
    return {"id": str(invoice_id), "proforma_number": proforma_number}


async def get_invoice(
    org_id: uuid.UUID, invoice_id: str, db: AsyncSession
) -> dict:
    """Détail d'une facture avec ses lignes."""
    result = await db.execute(
        text("""
            SELECT i.id::text, i.number, i.proforma_number,
                   i.client_id::text,
                   COALESCE(i.client_name, c.name) AS client_name,
                   i.quote_id::text,                    i.contract_id::text, i.situation_id::text,
                   i.billing_profile_id::text,
                   i.billing_profile_name,
                   i.is_situation, i.situation_number,
                   i.is_credit_note, i.credit_note_for::text,
                   i.status, i.issue_date, i.due_date,
                   i.subtotal_ht, i.total_vat, i.total_ttc,
                   i.amount_paid, i.discount_type, i.discount_value,
                   i.payment_terms, i.payment_method,
                   i.customer_reference, i.purchase_order_number,
                   i.bank_details, i.notes, i.footer,
                   i.legal_mentions, i.client_snapshot, i.seller_snapshot,
                   i.pdf_url, i.sent_at, i.paid_at,
                   i.created_at, i.updated_at
            FROM invoices i
            LEFT JOIN clients c ON c.id = i.client_id
            WHERE i.id = :iid AND i.organization_id = :org_id
        """),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Facture introuvable")
    invoice = dict(row._mapping)

    lines_result = await db.execute(
        text("""
            SELECT il.id::text, il.product_id::text, il.position,
                   il.reference, il.description, il.quantity, il.unit, il.unit_price,
                   il.vat_rate, il.discount_percent, il.total_ht,
                   il.total_vat, il.account_code
            FROM invoice_lines il
            WHERE il.invoice_id = :iid
            ORDER BY il.position
        """),
        {"iid": invoice_id},
    )
    invoice["lines"] = [dict(r._mapping) for r in lines_result.fetchall()]
    return invoice


async def update_invoice(
    org_id: uuid.UUID, invoice_id: str, data: InvoiceUpdate, db: AsyncSession
) -> dict:
    """Met à jour une facture draft."""
    status_result = await db.execute(
        text("SELECT status FROM invoices WHERE id = :iid AND organization_id = :org_id"),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    row = status_result.fetchone()
    if row is None:
        raise HTTPException(404, "Facture introuvable")
    current_status = row[0]
    if current_status not in ("draft", "validated"):
        raise HTTPException(409, "Seules les factures en brouillon ou validées peuvent être modifiées")

    # En statut validé, seuls certains champs sont modifiables (loi française)
    VALIDATED_EDITABLE = {"notes", "payment_method", "bank_details"}
    updates = data.model_dump(exclude_unset=True, exclude={"lines", "bank_details"})
    if current_status == "validated":
        forbidden = set(updates.keys()) - VALIDATED_EDITABLE
        if forbidden:
            raise HTTPException(
                409,
                f"Champs non modifiables après validation : {', '.join(sorted(forbidden))}",
            )
        if data.lines is not None:
            raise HTTPException(409, "Les lignes ne peuvent pas être modifiées après validation")
    if data.bank_details is not None:
        updates["bank_details"] = None  # handled separately

    if updates:
        set_parts = []
        params: dict = {"iid": invoice_id, "org_id": str(org_id)}
        for key, value in updates.items():
            if key == "bank_details":
                continue
            set_parts.append(f"{key} = :{key}")
            params[key] = str(value) if isinstance(value, Decimal) else value
        if data.bank_details is not None:
            set_parts.append("bank_details = CAST(:bank AS jsonb)")
            params["bank"] = json.dumps(data.bank_details)
        set_parts.append("updated_at = now()")

        if set_parts:
            await db.execute(
                text(f"UPDATE invoices SET {', '.join(set_parts)} WHERE id = :iid AND organization_id = :org_id"),
                params,
            )

    if data.lines is not None:
        await db.execute(
            text("DELETE FROM invoice_lines WHERE invoice_id = :iid"),
            {"iid": invoice_id},
        )
        subtotal_ht = Decimal("0")
        total_vat = Decimal("0")
        for i, line in enumerate(data.lines):
            calc = _calc_invoice_line(line)
            subtotal_ht += calc["total_ht"]
            total_vat += calc["total_vat"]
            line_id = uuid.uuid4()
            await db.execute(
                text("""
                    INSERT INTO invoice_lines (
                        id, invoice_id, product_id, position,
                        reference, description, quantity, unit, unit_price,
                        vat_rate, discount_percent, total_ht, total_vat,
                        account_code
                    ) VALUES (
                        :id, :iid, :pid, :pos,
                        :ref, :desc, :qty, :unit, :price,
                        :vat, :disc, :ht, :vat_amt,
                        :acct
                    )
                """),
                {
                    "id": str(line_id),
                    "iid": invoice_id,
                    "pid": line.product_id,
                    "pos": line.position or i,
                    "ref": line.reference,
                    "desc": line.description,
                    "qty": str(line.quantity),
                    "unit": line.unit,
                    "price": str(line.unit_price),
                    "vat": str(line.vat_rate),
                    "disc": str(line.discount_percent),
                    "ht": str(calc["total_ht"]),
                    "vat_amt": str(calc["total_vat"]),
                    "acct": line.account_code,
                },
            )
        total_ttc = subtotal_ht + total_vat
        await db.execute(
            text("""
                UPDATE invoices SET subtotal_ht = :ht, total_vat = :vat, total_ttc = :ttc, updated_at = now()
                WHERE id = :iid
            """),
            {"ht": str(subtotal_ht), "vat": str(total_vat), "ttc": str(total_ttc), "iid": invoice_id},
        )

    await db.commit()
    return {"status": "updated"}


async def _build_snapshots(
    org_id: uuid.UUID, invoice_id: str, db: AsyncSession
) -> tuple[str | None, str | None, str | None]:
    """Construit les snapshots client, vendeur et mentions légales pour figer la facture."""
    # Snapshot client
    client_result = await db.execute(
        text("""
            SELECT c.name, c.siret, c.vat_number, c.billing_address,
                   c.email, c.company_siren, c.country_code
            FROM invoices i
            JOIN clients c ON c.id = i.client_id
            WHERE i.id = :iid AND i.organization_id = :org_id
        """),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    c_row = client_result.fetchone()
    client_snap = None
    if c_row:
        client_snap = json.dumps({
            "name": c_row[0],
            "siret": c_row[1],
            "vat_number": c_row[2],
            "address": c_row[3],
            "email": c_row[4],
            "siren": c_row[5],
            "country_code": c_row[6] or "FR",
        })

    # Snapshot vendeur (organisation)
    seller_result = await db.execute(
        text("""
            SELECT name, siret, siren, vat_number, address,
                   legal_form, rcs_city, capital, ape_code,
                   email, phone, website
            FROM organizations WHERE id = :org_id
        """),
        {"org_id": str(org_id)},
    )
    s_row = seller_result.fetchone()
    seller_snap = None
    if s_row:
        seller_snap = json.dumps({
            "name": s_row[0],
            "siret": s_row[1],
            "siren": s_row[2],
            "vat_number": s_row[3],
            "address": s_row[4] if isinstance(s_row[4], dict) else None,
            "legal_form": s_row[5],
            "rcs_city": s_row[6],
            "capital": str(s_row[7]) if s_row[7] else None,
            "ape_code": s_row[8],
            "email": s_row[9],
            "phone": s_row[10],
            "website": s_row[11],
        })

    # Mentions légales depuis le profil de facturation
    mentions_result = await db.execute(
        text("""
            SELECT bp.legal_mentions
            FROM invoices i
            LEFT JOIN billing_profiles bp ON bp.id = i.billing_profile_id
            WHERE i.id = :iid
        """),
        {"iid": invoice_id},
    )
    m_row = mentions_result.fetchone()
    legal_mentions = m_row[0] if m_row else None

    return client_snap, seller_snap, legal_mentions


async def validate_invoice(
    org_id: uuid.UUID, invoice_id: str, db: AsyncSession
) -> dict:
    """Valide une facture : attribue le numéro définitif FA/AV, fige les snapshots."""
    status_check = await db.execute(
        text("SELECT status, is_credit_note FROM invoices WHERE id = :iid AND organization_id = :org_id"),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    row = status_check.fetchone()
    if row is None:
        raise HTTPException(404, "Facture introuvable")
    if row[0] != "draft":
        raise HTTPException(409, "Seules les factures en brouillon peuvent être validées")

    # Générer le numéro définitif (FA pour facture, AV pour avoir)
    doc_type = "credit_note" if row[1] else "invoice"
    number = await generate_number(doc_type, org_id, db)

    # Figer les snapshots au moment de la validation
    client_snap, seller_snap, legal_mentions = await _build_snapshots(org_id, invoice_id, db)

    await db.execute(
        text("""
            UPDATE invoices SET
                number = :number,
                status = 'validated',
                validated_at = now(),
                updated_at = now(),
                client_snapshot = CAST(:client_snap AS jsonb),
                seller_snapshot = CAST(:seller_snap AS jsonb),
                legal_mentions = COALESCE(:legal_mentions, legal_mentions)
            WHERE id = :iid AND organization_id = :org_id
        """),
        {
            "iid": invoice_id,
            "org_id": str(org_id),
            "number": number,
            "client_snap": client_snap,
            "seller_snap": seller_snap,
            "legal_mentions": legal_mentions,
        },
    )
    await db.commit()
    return {"status": "validated", "number": number}


async def send_invoice(
    org_id: uuid.UUID, invoice_id: str, db: AsyncSession
) -> dict:
    """Marque une facture comme envoyée. Accepte draft ou validated."""
    status_check = await db.execute(
        text("SELECT status, is_credit_note, number FROM invoices WHERE id = :iid AND organization_id = :org_id"),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    row = status_check.fetchone()
    if row is None:
        raise HTTPException(404, "Facture introuvable")
    if row[0] not in ("draft", "validated"):
        raise HTTPException(409, "La facture ne peut pas être envoyée (statut invalide)")

    set_parts = ["status = 'sent'", "sent_at = now()", "updated_at = now()"]
    params: dict = {"iid": invoice_id, "org_id": str(org_id)}

    # Si on envoie depuis draft, générer le numéro définitif + figer les snapshots
    if row[0] == "draft":
        doc_type = "credit_note" if row[1] else "invoice"
        number = await generate_number(doc_type, org_id, db)
        set_parts.append("number = :number")
        params["number"] = number

        client_snap, seller_snap, legal_mentions = await _build_snapshots(org_id, invoice_id, db)
        set_parts.append("client_snapshot = CAST(:client_snap AS jsonb)")
        params["client_snap"] = client_snap
        set_parts.append("seller_snapshot = CAST(:seller_snap AS jsonb)")
        params["seller_snap"] = seller_snap
        set_parts.append("legal_mentions = COALESCE(:legal_mentions, legal_mentions)")
        params["legal_mentions"] = legal_mentions
    elif row[2] is None:
        # Validée mais pas encore de numéro définitif (cas improbable mais sécurité)
        doc_type = "credit_note" if row[1] else "invoice"
        number = await generate_number(doc_type, org_id, db)
        set_parts.append("number = :number")
        params["number"] = number

    await db.execute(
        text(f"UPDATE invoices SET {', '.join(set_parts)} WHERE id = :iid AND organization_id = :org_id"),
        params,
    )
    await db.commit()
    return {"status": "sent"}


async def mark_paid(
    org_id: uuid.UUID, invoice_id: str, db: AsyncSession
) -> dict:
    """Marque une facture comme payée."""
    result = await db.execute(
        text("""
            UPDATE invoices SET
                status = 'paid',
                amount_paid = total_ttc,
                paid_at = now(),
                updated_at = now()
            WHERE id = :iid AND organization_id = :org_id
              AND status IN ('sent', 'partial', 'overdue')
        """),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(409, "La facture ne peut pas être marquée comme payée")

    # Mettre à jour la situation associée si applicable
    sit_result = await db.execute(
        text("SELECT situation_id::text, contract_id::text FROM invoices WHERE id = :iid"),
        {"iid": invoice_id},
    )
    sit_row = sit_result.fetchone()
    if sit_row and sit_row[0]:
        await db.execute(
            text("UPDATE situations SET status = 'paid', updated_at = now() WHERE id = :sid"),
            {"sid": sit_row[0]},
        )

    await db.commit()
    return {"status": "paid"}


async def create_credit_note(
    org_id: uuid.UUID, user_id: uuid.UUID, invoice_id: str, db: AsyncSession
) -> dict:
    """Crée un avoir (credit note) à partir d'une facture."""
    # Récupérer la facture originale
    inv_result = await db.execute(
        text("""
            SELECT id::text, client_id::text, contract_id::text,
                   subtotal_ht, total_vat, total_ttc, status, client_name
            FROM invoices
            WHERE id = :iid AND organization_id = :org_id
        """),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    inv = inv_result.fetchone()
    if inv is None:
        raise HTTPException(404, "Facture introuvable")
    if inv[6] in ("draft", "cancelled"):
        raise HTTPException(409, "Impossible de créer un avoir pour cette facture")

    credit_id = uuid.uuid4()
    proforma_number = await generate_number("proforma", org_id, db)

    ht = Decimal(str(inv[3]))
    vat = Decimal(str(inv[4]))
    ttc = Decimal(str(inv[5]))

    await db.execute(
        text("""
            INSERT INTO invoices (
                id, organization_id, client_id, client_name,
                proforma_number,
                contract_id, is_credit_note, credit_note_for,
                status, issue_date, currency,
                subtotal_ht, total_vat, total_ttc,
                amount_paid, discount_type, discount_value,
                payment_terms, notes, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :client_name,
                :proforma_number,
                :contract_id, true, :cn_for,
                'draft', CURRENT_DATE, 'EUR',
                :ht, :vat, :ttc,
                0, 'none', 0,
                0, :notes, now(), now()
            )
        """),
        {
            "id": str(credit_id),
            "org_id": str(org_id),
            "client_id": inv[1],
            "client_name": inv[7],
            "proforma_number": proforma_number,
            "contract_id": inv[2],
            "cn_for": invoice_id,
            "ht": str(-ht),
            "vat": str(-vat),
            "ttc": str(-ttc),
            "notes": f"Avoir pour facture {invoice_id}",
        },
    )

    # Copier les lignes en négatif
    lines_result = await db.execute(
        text("""
            SELECT product_id::text, position, reference, description, quantity,
                   unit, unit_price, vat_rate, discount_percent,
                   total_ht, total_vat, account_code
            FROM invoice_lines WHERE invoice_id = :iid ORDER BY position
        """),
        {"iid": invoice_id},
    )
    for line in lines_result.fetchall():
        line_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO invoice_lines (
                    id, invoice_id, product_id, position,
                    reference, description, quantity, unit, unit_price,
                    vat_rate, discount_percent, total_ht, total_vat,
                    account_code
                ) VALUES (
                    :id, :iid, :pid, :pos,
                    :ref, :desc, :qty, :unit, :price,
                    :vat, :disc, :ht, :vat_amt,
                    :acct
                )
            """),
            {
                "id": str(line_id),
                "iid": str(credit_id),
                "pid": line[0],
                "pos": line[1],
                "ref": line[2],
                "desc": line[3],
                "qty": str(-Decimal(str(line[4]))),
                "unit": line[5],
                "price": str(line[6]),
                "vat": str(line[7]),
                "disc": str(line[8]),
                "ht": str(-Decimal(str(line[9]))),
                "vat_amt": str(-Decimal(str(line[10]))),
                "acct": line[11],
            },
        )

    # Annuler la facture originale
    await db.execute(
        text("UPDATE invoices SET status = 'cancelled', updated_at = now() WHERE id = :iid"),
        {"iid": invoice_id},
    )

    await db.commit()
    return {"id": str(credit_id), "proforma_number": proforma_number}


async def batch_archive(
    org_id: uuid.UUID, ids: list[str], archive: bool, db: AsyncSession
) -> dict:
    """Archive ou désarchive un lot de factures."""
    if not ids:
        return {"count": 0}
    placeholders = ", ".join(f":id_{i}" for i in range(len(ids)))
    params: dict = {"org_id": str(org_id), "archive": archive}
    for i, inv_id in enumerate(ids):
        params[f"id_{i}"] = inv_id
    result = await db.execute(
        text(f"""
            UPDATE invoices SET is_archived = :archive, updated_at = now()
            WHERE organization_id = :org_id AND id::text IN ({placeholders})
        """),
        params,
    )
    await db.commit()
    return {"count": result.rowcount}
