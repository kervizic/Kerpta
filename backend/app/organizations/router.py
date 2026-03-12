# Kerpta — Router des organisations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes de gestion des organisations.

Routes exposées :
  GET  /api/v1/organizations/me
      Liste les organisations de l'utilisateur connecté avec son rôle.

  POST /api/v1/organizations
      Crée une nouvelle organisation. L'utilisateur devient owner.

  GET  /api/v1/organizations/search?q={query}
      Recherche des organisations Kerpta par nom, SIREN ou SIRET.

  POST /api/v1/organizations/{org_id}/join-requests
      Soumet une demande de rattachement à une organisation.

  GET  /api/v1/organizations/{org_id}/join-requests
      Liste les demandes en attente (requiert members:manage).

  POST /api/v1/organizations/{org_id}/join-requests/{req_id}/review
      Accepte ou refuse une demande de rattachement (requiert members:manage).

Authentification : Bearer JWT requis sur toutes les routes.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id, get_current_user_info

from . import service
from .schemas import (
    JoinRequestCreate,
    JoinRequestOut,
    JoinRequestReview,
    OrgCreateOut,
    OrgCreateRequest,
    OrgDetailOut,
    OrgLogoOut,
    OrgMembershipOut,
    OrgSearchResult,
    OrgUpdateRequest,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/organizations", tags=["organizations"])


@router.get("/me", response_model=list[OrgMembershipOut])
async def get_my_organizations(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[OrgMembershipOut]:
    """Retourne les organisations auxquelles appartient l'utilisateur."""
    rows = await service.get_user_memberships(user_id, db)
    return [OrgMembershipOut(**row) for row in rows]


@router.post("", response_model=OrgCreateOut, status_code=201)
async def create_organization(
    body: OrgCreateRequest,
    user_info: tuple[UUID, str] = Depends(get_current_user_info),
    db: AsyncSession = Depends(get_db),
) -> OrgCreateOut:
    """Crée une nouvelle organisation. L'utilisateur connecté en devient owner."""
    user_id, _ = user_info
    result = await service.create_organization(user_id, body, db)
    return OrgCreateOut(**result)


@router.get("/search", response_model=list[OrgSearchResult])
async def search_organizations(
    q: str = Query(..., min_length=2, description="Nom, SIREN (9 ch.) ou SIRET (14 ch.)"),
    _user: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[OrgSearchResult]:
    """Recherche des organisations Kerpta existantes par nom ou SIREN/SIRET."""
    rows = await service.search_organizations(q, db)
    return [OrgSearchResult(**row) for row in rows]


@router.get("/{org_id}", response_model=OrgDetailOut)
async def get_organization(
    org_id: str,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> OrgDetailOut:
    """Retourne les détails d'une organisation (membres uniquement)."""
    row = await service.get_organization(org_id, user_id, db)
    return OrgDetailOut(**row)


@router.patch("/{org_id}", response_model=dict)
async def update_organization(
    org_id: str,
    body: OrgUpdateRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Met à jour les champs modifiables d'une organisation (owner/admin)."""
    data = body.model_dump(exclude_none=True)
    return await service.update_organization(org_id, user_id, data, db)


@router.post("/{org_id}/logo", response_model=OrgLogoOut, status_code=201)
async def upload_logo(
    org_id: str,
    file: UploadFile = File(..., description="Logo PNG/JPG/WebP — max 5 MB"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> OrgLogoOut:
    """Uploade et traite le logo d'une organisation.
    Redimensionne automatiquement à 400×400 max, convertit en PNG, rejette si > 100 KB.
    Requiert le rôle owner ou admin.
    """
    result = await service.upload_logo(org_id, user_id, file, db)
    return OrgLogoOut(**result)


@router.get("/{org_id}/logo", response_model=OrgLogoOut)
async def get_logo(
    org_id: str,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> OrgLogoOut:
    """Retourne le logo d'une organisation (membres uniquement)."""
    result = await service.get_logo(org_id, user_id, db)
    return OrgLogoOut(**result)


@router.delete("/{org_id}/logo", response_model=dict)
async def delete_logo(
    org_id: str,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Supprime le logo d'une organisation (owner/admin uniquement)."""
    return await service.delete_logo(org_id, user_id, db)


@router.post("/{org_id}/join-requests", response_model=JoinRequestOut, status_code=201)
async def create_join_request(
    org_id: str,
    body: JoinRequestCreate,
    user_info: tuple[UUID, str] = Depends(get_current_user_info),
    db: AsyncSession = Depends(get_db),
) -> JoinRequestOut:
    """Soumet une demande de rattachement à l'organisation."""
    user_id, _ = user_info
    result = await service.create_join_request(user_id, org_id, body, db)
    return JoinRequestOut(**result)


@router.get("/{org_id}/join-requests", response_model=list[dict])
async def list_join_requests(
    org_id: str,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Liste les demandes de rattachement en attente.
    Requiert le rôle owner ou la permission members:manage.
    """
    # Vérifier que l'utilisateur est owner ou a members:manage
    from sqlalchemy import text
    from fastapi import HTTPException
    from app.core.permissions import get_permissions

    membership = await db.execute(
        text("""
            SELECT role, custom_permissions
            FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    m = membership.fetchone()
    if m is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    perms = get_permissions(m[0], m[1])
    if "members:manage" not in perms:
        raise HTTPException(403, "Permission insuffisante")

    return await service.list_join_requests(org_id, db)


@router.post("/{org_id}/join-requests/{req_id}/review")
async def review_join_request(
    org_id: str,
    req_id: str,
    body: JoinRequestReview,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Accepte ou refuse une demande de rattachement.
    Requiert le rôle owner ou la permission members:manage.
    """
    from sqlalchemy import text
    from fastapi import HTTPException
    from app.core.permissions import get_permissions

    membership = await db.execute(
        text("""
            SELECT role, custom_permissions
            FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    m = membership.fetchone()
    if m is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    perms = get_permissions(m[0], m[1])
    if "members:manage" not in perms:
        raise HTTPException(403, "Permission insuffisante")

    return await service.review_join_request(
        user_id, org_id, req_id, body.action, body.role, body.custom_permissions, db
    )
