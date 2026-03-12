# Kerpta — Router des invitations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes de gestion des invitations.

Routes exposées :
  GET  /api/v1/invitations/{token}
      Retourne l'aperçu d'une invitation (organisation, rôle, expiration).
      Authentification requise.

  POST /api/v1/invitations/{token}/accept
      Accepte une invitation et crée le membership.
      Authentification requise.

Token format : 32 chars URL-safe (secrets.token_urlsafe(32))
Stocké haché SHA-256 dans invitations.token_hash.
URL d'invitation : https://kerpta.fr/invite/{token}
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_info

from . import service
from .schemas import InviteAcceptOut, InvitePreview

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])


@router.get("/{token}", response_model=InvitePreview)
async def get_invitation_preview(
    token: str,
    user_info: tuple[UUID, str] = Depends(get_current_user_info),
    db: AsyncSession = Depends(get_db),
) -> InvitePreview:
    """Retourne les informations d'une invitation avant acceptation."""
    result = await service.get_invitation_preview(token, db)
    return InvitePreview(**result)


@router.post("/{token}/accept", response_model=InviteAcceptOut)
async def accept_invitation(
    token: str,
    user_info: tuple[UUID, str] = Depends(get_current_user_info),
    db: AsyncSession = Depends(get_db),
) -> InviteAcceptOut:
    """Accepte une invitation et rejoint l'organisation."""
    user_id, user_email = user_info
    result = await service.accept_invitation(token, user_id, user_email, db)
    return InviteAcceptOut(**result)
