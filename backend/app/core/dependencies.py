# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Dépendances FastAPI réutilisables pour l'accès aux ressources organisationnelles."""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import has_permission
from app.core.security import get_current_user_id


@dataclass
class OrgContext:
    """Contexte d'un utilisateur authentifié dans une organisation."""

    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    custom_permissions: list[str] | None


async def get_org_context(
    user_id: uuid.UUID = Depends(get_current_user_id),
    x_organization_id: str = Header(..., alias="X-Organization-Id"),
    db: AsyncSession = Depends(get_db),
) -> OrgContext:
    """Résout le contexte org à partir du header X-Organization-Id.

    Vérifie que l'utilisateur est bien membre de l'organisation.
    """
    try:
        org_id = uuid.UUID(x_organization_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Organization-Id invalide")

    result = await db.execute(
        text("""
            SELECT role, custom_permissions
            FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Vous n'êtes pas membre de cette organisation",
        )

    return OrgContext(
        user_id=user_id,
        org_id=org_id,
        role=row[0],
        custom_permissions=row[1],
    )


def require_permission(permission: str):
    """Factory de dépendance vérifiant une permission spécifique."""

    async def _check(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
        if not has_permission(ctx.role, ctx.custom_permissions, permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Permission requise : {permission}",
            )
        return ctx

    return _check


def require_role(*roles: str):
    """Factory de dépendance vérifiant un rôle minimum."""

    async def _check(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
        if ctx.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Rôle requis : {' ou '.join(roles)}",
            )
        return ctx

    return _check
