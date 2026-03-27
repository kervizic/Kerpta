# Kerpta - Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

"""Schemas Pydantic pour le systeme de messagerie."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Config ────────────────────────────────────────────────────────────────────


class MailConfigOut(BaseModel):
    """Configuration mail de l'organisation (lecture seule)."""

    id: UUID
    organization_id: UUID
    siren: str
    send_address: str
    receive_address: str
    is_active: bool
    dkim_selector: str
    dkim_public_key: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MailConfigStatus(BaseModel):
    """Statut rapide du serveur mail."""

    configured: bool
    is_active: bool
    send_address: str | None = None
    receive_address: str | None = None
    employee_addresses: list[dict] = Field(default_factory=list)
    dns_records: list[dict] = Field(default_factory=list)


# ── Queue ─────────────────────────────────────────────────────────────────────


class MailQueueOut(BaseModel):
    """Email dans la file d'attente."""

    id: UUID
    direction: str
    from_address: str
    to_address: str
    subject: str | None = None
    status: str
    document_type: str | None = None
    attachment_count: int
    spam_score: float | None = None
    created_at: datetime
    processed_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaginatedMailQueue(BaseModel):
    items: list[MailQueueOut]
    total: int
    page: int
    page_size: int


# ── Quarantaine ───────────────────────────────────────────────────────────────


class MailQuarantineOut(BaseModel):
    """Email en quarantaine."""

    id: UUID
    mail_queue_id: UUID
    reason: str
    from_address: str
    subject: str | None = None
    preview_text: str | None = None
    attachment_names: list[str] | None = None
    action: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedQuarantine(BaseModel):
    items: list[MailQuarantineOut]
    total: int
    page: int
    page_size: int


class QuarantineAction(BaseModel):
    """Action sur un email en quarantaine."""

    action: str = Field(..., pattern="^(approved|rejected)$")
    blacklist_sender: bool = False


# ── Envoi ─────────────────────────────────────────────────────────────────────


class SendDocumentRequest(BaseModel):
    """Demande d'envoi d'un document par email."""

    document_type: str = Field(..., pattern="^(invoice|quote)$")
    document_id: UUID
    recipient_email: str


class SendDocumentResponse(BaseModel):
    """Reponse apres mise en queue d'un envoi."""

    queue_id: UUID
    status: str = "pending"
    message: str = "Email mis en file d'attente"
