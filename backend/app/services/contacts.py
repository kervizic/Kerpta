# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — gestion des contacts."""

import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.contacts import ContactCreate, ContactUpdate


async def create_contact(
    org_id: uuid.UUID,
    client_id: str,
    data: ContactCreate,
    db: AsyncSession,
) -> dict:
    """Crée un contact rattaché à un client."""
    # Vérifier que le client appartient bien à l'organisation
    check = await db.execute(
        text("SELECT id FROM clients WHERE id = :cid AND organization_id = :oid"),
        {"cid": client_id, "oid": str(org_id)},
    )
    if check.fetchone() is None:
        raise HTTPException(404, "Client introuvable")

    contact_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO contacts (
                id, organization_id, client_id,
                first_name, last_name, email, phone,
                job_title, is_primary, created_at
            ) VALUES (
                :id, :org_id, :client_id,
                :first_name, :last_name, :email, :phone,
                :job_title, :is_primary, now()
            )
        """),
        {
            "id": str(contact_id),
            "org_id": str(org_id),
            "client_id": client_id,
            "first_name": data.first_name,
            "last_name": data.last_name,
            "email": data.email,
            "phone": data.phone,
            "job_title": data.job_title,
            "is_primary": data.is_primary,
        },
    )
    await db.commit()
    return {
        "id": str(contact_id),
        "client_id": client_id,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "email": data.email,
        "phone": data.phone,
        "job_title": data.job_title,
        "is_primary": data.is_primary,
    }


async def list_contacts(
    org_id: uuid.UUID,
    client_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Liste les contacts d'un client."""
    result = await db.execute(
        text("""
            SELECT c.id::text, c.client_id::text, c.first_name, c.last_name,
                   c.email, c.phone, c.job_title, c.is_primary, c.created_at
            FROM contacts c
            WHERE c.client_id = :cid AND c.organization_id = :oid
            ORDER BY c.is_primary DESC, c.created_at ASC
        """),
        {"cid": client_id, "oid": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def update_contact(
    org_id: uuid.UUID,
    client_id: str,
    contact_id: str,
    data: ContactUpdate,
    db: AsyncSession,
) -> dict:
    """Met à jour un contact existant."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"contact_id": contact_id, "cid": client_id, "oid": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value

    set_clause = ", ".join(set_parts)
    result = await db.execute(
        text(
            f"UPDATE contacts SET {set_clause} "
            "WHERE id = :contact_id AND client_id = :cid AND organization_id = :oid"
        ),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Contact introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_contact(
    org_id: uuid.UUID,
    client_id: str,
    contact_id: str,
    db: AsyncSession,
) -> None:
    """Supprime un contact."""
    result = await db.execute(
        text(
            "DELETE FROM contacts "
            "WHERE id = :contact_id AND client_id = :cid AND organization_id = :oid"
        ),
        {"contact_id": contact_id, "cid": client_id, "oid": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Contact introuvable")
    await db.commit()
