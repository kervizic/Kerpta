# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — contrats (enveloppe légère)."""

import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.contracts import ContractCreate, ContractUpdate
from app.services.numbering import generate_number


async def list_contracts(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    contract_type: str | None = None,
    status: str | None = None,
    client_id: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginée des contrats."""
    conditions = ["ct.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}

    if contract_type:
        conditions.append("ct.contract_type = :ctype")
        params["ctype"] = contract_type
    if status:
        conditions.append("ct.status = :status")
        params["status"] = status
    if client_id:
        conditions.append("ct.client_id = :client_id")
        params["client_id"] = client_id

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM contracts ct WHERE {where}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT ct.id::text, ct.reference, ct.client_id::text,
                   c.name AS client_name, ct.supplier_id::text,
                   ct.contract_type, ct.status, ct.title,
                   ct.start_date, ct.end_date, ct.auto_renew,
                   ct.renewal_notice_days, ct.bpu_quote_id::text,
                   ct.total_budget, ct.total_invoiced,
                   ct.signed_pdf_url, ct.notes,
                   ct.created_at, ct.updated_at
            FROM contracts ct
            LEFT JOIN clients c ON c.id = ct.client_id
            WHERE {where}
            ORDER BY ct.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [dict(row._mapping) for row in result.fetchall()]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def create_contract(
    org_id: uuid.UUID, user_id: uuid.UUID, data: ContractCreate, db: AsyncSession
) -> dict:
    """Crée un nouveau contrat."""
    contract_id = uuid.uuid4()
    reference = await generate_number("contract", org_id, db)

    await db.execute(
        text("""
            INSERT INTO contracts (
                id, organization_id, client_id, supplier_id,
                contract_type, status, reference, title,
                start_date, end_date, auto_renew, renewal_notice_days,
                bpu_quote_id, total_budget, total_invoiced,
                notes, created_by, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :supplier_id,
                :ctype, 'draft', :ref, :title,
                :start, :end, :auto_renew, :notice_days,
                :bpu_id, 0, 0,
                :notes, :created_by, now(), now()
            )
        """),
        {
            "id": str(contract_id),
            "org_id": str(org_id),
            "client_id": data.client_id,
            "supplier_id": data.supplier_id,
            "ctype": data.contract_type,
            "ref": reference,
            "title": data.title,
            "start": data.start_date,
            "end": data.end_date,
            "auto_renew": data.auto_renew,
            "notice_days": data.renewal_notice_days,
            "bpu_id": data.bpu_quote_id,
            "notes": data.notes,
            "created_by": str(user_id),
        },
    )
    await db.commit()
    return {"id": str(contract_id), "reference": reference}


async def get_contract(
    org_id: uuid.UUID, contract_id: str, db: AsyncSession
) -> dict:
    """Détail d'un contrat avec stats."""
    result = await db.execute(
        text("""
            SELECT ct.id::text, ct.reference, ct.client_id::text,
                   c.name AS client_name, ct.supplier_id::text,
                   ct.contract_type, ct.status, ct.title,
                   ct.start_date, ct.end_date, ct.auto_renew,
                   ct.renewal_notice_days, ct.bpu_quote_id::text,
                   ct.total_budget, ct.total_invoiced,
                   ct.signed_pdf_url, ct.notes,
                   ct.created_at, ct.updated_at,
                   (SELECT COUNT(*) FROM quotes q WHERE q.contract_id = ct.id) AS quote_count,
                   (SELECT COUNT(*) FROM situations s WHERE s.contract_id = ct.id) AS situation_count,
                   (SELECT COUNT(*) FROM invoices i WHERE i.contract_id = ct.id) AS invoice_count
            FROM contracts ct
            LEFT JOIN clients c ON c.id = ct.client_id
            WHERE ct.id = :cid AND ct.organization_id = :org_id
        """),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Contrat introuvable")

    data = dict(row._mapping)
    budget = Decimal(str(data["total_budget"]))
    invoiced = Decimal(str(data["total_invoiced"]))
    data["remaining"] = budget - invoiced
    data["progress_percent"] = (
        (invoiced / budget * Decimal("100")).quantize(Decimal("0.01"))
        if budget > 0
        else Decimal("0")
    )
    return data


async def update_contract(
    org_id: uuid.UUID, contract_id: str, data: ContractUpdate, db: AsyncSession
) -> dict:
    """Met à jour un contrat."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"cid": contract_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value
    set_parts.append("updated_at = now()")

    result = await db.execute(
        text(f"UPDATE contracts SET {', '.join(set_parts)} WHERE id = :cid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Contrat introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_contract(
    org_id: uuid.UUID, contract_id: str, db: AsyncSession
) -> dict:
    """Supprime un contrat (interdit si factures liées)."""
    # Vérifier les factures liées
    inv_count = await db.execute(
        text("SELECT COUNT(*) FROM invoices WHERE contract_id = :cid AND status != 'cancelled'"),
        {"cid": contract_id},
    )
    if (inv_count.scalar() or 0) > 0:
        raise HTTPException(
            409,
            "Impossible de supprimer un contrat avec des factures liées. "
            "Résiliez le contrat (status=terminated) à la place.",
        )

    result = await db.execute(
        text("DELETE FROM contracts WHERE id = :cid AND organization_id = :org_id"),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Contrat introuvable")
    await db.commit()
    return {"status": "deleted"}


async def get_contract_quotes(
    org_id: uuid.UUID, contract_id: str, db: AsyncSession
) -> list[dict]:
    """Devis rattachés au contrat."""
    result = await db.execute(
        text("""
            SELECT q.id::text, q.number, q.document_type, q.is_avenant,
                   q.avenant_number, q.status, q.subtotal_ht, q.total_ttc,
                   q.issue_date, q.accepted_at, q.created_at
            FROM quotes q
            WHERE q.contract_id = :cid AND q.organization_id = :org_id
            ORDER BY q.created_at
        """),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def get_contract_budget(
    org_id: uuid.UUID, contract_id: str, db: AsyncSession
) -> dict:
    """Récapitulatif budgétaire d'un contrat."""
    result = await db.execute(
        text("""
            SELECT ct.total_budget, ct.total_invoiced
            FROM contracts ct
            WHERE ct.id = :cid AND ct.organization_id = :org_id
        """),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Contrat introuvable")

    budget = Decimal(str(row[0]))
    invoiced = Decimal(str(row[1]))
    remaining = budget - invoiced
    progress = (invoiced / budget * Decimal("100")).quantize(Decimal("0.01")) if budget > 0 else Decimal("0")

    return {
        "total_budget": budget,
        "total_invoiced": invoiced,
        "remaining": remaining,
        "progress_percent": progress,
    }


async def update_contract_totals(contract_id: str, db: AsyncSession) -> None:
    """Recalcule total_budget et total_invoiced d'un contrat."""
    await db.execute(
        text("""
            UPDATE contracts SET
                total_budget = COALESCE((
                    SELECT SUM(subtotal_ht) FROM quotes
                    WHERE contract_id = :cid AND status = 'accepted'
                ), 0),
                total_invoiced = COALESCE((
                    SELECT SUM(total_ttc) FROM invoices
                    WHERE contract_id = :cid AND status != 'cancelled'
                ), 0),
                updated_at = now()
            WHERE id = :cid
        """),
        {"cid": contract_id},
    )


async def create_contract_from_quote(
    org_id: uuid.UUID, user_id: uuid.UUID, quote_id: str, db: AsyncSession
) -> dict:
    """Crée un contrat depuis un devis accepté."""
    result = await db.execute(
        text("""
            SELECT id::text, client_id::text, document_type, status, subtotal_ht
            FROM quotes
            WHERE id = :qid AND organization_id = :org_id
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    quote = result.fetchone()
    if quote is None:
        raise HTTPException(404, "Devis introuvable")

    contract_type = "progress_billing" if quote[2] == "bpu" else "fixed_price"

    contract_id = uuid.uuid4()
    reference = await generate_number("contract", org_id, db)

    bpu_quote_id = quote_id if quote[2] == "bpu" else None

    await db.execute(
        text("""
            INSERT INTO contracts (
                id, organization_id, client_id, contract_type,
                status, reference, bpu_quote_id,
                total_budget, total_invoiced,
                created_by, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :ctype,
                'active', :ref, :bpu_id,
                :budget, 0,
                :created_by, now(), now()
            )
        """),
        {
            "id": str(contract_id),
            "org_id": str(org_id),
            "client_id": quote[1],
            "ctype": contract_type,
            "ref": reference,
            "bpu_id": bpu_quote_id,
            "budget": str(quote[4]) if quote[3] == "accepted" else "0",
            "created_by": str(user_id),
        },
    )

    # Lier le devis au contrat
    await db.execute(
        text("UPDATE quotes SET contract_id = :cid, updated_at = now() WHERE id = :qid"),
        {"cid": str(contract_id), "qid": quote_id},
    )

    await db.commit()
    return {"id": str(contract_id), "reference": reference}
