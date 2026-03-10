# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class JournalEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Écriture comptable dans un journal."""

    __tablename__ = "journal_entries"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    journal_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # sales/purchases/bank/payroll/misc
    entry_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # invoice/expense/payslip/manual
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # FK polymorphique

    # Relations
    lines: Mapped[list["JournalEntryLine"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class JournalEntryLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'une écriture comptable (débit / crédit)."""

    __tablename__ = "journal_entry_lines"

    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id"), nullable=False
    )
    account_code: Mapped[str] = mapped_column(String(10), nullable=False)  # ex: 411000
    account_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    debit: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    credit: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    third_party: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relations
    entry: Mapped["JournalEntry"] = relationship(back_populates="lines")


class TaxDeclaration(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Déclaration fiscale (CA3, CA12, liasse, IS, DSN)."""

    __tablename__ = "tax_declarations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # vat_ca3/vat_ca12/liasse_2033/liasse_2035/is/dsn
    period_start: Mapped[datetime] = mapped_column(Date, nullable=False)
    period_end: Mapped[datetime] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/submitted/validated
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
