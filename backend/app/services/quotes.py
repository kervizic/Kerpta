# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — devis (DEV/BPU/Attachements/Avenants)."""

import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.quotes import QuoteCreate, QuoteLineIn, QuoteUpdate
from app.services.numbering import generate_number


def _calc_line(line: QuoteLineIn) -> dict:
    """Calcule total_ht et total_vat d'une ligne de devis."""
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


async def list_quotes(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    status: str | None = None,
    document_type: str | None = None,
    contract_id: str | None = None,
    client_id: str | None = None,
    search: str | None = None,
    client_search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginée des devis."""
    conditions = ["q.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}

    if status:
        conditions.append("q.status = :status")
        params["status"] = status
    if document_type:
        conditions.append("q.document_type = :doc_type")
        params["doc_type"] = document_type
    if contract_id:
        conditions.append("q.contract_id = :contract_id")
        params["contract_id"] = contract_id
    if client_id:
        conditions.append("q.client_id = :client_id")
        params["client_id"] = client_id
    if search:
        conditions.append("q.number ILIKE :search")
        params["search"] = f"%{search}%"
    if client_search:
        conditions.append("c.name ILIKE :client_search")
        params["client_search"] = f"%{client_search}%"
    if date_from:
        conditions.append("q.issue_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        conditions.append("q.issue_date <= :date_to")
        params["date_to"] = date_to

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM quotes q WHERE {where}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT q.id::text, q.number, q.client_id::text, c.name AS client_name,
                   q.document_type, q.show_quantity, q.contract_id::text,
                   q.is_avenant, q.avenant_number, q.bpu_source_id::text,
                   q.billing_profile_id::text,
                   q.status, q.issue_date, q.expiry_date,
                   q.subtotal_ht, q.total_vat, q.total_ttc,
                   q.discount_type, q.discount_value,
                   q.notes, q.footer, q.pdf_url,
                   q.sent_at, q.accepted_at, q.signature_status,
                   q.created_at, q.updated_at
            FROM quotes q
            JOIN clients c ON c.id = q.client_id
            WHERE {where}
            ORDER BY q.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [dict(row._mapping) for row in result.fetchall()]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def create_quote(
    org_id: uuid.UUID, user_id: uuid.UUID, data: QuoteCreate, db: AsyncSession
) -> dict:
    """Crée un devis en brouillon avec ses lignes."""
    quote_id = uuid.uuid4()
    number = await generate_number("quote", org_id, db)

    # Profil de facturation : celui fourni ou le profil par défaut
    billing_profile_id = data.billing_profile_id
    if not billing_profile_id:
        default_bp = await db.execute(
            text("SELECT id::text FROM billing_profiles WHERE organization_id = :org_id AND is_default = true LIMIT 1"),
            {"org_id": str(org_id)},
        )
        row = default_bp.fetchone()
        if row:
            billing_profile_id = row[0]

    # Calcul des totaux
    subtotal_ht = Decimal("0")
    total_vat = Decimal("0")
    for line in data.lines:
        calc = _calc_line(line)
        subtotal_ht += calc["total_ht"]
        total_vat += calc["total_vat"]
    total_ttc = subtotal_ht + total_vat

    # Gérer avenant_number auto-incrémenté
    avenant_number = None
    if data.is_avenant and data.contract_id:
        result = await db.execute(
            text("""
                SELECT COALESCE(MAX(avenant_number), 0) + 1
                FROM quotes
                WHERE contract_id = :cid AND is_avenant = true
            """),
            {"cid": data.contract_id},
        )
        avenant_number = result.scalar()

    await db.execute(
        text("""
            INSERT INTO quotes (
                id, organization_id, client_id, number, document_type,
                show_quantity, contract_id, is_avenant, avenant_number,
                bpu_source_id, billing_profile_id, status, issue_date, expiry_date,
                currency, subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value, notes, footer,
                signature_status, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :number, :doc_type,
                :show_qty, :contract_id, :is_avenant, :avenant_number,
                :bpu_source_id, :billing_profile_id, 'draft', :issue_date, :expiry_date,
                'EUR', :subtotal_ht, :total_vat, :total_ttc,
                :discount_type, :discount_value, :notes, :footer,
                'none', now(), now()
            )
        """),
        {
            "id": str(quote_id),
            "org_id": str(org_id),
            "client_id": data.client_id,
            "number": number,
            "doc_type": data.document_type,
            "show_qty": data.show_quantity,
            "contract_id": data.contract_id,
            "is_avenant": data.is_avenant,
            "avenant_number": avenant_number,
            "bpu_source_id": data.bpu_source_id,
            "billing_profile_id": billing_profile_id,
            "issue_date": data.issue_date,
            "expiry_date": data.expiry_date,
            "subtotal_ht": str(subtotal_ht),
            "total_vat": str(total_vat),
            "total_ttc": str(total_ttc),
            "discount_type": data.discount_type,
            "discount_value": str(data.discount_value),
            "notes": data.notes,
            "footer": data.footer,
        },
    )

    # Insérer les lignes
    for i, line in enumerate(data.lines):
        calc = _calc_line(line)
        line_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO quote_lines (
                    id, quote_id, product_id, client_product_variant_id,
                    position, reference, description, quantity, unit,
                    unit_price, vat_rate, discount_percent, total_ht, total_vat
                ) VALUES (
                    :id, :qid, :pid, :vid,
                    :pos, :ref, :desc, :qty, :unit,
                    :price, :vat, :disc, :ht, :vat_amt
                )
            """),
            {
                "id": str(line_id),
                "qid": str(quote_id),
                "pid": line.product_id,
                "vid": line.client_product_variant_id,
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
            },
        )

    await db.commit()
    return {"id": str(quote_id), "number": number}


