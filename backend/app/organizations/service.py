# Kerpta — Service métier pour les organisations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Logique métier pour la gestion des organisations.

- Création d'une organisation (l'utilisateur devient owner)
- Récupération des memberships de l'utilisateur
- Recherche d'organisations Kerpta existantes
- Gestion des demandes de rattachement
"""

import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import JoinRequestCreate, OrgCreateRequest


async def get_user_memberships(user_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Retourne la liste des organisations auxquelles appartient l'utilisateur."""
    result = await db.execute(
        text("""
            SELECT
                om.organization_id::text AS org_id,
                o.name                   AS org_name,
                o.siret                  AS org_siret,
                o.siren                  AS org_siren,
                o.logo_url               AS org_logo_url,
                om.role,
                om.joined_at
            FROM organization_memberships om
            JOIN organizations o ON o.id = om.organization_id
            WHERE om.user_id = :uid
            ORDER BY om.created_at ASC
        """),
        {"uid": str(user_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_organization(
    user_id: uuid.UUID, data: OrgCreateRequest, db: AsyncSession
) -> dict:
    """Crée une organisation et enregistre l'utilisateur comme owner."""
    org_id = uuid.uuid4()
    membership_id = uuid.uuid4()

    address_json = json.dumps(data.address) if data.address else None
    capital = str(data.capital) if data.capital is not None else None

    await db.execute(
        text("""
            INSERT INTO organizations (
                id, name, siret, siren, vat_number, legal_form,
                address, email, phone,
                vat_regime, accounting_regime,
                rcs_city, capital, ape_code,
                created_at
            ) VALUES (
                :id, :name, :siret, :siren, :vat_number, :legal_form,
                CAST(:address AS jsonb), :email, :phone,
                :vat_regime, :accounting_regime,
                :rcs_city, :capital, :ape_code,
                now()
            )
        """),
        {
            "id": str(org_id),
            "name": data.name,
            "siret": data.siret,
            "siren": data.siren,
            "vat_number": data.vat_number,
            "legal_form": data.legal_form,
            "address": address_json,
            "email": data.email,
            "phone": data.phone,
            "vat_regime": data.vat_regime,
            "accounting_regime": data.accounting_regime,
            "rcs_city": data.rcs_city,
            "capital": capital,
            "ape_code": data.ape_code,
        },
    )

    await db.execute(
        text("""
            INSERT INTO organization_memberships (
                id, user_id, organization_id, role, joined_at, created_at
            ) VALUES (
                :id, :uid, :oid, 'owner', now(), now()
            )
        """),
        {"id": str(membership_id), "uid": str(user_id), "oid": str(org_id)},
    )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        msg = str(exc.orig)
        if "organizations_siret_key" in msg:
            raise HTTPException(409, "Une organisation avec ce SIRET existe déjà sur Kerpta")
        if "organizations" in msg and "unique" in msg.lower():
            raise HTTPException(409, "Cette organisation est déjà enregistrée sur Kerpta")
        raise HTTPException(500, "Erreur lors de la création de l'organisation")

    return {"org_id": str(org_id), "org_name": data.name, "role": "owner"}


async def search_organizations(q: str, db: AsyncSession) -> list[dict]:
    """Recherche des organisations Kerpta par nom ou SIREN/SIRET."""
    q = q.strip()
    if re.fullmatch(r"\d{9,14}", q):
        siren = q[:9]
        result = await db.execute(
            text("""
                SELECT id::text AS org_id, name AS org_name, siret AS org_siret, siren AS org_siren
                FROM organizations
                WHERE siren = :siren
                LIMIT 10
            """),
            {"siren": siren},
        )
    else:
        result = await db.execute(
            text("""
                SELECT id::text AS org_id, name AS org_name, siret AS org_siret, siren AS org_siren
                FROM organizations
                WHERE LOWER(name) LIKE :q
                LIMIT 10
            """),
            {"q": f"%{q.lower()}%"},
        )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_join_request(
    user_id: uuid.UUID,
    org_id: str,
    data: JoinRequestCreate,
    db: AsyncSession,
) -> dict:
    """Soumet une demande de rattachement à une organisation."""
    # Vérifier que l'organisation existe
    org_result = await db.execute(
        text("SELECT id, name FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )
    org = org_result.fetchone()
    if org is None:
        raise HTTPException(404, "Organisation introuvable")

    # Vérifier que l'utilisateur n'est pas déjà membre
    existing_member = await db.execute(
        text("""
            SELECT id FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    if existing_member.fetchone():
        raise HTTPException(409, "Vous êtes déjà membre de cette organisation")

    # Vérifier qu'il n'y a pas déjà une demande pending
    existing_req = await db.execute(
        text("""
            SELECT id, cooldown_until FROM organization_join_requests
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    existing = existing_req.fetchone()
    if existing:
        if existing[1] and existing[1] > datetime.now(timezone.utc):
            raise HTTPException(
                429,
                f"Vous devez attendre jusqu'au {existing[1].strftime('%d/%m/%Y')} "
                "avant de soumettre une nouvelle demande",
            )
        # Supprimer l'ancienne demande pour permettre une nouvelle
        await db.execute(
            text("DELETE FROM organization_join_requests WHERE user_id = :uid AND organization_id = :oid"),
            {"uid": str(user_id), "oid": org_id},
        )

    req_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO organization_join_requests
                (id, organization_id, user_id, message, status, created_at)
            VALUES
                (:id, :oid, :uid, :msg, 'pending', now())
        """),
        {"id": str(req_id), "oid": org_id, "uid": str(user_id), "msg": data.message},
    )
    await db.commit()
    return {
        "id": str(req_id),
        "organization_id": org_id,
        "org_name": org[1],
        "status": "pending",
        "message": data.message,
        "created_at": datetime.now(timezone.utc),
    }


async def get_organization(
    org_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Retourne les détails d'une organisation (réservé aux membres)."""
    result = await db.execute(
        text("""
            SELECT
                o.id::text        AS org_id,
                o.name            AS org_name,
                o.siret           AS org_siret,
                o.siren           AS org_siren,
                o.logo_url        AS org_logo_url,
                o.vat_number,
                o.legal_form,
                o.address,
                o.email,
                o.phone,
                o.vat_regime,
                o.accounting_regime,
                o.rcs_city,
                o.capital::text   AS capital,
                o.ape_code,
                o.billing_siret
            FROM organizations o
            JOIN organization_memberships om
              ON om.organization_id = o.id AND om.user_id = :uid
            WHERE o.id = :oid
        """),
        {"oid": org_id, "uid": str(user_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Organisation introuvable ou accès refusé")
    return dict(row._mapping)


async def update_organization(
    org_id: str, user_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Met à jour les champs modifiables d'une organisation (owner uniquement)."""
    # Vérifier que l'utilisateur est owner
    membership = await db.execute(
        text("""
            SELECT role FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    m = membership.fetchone()
    if m is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    if m[0] not in ("owner", "admin"):
        raise HTTPException(403, "Seuls les owners et admins peuvent modifier la structure")

    # Construire la requête UPDATE dynamiquement
    allowed = {"email", "phone", "vat_regime", "accounting_regime", "billing_siret", "logo_url"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(422, "Aucun champ valide à mettre à jour")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "oid": org_id}
    await db.execute(
        text(f"UPDATE organizations SET {set_clause} WHERE id = :oid"),
        params,
    )
    await db.commit()
    return {"status": "updated"}


async def list_join_requests(org_id: str, db: AsyncSession) -> list[dict]:
    """Liste les demandes pending pour une organisation (pour owner/admin)."""
    result = await db.execute(
        text("""
            SELECT
                jr.id::text,
                jr.organization_id::text,
                jr.user_id::text,
                u.email,
                u.full_name,
                u.avatar_url,
                jr.message,
                jr.status,
                jr.created_at
            FROM organization_join_requests jr
            JOIN users u ON u.id = jr.user_id
            WHERE jr.organization_id = :oid AND jr.status = 'pending'
            ORDER BY jr.created_at ASC
        """),
        {"oid": org_id},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def review_join_request(
    reviewer_id: uuid.UUID,
    org_id: str,
    req_id: str,
    action: str,
    role: str | None,
    custom_permissions: list[str] | None,
    db: AsyncSession,
) -> dict:
    """Accepte ou refuse une demande de rattachement."""
    result = await db.execute(
        text("""
            SELECT id, user_id, organization_id, status
            FROM organization_join_requests
            WHERE id = :rid AND organization_id = :oid
        """),
        {"rid": req_id, "oid": org_id},
    )
    req = result.fetchone()
    if req is None:
        raise HTTPException(404, "Demande introuvable")
    if req[3] != "pending":
        raise HTTPException(409, "Demande déjà traitée")

    now = datetime.now(timezone.utc)

    if action == "accept":
        if not role:
            raise HTTPException(422, "Le rôle est obligatoire pour accepter une demande")
        perms_json = json.dumps(custom_permissions) if custom_permissions else "null"
        # Créer le membership
        membership_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO organization_memberships
                    (id, user_id, organization_id, role, custom_permissions, joined_at, created_at)
                VALUES
                    (:id, :uid, :oid, :role, CAST(:perms AS jsonb), :now, :now)
                ON CONFLICT (user_id, organization_id) DO NOTHING
            """),
            {
                "id": str(membership_id),
                "uid": str(req[1]),
                "oid": org_id,
                "role": role,
                "perms": perms_json,
                "now": now,
            },
        )
        await db.execute(
            text("""
                UPDATE organization_join_requests
                SET status = 'accepted', reviewed_by = :reviewer, reviewed_at = :now,
                    role_assigned = :role
                WHERE id = :rid
            """),
            {"reviewer": str(reviewer_id), "now": now, "role": role, "rid": req_id},
        )
    else:  # reject
        cooldown = now + timedelta(days=30)
        await db.execute(
            text("""
                UPDATE organization_join_requests
                SET status = 'rejected', reviewed_by = :reviewer, reviewed_at = :now,
                    cooldown_until = :cooldown
                WHERE id = :rid
            """),
            {"reviewer": str(reviewer_id), "now": now, "cooldown": cooldown, "rid": req_id},
        )

    await db.commit()
    return {"status": "accepted" if action == "accept" else "rejected"}
