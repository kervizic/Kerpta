# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service metier - documents d'execution (commandes, BL, attachements, situations)."""

import uuid
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.execution import (
    ExecutionCreate,
    ExecutionFromContract,
    ExecutionFromExecution,
    ExecutionFromQuote,
    ExecutionInvoiceRequest,
    ExecutionLineIn,
    ExecutionUpdate,
)

# Mapping exec_type -> prefixe de numerotation
_TYPE_PREFIX = {
    "order": "BC",
    "delivery": "BL",
    "work_report": "AT",
    "progress": "SA",
}


# ── Numerotation ────────────────────────────────────────────────────────────


async def _next_number(
    org_id: uuid.UUID, exec_type: str, db: AsyncSession
) -> str:
    """Genere le prochain numero sequentiel par type et par org."""
    prefix = _TYPE_PREFIX[exec_type]
    year = date.today().year
    pattern = f"{prefix}-{year}-%"

    lock_key = abs(hash((str(org_id), f"exec_{exec_type}"))) % (2**31)
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    result = await db.execute(
        text("""
            SELECT COALESCE(
                MAX(CAST(SUBSTRING(number FROM '.{4}$') AS INTEGER)),
                0
            ) AS last_seq
            FROM execution_documents
            WHERE organization_id = :org_id
              AND number LIKE :pattern
        """),
        {"org_id": str(org_id), "pattern": pattern},
    )
    row = result.fetchone()
    next_seq = (row[0] if row else 0) + 1
    return f"{prefix}-{year}-{next_seq:04d}"


# ── Calculs ─────────────────────────────────────────────────────────────────


