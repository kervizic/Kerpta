# Kerpta - Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

"""Modeles pour le systeme de messagerie integre.

Adresses auto-generees par organisation :
  - fact-{SIREN}@{domain}     : envoi de factures/devis
  - {SIREN}@{domain}          : reception de documents fournisseurs
  - {SIREN}-{short_code}@{domain} : notes de frais par employe
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, TimestampUpdateMixin, UUIDPrimaryKeyMixin


class MailConfig(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Configuration mail d'une organisation - une ligne par org."""

    __tablename__ = "mail_configs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    siren: Mapped[str] = mapped_column(String(9), nullable=False)

    # Adresses calculees
    send_address: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # fact-{siren}@{domain}
    receive_address: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # {siren}@{domain}

    # DKIM
    dkim_private_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    dkim_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    dkim_selector: Mapped[str] = mapped_column(
        String(50), default="kerpta", nullable=False
    )

    # Stalwart
    stalwart_send_account_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    stalwart_receive_account_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="mail_config")


class MailQueue(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """File d'attente des emails entrants et sortants."""

    __tablename__ = "mail_queue"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # inbound / outbound
    from_address: Mapped[str] = mapped_column(String(255), nullable=False)
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Statut du traitement
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )  # pending / processing / delivered / failed / quarantined / rejected

    # Classification
    document_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # invoice / quote / expense / delivery / unknown
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # FK generique vers le document cree

    attachment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    spam_score: Mapped[float | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )  # score couche 3
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relations
    quarantine: Mapped["MailQuarantine | None"] = relationship(
        back_populates="mail_queue", uselist=False
    )


class MailQuarantine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Emails en quarantaine - en attente d'action utilisateur."""

    __tablename__ = "mail_quarantine"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    mail_queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mail_queue.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    reason: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # unknown_sender / low_score / suspicious_content
    from_address: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preview_text: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # premiers 500 chars du body
    attachment_names: Mapped[list | None] = mapped_column(
        JSONB, nullable=True
    )  # ["facture.pdf", "bl.pdf"]
    raw_email_path: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # chemin vers l'email brut sauvegarde

    # Action utilisateur
    action: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # approved / rejected / null (en attente)
    action_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    action_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    blacklist_sender: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Relations
    mail_queue: Mapped["MailQueue"] = relationship(back_populates="quarantine")


class MailSenderList(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Whitelist / blacklist d'expediteurs par organisation."""

    __tablename__ = "mail_sender_list"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    email_domain: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # domaine de l'expediteur (ex: fournisseur.com)
    email_address: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # adresse specifique (optionnel)
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_blacklisted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "email_domain", name="uq_mail_sender_org_domain"
        ),
    )


class EmployeeMailAddress(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Adresse email de notes de frais par employe."""

    __tablename__ = "employee_mail_addresses"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    short_code: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # code court genere (ex: "k7m2p9")
    email_address: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # {siren}-{short_code}@{domain}
    stalwart_account_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "short_code", name="uq_employee_mail_short_code"
        ),
    )
