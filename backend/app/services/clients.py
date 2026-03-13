# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — gestion des clients."""

import json
import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.clients import ClientCreate, ClientUpdate


async def list_clients(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginée des clients de l'organisation."""
    conditions = ["c.organization_id = :org_id"]
    params: dict = {"org_id": str(org_id)}

    if status == "archived":
        conditions.append("c.archived_at IS NOT NULL")
    else:
        conditions.append("c.archived_at IS NULL")

    if search:
        conditions.append("(LOWER(c.name) LIKE :search OR c.siret LIKE :search)")
        params["search"] = f"%{search.lower()}%"

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM clients c WHERE {where}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT c.id::text, c.type, c.name, c.siret, c.country_code,
                   c.vat_number, c.email, c.phone, c.billing_address,
                   c.shipping_address, c.payment_terms,
                   c.billing_profile_id::text,
                   bp.name AS billing_profile_name,
                   c.notes,
                   c.created_at, c.archived_at
            FROM clients c
            LEFT JOIN billing_profiles bp ON bp.id = c.billing_profile_id
            WHERE {where}
            ORDER BY c.name ASC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [dict(row._mapping) for row in result.fetchall()]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def create_client(
    org_id: uuid.UUID, data: ClientCreate, db: AsyncSession
) -> dict:
    """Crée un nouveau client."""
    client_id = uuid.uuid4()
    billing_json = json.dumps(data.billing_address) if data.billing_address else None
    shipping_json = json.dumps(data.shipping_address) if data.shipping_address else None

    await db.execute(
        text("""
            INSERT INTO clients (
                id, organization_id, type, name, siret, country_code,
                company_siren, vat_number, email, phone,
                billing_address, shipping_address,
                payment_terms, billing_profile_id, notes, created_at
            ) VALUES (
                :id, :org_id, :type, :name, :siret, :country_code,
                :company_siren, :vat_number, :email, :phone,
                CAST(:billing AS jsonb), CAST(:shipping AS jsonb),
                :payment_terms, :billing_profile_id, :notes, now()
            )
        """),
        {
            "id": str(client_id),
            "org_id": str(org_id),
            "type": data.type,
            "name": data.name,
            "siret": data.siret,
            "country_code": data.country_code,
            "company_siren": data.company_siren,
            "vat_number": data.vat_number,
            "email": data.email,
            "phone": data.phone,
            "billing": billing_json,
            "shipping": shipping_json,
            "payment_terms": data.payment_terms,
            "billing_profile_id": data.billing_profile_id,
            "notes": data.notes,
        },
    )
    await db.commit()
    return {"id": str(client_id), "name": data.name}


async def get_client(
    org_id: uuid.UUID, client_id: str, db: AsyncSession
) -> dict:
    """Retourne le détail d'un client avec ses statistiques."""
    result = await db.execute(
        text("""
            SELECT c.id::text, c.type, c.name, c.siret, c.country_code,
                   c.company_siren, c.vat_number, c.email, c.phone,
                   c.billing_address, c.shipping_address,
                   c.payment_terms, c.billing_profile_id::text,
                   bp.name AS billing_profile_name,
                   c.notes,
                   c.created_at, c.archived_at,
                   (SELECT COUNT(*) FROM quotes q WHERE q.client_id = c.id) AS quote_count,
                   (SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id) AS invoice_count,
                   (SELECT COUNT(*) FROM contracts ct WHERE ct.client_id = c.id) AS contract_count,
                   COALESCE((SELECT SUM(total_ttc) FROM invoices i
                    WHERE i.client_id = c.id AND i.status != 'cancelled'), 0) AS total_invoiced,
                   COALESCE((SELECT SUM(amount_paid) FROM invoices i
                    WHERE i.client_id = c.id AND i.status != 'cancelled'), 0) AS total_paid
            FROM clients c
            LEFT JOIN billing_profiles bp ON bp.id = c.billing_profile_id
            WHERE c.id = :cid AND c.organization_id = :org_id
        """),
        {"cid": client_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Client introuvable")
    data = dict(row._mapping)
    data["balance"] = data["total_invoiced"] - data["total_paid"]
    return data


async def update_client(
    org_id: uuid.UUID, client_id: str, data: ClientUpdate, db: AsyncSession
) -> dict:
    """Met à jour un client existant."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    # Traiter les champs JSONB
    for key in ("billing_address", "shipping_address"):
        if key in updates:
            updates[key] = json.dumps(updates[key]) if updates[key] else None

    set_parts = []
    params: dict = {"cid": client_id, "org_id": str(org_id)}
    for key, value in updates.items():
        if key in ("billing_address", "shipping_address"):
            set_parts.append(f"{key} = CAST(:{key} AS jsonb)")
        else:
            set_parts.append(f"{key} = :{key}")
        params[key] = value

    set_clause = ", ".join(set_parts)
    result = await db.execute(
        text(f"UPDATE clients SET {set_clause} WHERE id = :cid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Client introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_client(
    org_id: uuid.UUID, client_id: str, db: AsyncSession
) -> dict:
    """Soft delete d'un client (archive)."""
    result = await db.execute(
        text("""
            UPDATE clients SET archived_at = now()
            WHERE id = :cid AND organization_id = :org_id AND archived_at IS NULL
        """),
        {"cid": client_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Client introuvable ou déjà archivé")
    await db.commit()
    return {"status": "archived"}


async def get_client_quotes(
    org_id: uuid.UUID, client_id: str, db: AsyncSession
) -> list[dict]:
    """Retourne les devis d'un client."""
    result = await db.execute(
        text("""
            SELECT q.id::text, q.number, q.document_type, q.status,
                   q.issue_date, q.subtotal_ht, q.total_ttc, q.created_at
            FROM quotes q
            WHERE q.client_id = :cid AND q.organization_id = :org_id
            ORDER BY q.created_at DESC
        """),
        {"cid": client_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def get_client_invoices(
    org_id: uuid.UUID, client_id: str, db: AsyncSession
) -> list[dict]:
    """Retourne les factures d'un client."""
    result = await db.execute(
        text("""
            SELECT i.id::text, i.number, i.is_credit_note, i.status,
                   i.issue_date, i.subtotal_ht, i.total_ttc, i.amount_paid, i.created_at
            FROM invoices i
            WHERE i.client_id = :cid AND i.organization_id = :org_id
            ORDER BY i.created_at DESC
        """),
        {"cid": client_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def get_client_contracts(
    org_id: uuid.UUID, client_id: str, db: AsyncSession
) -> list[dict]:
    """Retourne les contrats d'un client."""
    result = await db.execute(
        text("""
            SELECT ct.id::text, ct.reference, ct.contract_type, ct.status,
                   ct.title, ct.total_budget, ct.total_invoiced, ct.created_at
            FROM contracts ct
            WHERE ct.client_id = :cid AND ct.organization_id = :org_id
            ORDER BY ct.created_at DESC
        """),
        {"cid": client_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]
