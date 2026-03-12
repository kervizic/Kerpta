# Kerpta — Schémas Pydantic pour les invitations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime

from pydantic import BaseModel


class InvitePreview(BaseModel):
    """Aperçu d'une invitation avant acceptation."""

    org_id: str
    org_name: str
    role: str
    custom_permissions: list[str] | None
    expires_at: datetime
    is_email_targeted: bool
    target_email: str | None


class InviteAcceptOut(BaseModel):
    """Réponse après acceptation d'une invitation."""

    org_id: str
    org_name: str
    role: str