async def get_quote(
    org_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Détail d'un devis avec ses lignes."""
    result = await db.execute(
        text("""
            SELECT q.id::text, q.number, q.client_id::text, c.name AS client_name,
                   q.document_type, q.show_quantity, q.contract_id::text,
                   q.is_avenant, q.avenant_number, q.bpu_source_id::text,
                   q.billing_profile_id::text,
                   q.status, q.issue_date, q.expiry_date,
                   q.subtotal_ht, q.total_vat, q.total_ttc,
                   q.discount_type, q.discount_value,
                   q.notes, q.footer, q.pdf_url,
                   q.sent_at, q.accepted_at, q.signature_status,
                   q.created_at, q.updated_at
            FROM quotes q
            JOIN clients c ON c.id = q.client_id
            WHERE q.id = :qid AND q.organization_id = :org_id
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Devis introuvable")
    quote = dict(row._mapping)

    lines_result = await db.execute(
        text("""
            SELECT ql.id::text, ql.product_id::text, ql.position,
                   ql.reference, ql.description, ql.quantity, ql.unit,
                   ql.unit_price, ql.vat_rate, ql.discount_percent,
                   ql.total_ht, ql.total_vat
            FROM quote_lines ql
            WHERE ql.quote_id = :qid
            ORDER BY ql.position
        """),
        {"qid": quote_id},
    )
    quote["lines"] = [dict(r._mapping) for r in lines_result.fetchall()]
    return quote


async def update_quote(
    org_id: uuid.UUID, quote_id: str, data: QuoteUpdate, db: AsyncSession
) -> dict:
    """Met à jour un devis (draft ou envoyé — éditable tant que non validé)."""
    # Vérifier statut
    status_result = await db.execute(
        text("SELECT status FROM quotes WHERE id = :qid AND organization_id = :org_id"),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    row = status_result.fetchone()
    if row is None:
        raise HTTPException(404, "Devis introuvable")
    if row[0] not in ("draft", "sent"):
        raise HTTPException(409, "Les devis validés ou refusés ne peuvent plus être modifiés")

    updates = data.model_dump(exclude_unset=True, exclude={"lines"})
    if updates:
        set_parts = []
        params: dict = {"qid": quote_id, "org_id": str(org_id)}
        for key, value in updates.items():
            set_parts.append(f"{key} = :{key}")
            params[key] = str(value) if isinstance(value, Decimal) else value
        set_parts.append("updated_at = now()")

        await db.execute(
            text(f"UPDATE quotes SET {', '.join(set_parts)} WHERE id = :qid AND organization_id = :org_id"),
            params,
        )

    # Recréer les lignes si fournies
    if data.lines is not None:
        await db.execute(
            text("DELETE FROM quote_lines WHERE quote_id = :qid"),
            {"qid": quote_id},
        )
        subtotal_ht = Decimal("0")
        total_vat = Decimal("0")
        for i, line in enumerate(data.lines):
            calc = _calc_line(line)
            subtotal_ht += calc["total_ht"]
            total_vat += calc["total_vat"]
            line_id = uuid.uuid4()
            await db.execute(
                text("""
                    INSERT INTO quote_lines (
                        id, quote_id, product_id, client_product_variant_id,
                        position, reference, description, quantity, unit,
                        unit_price, vat_rate, discount_percent, total_ht, total_vat
                    ) VALUES (
                        :id, :qid, :pid, :vid,
                        :pos, :ref, :desc, :qty, :unit,
                        :price, :vat, :disc, :ht, :vat_amt
                    )
                """),
                {
                    "id": str(line_id),
                    "qid": quote_id,
                    "pid": line.product_id,
                    "vid": line.client_product_variant_id,
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
                },
            )
        total_ttc = subtotal_ht + total_vat
        await db.execute(
            text("""
                UPDATE quotes SET subtotal_ht = :ht, total_vat = :vat, total_ttc = :ttc, updated_at = now()
                WHERE id = :qid
            """),
            {"ht": str(subtotal_ht), "vat": str(total_vat), "ttc": str(total_ttc), "qid": quote_id},
        )

    await db.commit()
    return {"status": "updated"}


async def send_quote(
    org_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Marque un devis comme envoyé."""
    result = await db.execute(
        text("""
            UPDATE quotes SET status = 'sent', sent_at = now(), updated_at = now()
            WHERE id = :qid AND organization_id = :org_id AND status = 'draft'
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(409, "Le devis ne peut pas être envoyé (statut invalide)")
    await db.commit()
    return {"status": "sent"}


async def accept_quote(
    org_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Marque un devis comme accepté et met à jour le budget du contrat si lié."""
    result = await db.execute(
        text("""
            UPDATE quotes SET status = 'accepted', accepted_at = now(), updated_at = now()
            WHERE id = :qid AND organization_id = :org_id AND status IN ('sent', 'draft')
            RETURNING contract_id::text
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(409, "Le devis ne peut pas être accepté (statut invalide)")

    # Recalculer le budget du contrat si lié
    contract_id = row[0]
    if contract_id:
        await _update_contract_budget(contract_id, db)

    await db.commit()
    return {"status": "accepted"}


async def refuse_quote(
    org_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Marque un devis comme refusé."""
    result = await db.execute(
        text("""
            UPDATE quotes SET status = 'refused', updated_at = now()
            WHERE id = :qid AND organization_id = :org_id AND status IN ('sent', 'draft')
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(409, "Le devis ne peut pas être refusé (statut invalide)")
    await db.commit()
    return {"status": "refused"}


async def duplicate_quote(
    org_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Duplique un devis existant en brouillon."""
    quote = await get_quote(org_id, quote_id, db)
    new_id = uuid.uuid4()
    new_number = await generate_number("quote", org_id, db)

    await db.execute(
        text("""
            INSERT INTO quotes (
                id, organization_id, client_id, number, document_type,
                show_quantity, billing_profile_id, status, issue_date, expiry_date,
                currency, subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value, notes, footer,
                signature_status, created_at, updated_at
            )
            SELECT :new_id, organization_id, client_id, :new_number, document_type,
                   show_quantity, billing_profile_id, 'draft', CURRENT_DATE, expiry_date,
                   currency, subtotal_ht, total_vat, total_ttc,
                   discount_type, discount_value, notes, footer,
                   'none', now(), now()
            FROM quotes WHERE id = :qid
        """),
        {"new_id": str(new_id), "new_number": new_number, "qid": quote_id},
    )

    # Copier les lignes
    for line in quote.get("lines", []):
        line_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO quote_lines (
                    id, quote_id, product_id, position, reference,
                    description, quantity, unit, unit_price, vat_rate,
                    discount_percent, total_ht, total_vat
                ) VALUES (
                    :id, :qid, :pid, :pos, :ref,
                    :desc, :qty, :unit, :price, :vat,
                    :disc, :ht, :vat_amt
                )
            """),
            {
                "id": str(line_id),
                "qid": str(new_id),
                "pid": line.get("product_id"),
                "pos": line["position"],
                "ref": line.get("reference"),
                "desc": line.get("description"),
                "qty": str(line["quantity"]),
                "unit": line.get("unit"),
                "price": str(line["unit_price"]),
                "vat": str(line["vat_rate"]),
                "disc": str(line["discount_percent"]),
                "ht": str(line["total_ht"]),
                "vat_amt": str(line["total_vat"]),
            },
        )

    await db.commit()
    return {"id": str(new_id), "number": new_number}


async def convert_to_contract(
    org_id: uuid.UUID, user_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Crée un contrat depuis un devis (BPU → progress_billing, sinon fixed_price)."""
    from app.services.contracts import create_contract_from_quote

    return await create_contract_from_quote(org_id, user_id, quote_id, db)


async def _update_contract_budget(contract_id: str, db: AsyncSession) -> None:
    """Recalcule total_budget d'un contrat depuis les devis acceptés."""
    await db.execute(
        text("""
            UPDATE contracts SET total_budget = (
                SELECT COALESCE(SUM(subtotal_ht), 0)
                FROM quotes
                WHERE contract_id = :cid AND status = 'accepted'
            ), updated_at = now()
            WHERE id = :cid
        """),
        {"cid": contract_id},
    )
