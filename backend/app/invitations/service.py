# Kerpta — Service métier pour les invitations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Logique métier pour les invitations à rejoindre une organisation.

Token d'invitation :
- Généré côté backend en clair (secrets.token_urlsafe(32))
- Stocké haché (SHA-256) dans invitations.token_hash
- Format URL : /invite/{token_plain}
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def get_invitation_preview(token: str, db: AsyncSession) -> dict:
    """Retourne l'aperçu d'une invitation (avant acceptation)."""
    token_hash = _hash_token(token)
    result = await db.execute(
        text("""
            SELECT
                i.id::text,
                i.organization_id::text AS org_id,
                o.name                  AS org_name,
                i.role,
                i.custom_permissions,
                i.expires_at,
                i.email                 AS target_email,
                i.status
            FROM invitations i
            JOIN organizations o ON o.id = i.organization_id
            WHERE i.token_hash = :hash
        """),
        {"hash": token_hash},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Invitation introuvable ou lien invalide")

    inv = dict(row._mapping)
    if inv["status"] == "accepted":
        raise HTTPException(410, "Cette invitation a déjà été utilisée")
    if inv["status"] == "revoked":
        raise HTTPException(410, "Cette invitation a été révoquée")
    if inv["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(410, "Cette invitation a expiré")

    return {
        "org_id": inv["org_id"],
        "org_name": inv["org_name"],
        "role": inv["role"],
        "custom_permissions": inv["custom_permissions"],
        "expires_at": inv["expires_at"],
        "is_email_targeted": bool(inv["target_email"]),
        "target_email": inv["target_email"],
    }


async def accept_invitation(
    token: str, user_id: uuid.UUID, user_email: str, db: AsyncSession
) -> dict:
    """Accepte une invitation et crée le membership correspondant."""
    token_hash = _hash_token(token)

    result = await db.execute(
        text("""
            SELECT
                i.id::text,
                i.organization_id::text AS org_id,
                o.name                  AS org_name,
                i.role,
                i.custom_permissions,
                i.expires_at,
                i.email                 AS target_email,
                i.status
            FROM invitations i
            JOIN organizations o ON o.id = i.organization_id
            WHERE i.token_hash = :hash
            FOR UPDATE
        """),
        {"hash": token_hash},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Invitation introuvable")

    inv = dict(row._mapping)

    if inv["status"] == "accepted":
        raise HTTPException(410, "Cette invitation a déjà été utilisée")
    if inv["status"] == "revoked":
        raise HTTPException(410, "Cette invitation a été révoquée")
    if inv["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(410, "Cette invitation a expiré")

    # Vérification email ciblé
    if inv["target_email"] and inv["target_email"].lower() != user_email.lower():
        raise HTTPException(
            403,
            "Cette invitation est destinée à une autre adresse email",
        )

    # Vérifier que l'utilisateur n'est pas déjà membre
    existing = await db.execute(
        text("""
            SELECT id FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": inv["org_id"]},
    )
    if existing.fetchone():
        raise HTTPException(409, "Vous êtes déjà membre de cette organisation")

    now = datetime.now(timezone.utc)
    membership_id = uuid.uuid4()
    perms_json = (
        json.dumps(inv["custom_permissions"]) if inv["custom_permissions"] else "null"
    )

    await db.execute(
        text("""
            INSERT INTO organization_memberships
                (id, user_id, organization_id, role, custom_permissions, joined_at, created_at)
            VALUES
                (:id, :uid, :oid, :role, CAST(:perms AS jsonb), :now, :now)
        """),
        {
            "id": str(membership_id),
            "uid": str(user_id),
            "oid": inv["org_id"],
            "role": inv["role"],
            "perms": perms_json,
            "now": now,
        },
    )

    await db.execute(
        text("""
            UPDATE invitations
            SET status = 'accepted', accepted_at = :now, accepted_by = :uid
            WHERE id = :iid
        """),
        {"now": now, "uid": str(user_id), "iid": inv["id"]},
    )

    await db.commit()
    return {"org_id": inv["org_id"], "org_name": inv["org_name"], "role": inv["role"]}
