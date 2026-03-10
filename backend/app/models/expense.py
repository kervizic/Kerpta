# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import CHAR, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Expense(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Note de frais."""

    __tablename__ = "expenses"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    category: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # meals/transport/accommodation/fuel/office/equipment/other
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    amount_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    vat_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    amount_ttc: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), default="EUR", nullable=False)
    expense_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    receipt_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/submitted/approved/rejected/reimbursed
    reimbursed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id"), nullable=True
    )