def _calc_line(line: dict) -> dict:
    """Calcul total_ht et total_vat pour une ligne quantite."""
    qty = Decimal(str(line.get("quantity", 0) or 0))
    price = Decimal(str(line.get("unit_price", 0) or 0))
    discount = Decimal(str(line.get("discount_percent", 0) or 0)) / Decimal("100")
    total_ht = (qty * price * (Decimal("1") - discount)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    vat_rate = Decimal(str(line.get("vat_rate", 0) or 0))
    total_vat = (total_ht * vat_rate / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return {"total_ht": total_ht, "total_vat": total_vat}


def _calc_progress_line(line: dict) -> dict:
    """Calcul des montants pour une ligne de situation."""
    total_contract = Decimal(str(line.get("total_contract", 0) or 0))
    current_pct = Decimal(str(line.get("current_pct", 0) or 0))
    previous_pct = Decimal(str(line.get("previous_pct", 0) or 0))
    previously_invoiced = Decimal(str(line.get("previously_invoiced", 0) or 0))

    cumulative_amount = (total_contract * current_pct / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    line_invoice_amount = (cumulative_amount - previously_invoiced).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return {
        "cumulative_amount": cumulative_amount,
        "previously_invoiced": previously_invoiced,
        "line_invoice_amount": line_invoice_amount,
    }


def _calc_document_totals(lines: list[dict], exec_type: str) -> dict:
    """Calcule les totaux d'un document depuis ses lignes."""
    subtotal_ht = Decimal("0")
    total_vat = Decimal("0")
    if exec_type == "progress":
        for line in lines:
            subtotal_ht += Decimal(str(line.get("line_invoice_amount", 0) or 0))
    else:
        for line in lines:
            subtotal_ht += Decimal(str(line.get("total_ht", 0) or 0))
            total_vat += Decimal(str(line.get("total_vat", 0) or 0))
    total_ttc = subtotal_ht + total_vat
    return {
        "subtotal_ht": subtotal_ht.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "total_vat": total_vat.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "total_ttc": total_ttc.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    }


# ── CRUD ────────────────────────────────────────────────────────────────────


async def list_executions(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    exec_type: str | None = None,
    status: str | None = None,
    client_id: str | None = None,
    contract_id: str | None = None,
    search: str | None = None,
    archived: bool | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginee avec filtres."""
    conditions = ["ed.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}

    if archived is not None:
        conditions.append("ed.is_archived = :archived")
        params["archived"] = archived
    else:
        conditions.append("ed.is_archived = false")

    if exec_type:
        conditions.append("ed.exec_type = :exec_type")
        params["exec_type"] = exec_type
    if status:
        conditions.append("ed.status = :status")
        params["status"] = status
    if client_id:
        conditions.append("ed.client_id = :client_id")
        params["client_id"] = client_id
    if contract_id:
        conditions.append("ed.contract_id = :contract_id")
        params["contract_id"] = contract_id
    if search:
        conditions.append("(ed.number ILIKE :search OR c.name ILIKE :search)")
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"""
            SELECT COUNT(*) FROM execution_documents ed
            LEFT JOIN clients c ON c.id = ed.client_id
            WHERE {where}
        """),
        params,
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT ed.id::text, ed.exec_type, ed.number, ed.client_id::text,
                   c.name AS client_name, ed.status, ed.period_label,
                   ed.client_reference, ed.observation_date,
                   ed.source_quote_id::text, ed.contract_id::text,
                   ed.invoice_id::text, ed.situation_number,
                   ed.subtotal_ht, ed.total_vat, ed.total_ttc,
                   ed.discount_type, ed.discount_value,
                   ed.is_archived, ed.created_at, ed.updated_at
            FROM execution_documents ed
            LEFT JOIN clients c ON c.id = ed.client_id
            WHERE {where}
            ORDER BY ed.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [dict(row._mapping) for row in result.fetchall()]

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


async def get_execution(
    org_id: uuid.UUID, exec_id: str, db: AsyncSession
) -> dict:
    """Detail complet avec lignes, liens et chaine."""
    result = await db.execute(
        text("""
            SELECT ed.id::text, ed.exec_type, ed.number, ed.client_id::text,
                   c.name AS client_name, ed.status, ed.period_label,
                   ed.client_reference, ed.observation_date, ed.notes,
                   ed.source_quote_id::text, ed.contract_id::text,
                   ed.invoice_id::text, ed.situation_number,
                   ed.billing_profile_id::text,
                   ed.subtotal_ht, ed.total_vat, ed.total_ttc,
                   ed.discount_type, ed.discount_value,
                   ed.is_archived, ed.validated_at, ed.created_by::text,
                   ed.created_at, ed.updated_at,
                   q.number AS source_quote_number,
                   ct.reference AS contract_reference,
                   inv.number AS invoice_number
            FROM execution_documents ed
            LEFT JOIN clients c ON c.id = ed.client_id
            LEFT JOIN quotes q ON q.id = ed.source_quote_id
            LEFT JOIN contracts ct ON ct.id = ed.contract_id
            LEFT JOIN invoices inv ON inv.id = ed.invoice_id
            WHERE ed.id = :eid AND ed.organization_id = :org_id
        """),
        {"eid": exec_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Document d'execution introuvable")
    doc = dict(row._mapping)

    # Lignes
    lines_result = await db.execute(
        text("""
            SELECT el.id::text, el.position, el.reference, el.description,
                   el.unit, el.product_id::text, el.unit_price, el.vat_rate,
                   el.discount_percent, el.source_line_id::text,
                   el.source_quote_id::text,
                   el.quantity, el.total_ht, el.total_vat,
                   el.total_contract, el.previous_pct, el.current_pct,
                   el.cumulative_amount, el.previously_invoiced,
                   el.line_invoice_amount
            FROM execution_lines el
            WHERE el.execution_document_id = :eid
            ORDER BY el.position
        """),
        {"eid": exec_id},
    )
    doc["lines"] = [dict(r._mapping) for r in lines_result.fetchall()]

    # Liens
    doc["linked_documents"] = await get_linked_documents(org_id, exec_id, db)

    return doc


async def create_execution(
    org_id: uuid.UUID, user_id: uuid.UUID, data: ExecutionCreate, db: AsyncSession
) -> dict:
    """Creation manuelle avec calcul des totaux."""
    exec_id = uuid.uuid4()
    number = await _next_number(org_id, data.exec_type, db)

    # Calculer les lignes
    line_dicts = []
    for i, line in enumerate(data.lines):
        ld = line.model_dump()
        ld["position"] = line.position or i
        if data.exec_type == "progress":
            ld["previous_pct"] = 0
            calc = _calc_progress_line(ld)
            ld.update(calc)
        else:
            calc = _calc_line(ld)
            ld.update(calc)
        line_dicts.append(ld)

    totals = _calc_document_totals(line_dicts, data.exec_type)

    # Profil de facturation
    billing_profile_id = data.billing_profile_id
    if not billing_profile_id:
        bp = await db.execute(
            text("SELECT id::text FROM billing_profiles WHERE organization_id = :org_id AND is_default = true LIMIT 1"),
            {"org_id": str(org_id)},
        )
        row = bp.fetchone()
        if row:
            billing_profile_id = row[0]

    await db.execute(
        text("""
            INSERT INTO execution_documents (
                id, organization_id, exec_type, number, client_id,
                source_quote_id, contract_id, status,
                period_label, client_reference, observation_date, notes,
                billing_profile_id,
                subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value,
                created_by, created_at, updated_at
            ) VALUES (
                :id, :org_id, :exec_type, :number, :client_id,
                :source_quote_id, :contract_id, 'draft',
                :period_label, :client_reference, :observation_date, :notes,
                :billing_profile_id,
                :subtotal_ht, :total_vat, :total_ttc,
                :discount_type, :discount_value,
                :created_by, now(), now()
            )
        """),
        {
            "id": str(exec_id),
            "org_id": str(org_id),
            "exec_type": data.exec_type,
            "number": number,
            "client_id": data.client_id,
            "source_quote_id": data.source_quote_id,
            "contract_id": data.contract_id,
            "period_label": data.period_label,
            "client_reference": data.client_reference,
            "observation_date": data.observation_date,
            "notes": data.notes,
            "billing_profile_id": billing_profile_id,
            "subtotal_ht": str(totals["subtotal_ht"]),
            "total_vat": str(totals["total_vat"]),
            "total_ttc": str(totals["total_ttc"]),
            "discount_type": data.discount_type,
            "discount_value": str(data.discount_value),
            "created_by": str(user_id),
        },
    )

    # Inserer les lignes
    for ld in line_dicts:
        line_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO execution_lines (
                    id, execution_document_id, source_line_id, source_quote_id,
                    position, reference, description, unit, product_id,
                    unit_price, vat_rate, discount_percent,
                    quantity, total_ht, total_vat,
                    total_contract, previous_pct, current_pct,
                    cumulative_amount, previously_invoiced, line_invoice_amount,
                    created_at, updated_at
                ) VALUES (
                    :id, :doc_id, :source_line_id, :source_quote_id,
                    :position, :reference, :description, :unit, :product_id,
                    :unit_price, :vat_rate, :discount_percent,
                    :quantity, :total_ht, :total_vat,
                    :total_contract, :previous_pct, :current_pct,
                    :cumulative_amount, :previously_invoiced, :line_invoice_amount,
                    now(), now()
                )
            """),
            {
                "id": str(line_id),
                "doc_id": str(exec_id),
                "source_line_id": ld.get("source_line_id"),
                "source_quote_id": ld.get("source_quote_id"),
                "position": ld["position"],
                "reference": ld.get("reference"),
                "description": ld.get("description"),
                "unit": ld.get("unit"),
                "product_id": ld.get("product_id"),
                "unit_price": str(ld.get("unit_price", 0)),
                "vat_rate": str(ld.get("vat_rate", 0)),
                "discount_percent": str(ld.get("discount_percent", 0) or 0),
                "quantity": str(ld.get("quantity", 0) or 0),
                "total_ht": str(ld.get("total_ht", 0) or 0),
                "total_vat": str(ld.get("total_vat", 0) or 0),
                "total_contract": str(ld.get("total_contract", 0) or 0),
                "previous_pct": str(ld.get("previous_pct", 0) or 0),
                "current_pct": str(ld.get("current_pct", 0) or 0),
                "cumulative_amount": str(ld.get("cumulative_amount", 0) or 0),
                "previously_invoiced": str(ld.get("previously_invoiced", 0) or 0),
                "line_invoice_amount": str(ld.get("line_invoice_amount", 0) or 0),
            },
        )

    await db.commit()
    return {"id": str(exec_id), "number": number}


async def update_execution(
    org_id: uuid.UUID, exec_id: str, data: ExecutionUpdate, db: AsyncSession
) -> dict:
    """Modification (draft uniquement)."""
    # Verifier statut
    status_result = await db.execute(
        text("SELECT status, exec_type FROM execution_documents WHERE id = :eid AND organization_id = :org_id"),
        {"eid": exec_id, "org_id": str(org_id)},
    )
    row = status_result.fetchone()
    if row is None:
        raise HTTPException(404, "Document d'execution introuvable")
    if row[0] != "draft":
        raise HTTPException(409, "Seuls les brouillons peuvent etre modifies")
    exec_type = row[1]

    updates = data.model_dump(exclude_unset=True, exclude={"lines"})
    if updates:
        set_parts = []
        params: dict = {"eid": exec_id, "org_id": str(org_id)}
        for key, value in updates.items():
            set_parts.append(f"{key} = :{key}")
            params[key] = str(value) if isinstance(value, Decimal) else value
        set_parts.append("updated_at = now()")
        await db.execute(
            text(f"UPDATE execution_documents SET {', '.join(set_parts)} WHERE id = :eid AND organization_id = :org_id"),
            params,
        )

    # Recreer les lignes si fournies
    if data.lines is not None:
        await db.execute(
            text("DELETE FROM execution_lines WHERE execution_document_id = :eid"),
            {"eid": exec_id},
        )
        line_dicts = []
        for i, line in enumerate(data.lines):
            ld = line.model_dump()
            ld["position"] = line.position or i
            if exec_type == "progress":
                calc = _calc_progress_line(ld)
                ld.update(calc)
            else:
                calc = _calc_line(ld)
                ld.update(calc)
            line_dicts.append(ld)

        totals = _calc_document_totals(line_dicts, exec_type)

        for ld in line_dicts:
            line_id = uuid.uuid4()
            await db.execute(
                text("""
                    INSERT INTO execution_lines (
                        id, execution_document_id, source_line_id, source_quote_id,
                        position, reference, description, unit, product_id,
                        unit_price, vat_rate, discount_percent,
                        quantity, total_ht, total_vat,
                        total_contract, previous_pct, current_pct,
                        cumulative_amount, previously_invoiced, line_invoice_amount,
                        created_at, updated_at
                    ) VALUES (
                        :id, :doc_id, :source_line_id, :source_quote_id,
                        :position, :reference, :description, :unit, :product_id,
                        :unit_price, :vat_rate, :discount_percent,
                        :quantity, :total_ht, :total_vat,
                        :total_contract, :previous_pct, :current_pct,
                        :cumulative_amount, :previously_invoiced, :line_invoice_amount,
                        now(), now()
                    )
                """),
                {
                    "id": str(line_id),
                    "doc_id": exec_id,
                    "source_line_id": ld.get("source_line_id"),
                    "source_quote_id": ld.get("source_quote_id"),
                    "position": ld["position"],
                    "reference": ld.get("reference"),
                    "description": ld.get("description"),
                    "unit": ld.get("unit"),
                    "product_id": ld.get("product_id"),
                    "unit_price": str(ld.get("unit_price", 0)),
                    "vat_rate": str(ld.get("vat_rate", 0)),
                    "discount_percent": str(ld.get("discount_percent", 0) or 0),
                    "quantity": str(ld.get("quantity", 0) or 0),
                    "total_ht": str(ld.get("total_ht", 0) or 0),
                    "total_vat": str(ld.get("total_vat", 0) or 0),
                    "total_contract": str(ld.get("total_contract", 0) or 0),
                    "previous_pct": str(ld.get("previous_pct", 0) or 0),
                    "current_pct": str(ld.get("current_pct", 0) or 0),
                    "cumulative_amount": str(ld.get("cumulative_amount", 0) or 0),
                    "previously_invoiced": str(ld.get("previously_invoiced", 0) or 0),
                    "line_invoice_amount": str(ld.get("line_invoice_amount", 0) or 0),
                },
            )

        await db.execute(
            text("""
                UPDATE execution_documents
                SET subtotal_ht = :ht, total_vat = :vat, total_ttc = :ttc, updated_at = now()
                WHERE id = :eid
            """),
            {
                "ht": str(totals["subtotal_ht"]),
                "vat": str(totals["total_vat"]),
                "ttc": str(totals["total_ttc"]),
                "eid": exec_id,
            },
        )

    await db.commit()
    return {"status": "updated"}


async def validate_execution(
    org_id: uuid.UUID, exec_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Passage draft -> validated."""
    result = await db.execute(
        text("""
            UPDATE execution_documents
            SET status = 'validated', validated_at = now(), validated_by = :uid, updated_at = now()
            WHERE id = :eid AND organization_id = :org_id AND status = 'draft'
        """),
        {"eid": exec_id, "org_id": str(org_id), "uid": str(user_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(409, "Le document ne peut pas etre valide (statut invalide)")
    await db.commit()
    return {"status": "validated"}


async def delete_execution(
    org_id: uuid.UUID, exec_id: str, db: AsyncSession
) -> dict:
    """Suppression (draft uniquement)."""
    result = await db.execute(
        text("""
            DELETE FROM execution_documents
            WHERE id = :eid AND organization_id = :org_id AND status = 'draft'
        """),
        {"eid": exec_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(409, "Seuls les brouillons peuvent etre supprimes")
    await db.commit()
    return {"status": "deleted"}


async def duplicate_execution(
    org_id: uuid.UUID, exec_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Duplique un document d'execution en brouillon."""
    doc = await get_execution(org_id, exec_id, db)
    lines = [
        ExecutionLineIn(
            position=ln["position"],
            reference=ln.get("reference"),
            description=ln.get("description"),
            unit=ln.get("unit"),
            product_id=ln.get("product_id"),
            unit_price=Decimal(str(ln.get("unit_price", 0))),
            vat_rate=Decimal(str(ln.get("vat_rate", 0))),
            discount_percent=Decimal(str(ln.get("discount_percent", 0) or 0)),
            quantity=Decimal(str(ln.get("quantity", 0) or 0)) if ln.get("quantity") else None,
            total_contract=Decimal(str(ln.get("total_contract", 0) or 0)) if ln.get("total_contract") else None,
            current_pct=Decimal(str(ln.get("current_pct", 0) or 0)) if ln.get("current_pct") else None,
        )
        for ln in doc.get("lines", [])
    ]
    data = ExecutionCreate(
        exec_type=doc["exec_type"],
        client_id=doc["client_id"],
        source_quote_id=doc.get("source_quote_id"),
        contract_id=doc.get("contract_id"),
        period_label=doc.get("period_label"),
        notes=doc.get("notes"),
        billing_profile_id=doc.get("billing_profile_id"),
        discount_type=doc.get("discount_type", "none"),
        discount_value=Decimal(str(doc.get("discount_value", 0))),
        lines=lines,
    )
    return await create_execution(org_id, user_id, data, db)


async def archive_executions(
    org_id: uuid.UUID, exec_ids: list[str], archive: bool, db: AsyncSession
) -> dict:
    """Archivage en lot."""
    if not exec_ids:
        return {"count": 0}
    placeholders = ", ".join(f":id_{i}" for i in range(len(exec_ids)))
    params: dict = {"org_id": str(org_id), "archive": archive}
    for i, eid in enumerate(exec_ids):
        params[f"id_{i}"] = eid
    result = await db.execute(
        text(f"""
            UPDATE execution_documents SET is_archived = :archive, updated_at = now()
            WHERE organization_id = :org_id AND id::text IN ({placeholders})
        """),
        params,
    )
    await db.commit()
    return {"count": result.rowcount}


# ── Pre-remplissage ─────────────────────────────────────────────────────────


async def create_from_quote(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    quote_id: str,
    data: ExecutionFromQuote,
    db: AsyncSession,
) -> dict:
    """Cree un document d'execution pre-rempli depuis un devis."""
    # Charger le devis
    q = await db.execute(
        text("""
            SELECT q.id::text, q.client_id::text, q.contract_id::text,
                   q.billing_profile_id::text, q.discount_type, q.discount_value
            FROM quotes q
            WHERE q.id = :qid AND q.organization_id = :org_id
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    quote = q.fetchone()
    if quote is None:
        raise HTTPException(404, "Devis introuvable")
    quote_data = dict(quote._mapping)

    # Charger les lignes du devis
    lines_result = await db.execute(
        text("""
            SELECT ql.id::text AS line_id, ql.position, ql.reference,
                   ql.description, ql.quantity, ql.unit,
                   ql.unit_price, ql.vat_rate, ql.discount_percent,
                   ql.total_ht, ql.product_id::text
            FROM quote_lines ql
            WHERE ql.quote_id = :qid
            ORDER BY ql.position
        """),
        {"qid": quote_id},
    )
    quote_lines = [dict(r._mapping) for r in lines_result.fetchall()]

    # Pour les situations : calculer total_contract et previous_pct
    lines = []
    if data.exec_type == "progress":
        # Chercher la derniere situation validee du contrat
        contract_id = quote_data.get("contract_id")
        prev_lines = {}
        if contract_id:
            prev_result = await db.execute(
                text("""
                    SELECT el.source_line_id::text, el.current_pct, el.cumulative_amount
                    FROM execution_lines el
                    JOIN execution_documents ed ON ed.id = el.execution_document_id
                    WHERE ed.contract_id = :cid
                      AND ed.exec_type = 'progress'
                      AND ed.status IN ('validated', 'invoiced')
                    ORDER BY ed.situation_number DESC
                """),
                {"cid": contract_id},
            )
            for row in prev_result.fetchall():
                r = dict(row._mapping)
                lid = r["source_line_id"]
                if lid and lid not in prev_lines:
                    prev_lines[lid] = r

        for ql in quote_lines:
            prev = prev_lines.get(ql["line_id"], {})
            total_contract = Decimal(str(ql["quantity"])) * Decimal(str(ql["unit_price"]))
            total_contract = total_contract.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            lines.append(ExecutionLineIn(
                position=ql["position"],
                reference=ql.get("reference"),
                description=ql.get("description"),
                unit=ql.get("unit"),
                product_id=ql.get("product_id"),
                unit_price=Decimal(str(ql["unit_price"])),
                vat_rate=Decimal(str(ql["vat_rate"])),
                discount_percent=Decimal("0"),
                total_contract=total_contract,
                current_pct=Decimal(str(prev.get("current_pct", 0) or 0)),
                source_line_id=ql["line_id"],
                source_quote_id=quote_id,
            ))
    else:
        for ql in quote_lines:
            lines.append(ExecutionLineIn(
                position=ql["position"],
                reference=ql.get("reference"),
                description=ql.get("description"),
                unit=ql.get("unit"),
                product_id=ql.get("product_id"),
                unit_price=Decimal(str(ql["unit_price"])),
                vat_rate=Decimal(str(ql["vat_rate"])),
                discount_percent=Decimal(str(ql.get("discount_percent", 0))),
                quantity=Decimal(str(ql["quantity"])),
                source_line_id=ql["line_id"],
                source_quote_id=quote_id,
            ))

    create_data = ExecutionCreate(
        exec_type=data.exec_type,
        client_id=quote_data["client_id"],
        source_quote_id=quote_id,
        contract_id=quote_data.get("contract_id"),
        client_reference=data.client_reference,
        period_label=data.period_label,
        billing_profile_id=quote_data.get("billing_profile_id"),
        discount_type=quote_data.get("discount_type", "none"),
        discount_value=Decimal(str(quote_data.get("discount_value", 0))),
        lines=lines,
    )
    return await create_execution(org_id, user_id, create_data, db)


async def create_from_execution(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    exec_id: str,
    data: ExecutionFromExecution,
    db: AsyncSession,
) -> dict:
    """Cree un document d'execution depuis un autre (ex: BL depuis commande)."""
    source = await get_execution(org_id, exec_id, db)

    # Pour les BL depuis commande : calculer les quantites restantes
    lines = []
    if data.exec_type == "delivery" and source["exec_type"] == "order":
        # Somme des BL precedents lies a cette commande
        prev_result = await db.execute(
            text("""
                SELECT el.source_line_id::text, COALESCE(SUM(el.quantity), 0) AS delivered
                FROM execution_lines el
                JOIN execution_documents ed ON ed.id = el.execution_document_id
                JOIN execution_links lk ON (
                    (lk.execution_a_id = :src_id AND lk.execution_b_id = ed.id)
                    OR (lk.execution_b_id = :src_id AND lk.execution_a_id = ed.id)
                )
                WHERE ed.exec_type = 'delivery'
                  AND ed.status != 'draft'
                GROUP BY el.source_line_id
            """),
            {"src_id": exec_id},
        )
        delivered = {}
        for row in prev_result.fetchall():
            r = dict(row._mapping)
            if r["source_line_id"]:
                delivered[r["source_line_id"]] = Decimal(str(r["delivered"]))

        for sl in source.get("lines", []):
            cmd_qty = Decimal(str(sl.get("quantity", 0) or 0))
            already = delivered.get(sl["id"], Decimal("0"))
            remaining = cmd_qty - already
            if remaining > 0:
                lines.append(ExecutionLineIn(
                    position=sl["position"],
                    reference=sl.get("reference"),
                    description=sl.get("description"),
                    unit=sl.get("unit"),
                    product_id=sl.get("product_id"),
                    unit_price=Decimal(str(sl.get("unit_price", 0))),
                    vat_rate=Decimal(str(sl.get("vat_rate", 0))),
                    discount_percent=Decimal(str(sl.get("discount_percent", 0) or 0)),
                    quantity=remaining,
                    source_line_id=sl["id"],
                    source_quote_id=sl.get("source_quote_id"),
                ))
    else:
        for sl in source.get("lines", []):
            lines.append(ExecutionLineIn(
                position=sl["position"],
                reference=sl.get("reference"),
                description=sl.get("description"),
                unit=sl.get("unit"),
                product_id=sl.get("product_id"),
                unit_price=Decimal(str(sl.get("unit_price", 0))),
                vat_rate=Decimal(str(sl.get("vat_rate", 0))),
                discount_percent=Decimal(str(sl.get("discount_percent", 0) or 0)),
                quantity=Decimal(str(sl.get("quantity", 0) or 0)) if sl.get("quantity") else None,
                source_line_id=sl["id"],
                source_quote_id=sl.get("source_quote_id"),
            ))

    create_data = ExecutionCreate(
        exec_type=data.exec_type,
        client_id=source["client_id"],
        source_quote_id=source.get("source_quote_id"),
        contract_id=source.get("contract_id"),
        period_label=data.period_label,
        billing_profile_id=source.get("billing_profile_id"),
        lines=lines,
    )
    result = await create_execution(org_id, user_id, create_data, db)

    # Creer le lien horizontal automatiquement
    await create_link(org_id, exec_id, result["id"], "fulfills", db)

    return result


async def create_from_contract(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    contract_id: str,
    data: ExecutionFromContract,
    db: AsyncSession,
) -> dict:
    """Cree un document d'execution depuis un contrat."""
    # Charger le contrat et son BPU
    ct = await db.execute(
        text("""
            SELECT ct.id::text, ct.client_id::text, ct.bpu_quote_id::text
            FROM contracts ct
            WHERE ct.id = :cid AND ct.organization_id = :org_id
        """),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    contract = ct.fetchone()
    if contract is None:
        raise HTTPException(404, "Contrat introuvable")
    contract_data = dict(contract._mapping)

    bpu_id = contract_data.get("bpu_quote_id")
    if not bpu_id:
        raise HTTPException(422, "Le contrat n'a pas de BPU rattache")

    # Pour les situations : verifier qu'il n'y a pas de draft
    if data.exec_type == "progress":
        draft_check = await db.execute(
            text("""
                SELECT COUNT(*) FROM execution_documents
                WHERE contract_id = :cid AND exec_type = 'progress' AND status = 'draft'
            """),
            {"cid": contract_id},
        )
        if (draft_check.scalar() or 0) > 0:
            raise HTTPException(
                409, "Une situation en brouillon existe deja pour ce contrat"
            )

    # Charger les lignes du BPU + avenants acceptes
    bpu_lines_result = await db.execute(
        text("""
            SELECT ql.id::text AS line_id, ql.position, ql.reference,
                   ql.description, ql.quantity, ql.unit,
                   ql.unit_price, ql.vat_rate, ql.discount_percent,
                   ql.product_id::text, q.id::text AS quote_id
            FROM quote_lines ql
            JOIN quotes q ON q.id = ql.quote_id
            WHERE (q.id = :bpu_id OR (q.contract_id = :cid AND q.is_avenant = true AND q.status = 'accepted'))
            ORDER BY q.created_at, ql.position
        """),
        {"bpu_id": bpu_id, "cid": contract_id},
    )
    bpu_lines = [dict(r._mapping) for r in bpu_lines_result.fetchall()]

    # Situation number auto-incremente
    situation_number = None
    if data.exec_type == "progress":
        sn_result = await db.execute(
            text("""
                SELECT COALESCE(MAX(situation_number), 0) + 1
                FROM execution_documents
                WHERE contract_id = :cid AND exec_type = 'progress'
            """),
            {"cid": contract_id},
        )
        situation_number = sn_result.scalar()

    # Chercher la derniere situation validee pour pre-remplir
    prev_lines = {}
    if data.exec_type == "progress":
        prev_result = await db.execute(
            text("""
                SELECT el.source_line_id::text, el.current_pct, el.cumulative_amount
                FROM execution_lines el
                JOIN execution_documents ed ON ed.id = el.execution_document_id
                WHERE ed.contract_id = :cid
                  AND ed.exec_type = 'progress'
                  AND ed.status IN ('validated', 'invoiced')
                ORDER BY ed.situation_number DESC
            """),
            {"cid": contract_id},
        )
        for row in prev_result.fetchall():
            r = dict(row._mapping)
            lid = r["source_line_id"]
            if lid and lid not in prev_lines:
                prev_lines[lid] = r

    lines = []
    for bl in bpu_lines:
        total_contract = Decimal(str(bl["quantity"])) * Decimal(str(bl["unit_price"]))
        total_contract = total_contract.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        if data.exec_type == "progress":
            prev = prev_lines.get(bl["line_id"], {})
            prev_pct = Decimal(str(prev.get("current_pct", 0) or 0))
            lines.append(ExecutionLineIn(
                position=bl["position"],
                reference=bl.get("reference"),
                description=bl.get("description"),
                unit=bl.get("unit"),
                product_id=bl.get("product_id"),
                unit_price=Decimal(str(bl["unit_price"])),
                vat_rate=Decimal(str(bl["vat_rate"])),
                total_contract=total_contract,
                current_pct=prev_pct,
                source_line_id=bl["line_id"],
                source_quote_id=bl["quote_id"],
            ))
        else:
            lines.append(ExecutionLineIn(
                position=bl["position"],
                reference=bl.get("reference"),
                description=bl.get("description"),
                unit=bl.get("unit"),
                product_id=bl.get("product_id"),
                unit_price=Decimal(str(bl["unit_price"])),
                vat_rate=Decimal(str(bl["vat_rate"])),
                discount_percent=Decimal(str(bl.get("discount_percent", 0))),
                quantity=Decimal("0"),
                source_line_id=bl["line_id"],
                source_quote_id=bl["quote_id"],
            ))

    create_data = ExecutionCreate(
        exec_type=data.exec_type,
        client_id=contract_data["client_id"],
        source_quote_id=bpu_id,
        contract_id=contract_id,
        period_label=data.period_label,
        lines=lines,
    )
    result = await create_execution(org_id, user_id, create_data, db)

    # Mettre a jour situation_number
    if situation_number is not None:
        await db.execute(
            text("""
                UPDATE execution_documents
                SET situation_number = :sn
                WHERE id = :eid
            """),
            {"sn": situation_number, "eid": result["id"]},
        )
        await db.commit()

    return result


# ── Facturation ─────────────────────────────────────────────────────────────


async def invoice_execution(
    org_id: uuid.UUID,
    exec_id: str,
    data: ExecutionInvoiceRequest,
    db: AsyncSession,
) -> dict:
    """Genere une ou plusieurs factures depuis un document d'execution valide."""
    from app.schemas.invoices import InvoiceCreate, InvoiceLineIn
    from app.services.invoices import create_invoice

    # Charger le document
    doc = await get_execution(org_id, exec_id, db)
    if doc["status"] != "validated":
        raise HTTPException(409, "Seuls les documents valides peuvent etre factures")

    exec_type = doc["exec_type"]
    is_situation = exec_type == "progress"

    # Regrouper les lignes selon grouping_mode
    if data.grouping_mode == "by_origin":
        groups: dict[str | None, list] = {}
        for ln in doc.get("lines", []):
            key = ln.get("source_quote_id")
            groups.setdefault(key, []).append(ln)
    else:
        groups = {None: doc.get("lines", [])}

    invoices_created = []
    for _group_key, group_lines in groups.items():
        invoice_lines = []
        for ln in group_lines:
            if is_situation:
                qty = Decimal("1")
                price = Decimal(str(ln.get("line_invoice_amount", 0) or 0))
                vat_rate = Decimal(str(ln.get("vat_rate", 0)))
                desc = ln.get("description", "")
                prev_pct = ln.get("previous_pct", 0)
                curr_pct = ln.get("current_pct", 0)
                desc_full = f"{desc} ({prev_pct}% -> {curr_pct}%)"
            else:
                qty = Decimal(str(ln.get("quantity", 0) or 0))
                price = Decimal(str(ln.get("unit_price", 0)))
                vat_rate = Decimal(str(ln.get("vat_rate", 0)))
                desc_full = ln.get("description", "")

            if qty == 0 and not is_situation:
                continue

            invoice_lines.append(InvoiceLineIn(
                product_id=ln.get("product_id"),
                position=ln["position"],
                reference=ln.get("reference"),
                description=desc_full,
                quantity=qty if qty > 0 else Decimal("1"),
                unit=ln.get("unit"),
                unit_price=price,
                vat_rate=vat_rate,
                discount_percent=Decimal(str(ln.get("discount_percent", 0) or 0)),
            ))

        if not invoice_lines:
            continue

        invoice_data = InvoiceCreate(
            client_id=doc["client_id"],
            quote_id=doc.get("source_quote_id"),
            contract_id=doc.get("contract_id"),
            execution_document_id=exec_id,
            issue_date=date.today(),
            is_situation=is_situation,
            situation_number=doc.get("situation_number"),
            discount_type=doc.get("discount_type", "none"),
            discount_value=Decimal(str(doc.get("discount_value", 0))),
            lines=invoice_lines,
        )
        inv_result = await create_invoice(org_id, uuid.UUID(int=0), invoice_data, db)
        invoices_created.append(inv_result)

    if not invoices_created:
        raise HTTPException(422, "Aucune ligne facturable")

    # Mettre a jour le document d'execution
    first_invoice_id = invoices_created[0]["id"]
    await db.execute(
        text("""
            UPDATE execution_documents
            SET status = 'invoiced', invoice_id = :inv_id, updated_at = now()
            WHERE id = :eid
        """),
        {"inv_id": first_invoice_id, "eid": exec_id},
    )

    # Pour les situations : mettre a jour total_invoiced du contrat
    if is_situation and doc.get("contract_id"):
        from app.services.contracts import update_contract_totals
        await update_contract_totals(doc["contract_id"], db)

    await db.commit()

    return {
        "invoices": [
            {"invoice_id": inv["id"], "invoice_number": inv["number"]}
            for inv in invoices_created
        ]
    }


# ── Liens ───────────────────────────────────────────────────────────────────


async def create_link(
    org_id: uuid.UUID,
    exec_a_id: str,
    exec_b_id: str,
    link_type: str,
    db: AsyncSession,
) -> dict:
    """Cree un lien entre deux documents d'execution."""
    link_id = uuid.uuid4()
    try:
        await db.execute(
            text("""
                INSERT INTO execution_links (id, execution_a_id, execution_b_id, link_type, created_at)
                VALUES (:id, :a_id, :b_id, :lt, now())
            """),
            {
                "id": str(link_id),
                "a_id": exec_a_id,
                "b_id": exec_b_id,
                "lt": link_type,
            },
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(409, "Le lien existe deja ou est invalide")
    return {"id": str(link_id), "link_type": link_type}


async def get_linked_documents(
    org_id: uuid.UUID, exec_id: str, db: AsyncSession
) -> list[dict]:
    """Liste les documents lies horizontalement."""
    result = await db.execute(
        text("""
            SELECT lk.id::text, lk.link_type,
                   CASE WHEN lk.execution_a_id = :eid THEN lk.execution_b_id
                        ELSE lk.execution_a_id END AS other_id
            FROM execution_links lk
            WHERE lk.execution_a_id = :eid OR lk.execution_b_id = :eid
        """),
        {"eid": exec_id},
    )
    links = []
    for row in result.fetchall():
        r = dict(row._mapping)
        other_id = str(r["other_id"])
        other_result = await db.execute(
            text("""
                SELECT ed.id::text, ed.exec_type, ed.number, ed.status,
                       ed.subtotal_ht, ed.total_vat, ed.total_ttc,
                       ed.client_id::text, c.name AS client_name,
                       ed.created_at, ed.updated_at
                FROM execution_documents ed
                LEFT JOIN clients c ON c.id = ed.client_id
                WHERE ed.id = :oid
            """),
            {"oid": other_id},
        )
        other_row = other_result.fetchone()
        if other_row:
            links.append({
                "id": r["id"],
                "link_type": r["link_type"],
                "other_execution": dict(other_row._mapping),
            })
    return links


async def get_chain(
    org_id: uuid.UUID, exec_id: str, db: AsyncSession
) -> dict:
    """Reconstruit la chaine complete (devis -> executions -> facture)."""
    doc = await get_execution(org_id, exec_id, db)

    chain: dict = {"quote": None, "executions": [], "invoice": None}

    # Devis source
    if doc.get("source_quote_id"):
        q = await db.execute(
            text("""
                SELECT id::text, number, status, subtotal_ht, total_ttc
                FROM quotes WHERE id = :qid
            """),
            {"qid": doc["source_quote_id"]},
        )
        row = q.fetchone()
        if row:
            chain["quote"] = dict(row._mapping)

    # Tous les docs d'execution lies (meme source_quote ou meme contrat)
    conditions = ["ed.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}
    if doc.get("source_quote_id"):
        conditions.append("ed.source_quote_id = :sqid")
        params["sqid"] = doc["source_quote_id"]
    elif doc.get("contract_id"):
        conditions.append("ed.contract_id = :cid")
        params["cid"] = doc["contract_id"]
    else:
        conditions.append("ed.id = :eid")
        params["eid"] = exec_id

    where = " AND ".join(conditions)
    execs = await db.execute(
        text(f"""
            SELECT ed.id::text, ed.exec_type, ed.number, ed.status,
                   ed.subtotal_ht, ed.total_vat, ed.total_ttc,
                   ed.client_id::text, c.name AS client_name,
                   ed.created_at, ed.updated_at
            FROM execution_documents ed
            LEFT JOIN clients c ON c.id = ed.client_id
            WHERE {where}
            ORDER BY ed.created_at
        """),
        params,
    )
    chain["executions"] = [dict(r._mapping) for r in execs.fetchall()]

    # Facture
    if doc.get("invoice_id"):
        inv = await db.execute(
            text("""
                SELECT id::text, number, status, total_ttc
                FROM invoices WHERE id = :iid
            """),
            {"iid": doc["invoice_id"]},
        )
        row = inv.fetchone()
        if row:
            chain["invoice"] = dict(row._mapping)

    return chain
