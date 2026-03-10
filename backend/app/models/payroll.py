# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import CHAR, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Employee(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Salarié d'une organisation."""

    __tablename__ = "employees"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nir: Mapped[str | None] = mapped_column(CHAR(15), nullable=True)  # N° Sécu
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # CDI/CDD/interim/apprentissage
    start_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    gross_salary: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    convention_collective: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # code IDCC
    address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    payslips: Mapped[list["Payslip"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )


class Payslip(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Bulletin de paie mensuel."""

    __tablename__ = "payslips"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    period_start: Mapped[datetime] = mapped_column(Date, nullable=False)
    period_end: Mapped[datetime] = mapped_column(Date, nullable=False)
    gross_salary: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    net_salary: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    employer_cost: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    cotisations: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    hours_worked: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    hours_extra: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    absences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    dsn_exported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    employee: Mapped["Employee"] = relationship(back_populates="payslips")
