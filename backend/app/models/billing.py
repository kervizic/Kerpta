# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class BankAccount(Base, UUIDPrimaryKeyMixin):
    """Compte bancaire de l'organisation."""

    __tablename__ = "bank_accounts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    iban: Mapped[str] = mapped_column(String(34), nullable=False)
    bic: Mapped[str | None] = mapped_column(String(11), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rib_attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BillingProfile(Base, UUIDPrimaryKeyMixin):
    """Profil de facturation (mentions, conditions, RIB)."""

    __tablename__ = "billing_profiles"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_accounts.id"), nullable=True
    )
    payment_terms: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    payment_term_type: Mapped[str] = mapped_column(String(20), default="net", nullable=False)
    payment_term_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(30), nullable=True)
    late_penalty_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    discount_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    recovery_fee: Mapped[float] = mapped_column(Numeric(6, 2), default=40.00, nullable=False)
    early_payment_discount: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payment_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_mentions_auto: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    legal_mentions: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PaymentMethod(Base, UUIDPrimaryKeyMixin):
    """Mode de règlement personnalisé par organisation."""

    __tablename__ = "payment_methods"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "label"),
    )


class CustomUnit(Base, UUIDPrimaryKeyMixin):
    """Unité de mesure personnalisée par organisation."""

    __tablename__ = "custom_units"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "label"),
    )
