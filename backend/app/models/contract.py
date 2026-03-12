# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampUpdateMixin, UUIDPrimaryKeyMixin


class Contract(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Contrat — enveloppe légère regroupant devis, avenants et situations.

    Types : purchase_order | fixed_price | progress_billing | recurring
            | employment | nda | other
    Numérotation : CT-YYYY-NNNN (ou BCR-YYYY-NNNN pour purchase_order).
    """

    __tablename__ = "contracts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    contract_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/active/completed/terminated/cancelled
    reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    renewal_notice_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    bpu_quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True
    )
    total_budget: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_invoiced: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    signed_pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="contracts")
    client: Mapped["Client | None"] = relationship(back_populates="contracts")
    supplier: Mapped["Supplier | None"] = relationship(back_populates="contracts")
    bpu_quote: Mapped["Quote | None"] = relationship(
        foreign_keys=[bpu_quote_id], back_populates="bpu_contracts"
    )
    quotes: Mapped[list["Quote"]] = relationship(
        foreign_keys="Quote.contract_id",
        back_populates="contract",
        order_by="Quote.created_at",
    )
    situations: Mapped[list["Situation"]] = relationship(
        back_populates="contract",
        cascade="all, delete-orphan",
        order_by="Situation.situation_number",
    )
    invoices: Mapped[list["Invoice"]] = relationship(
        foreign_keys="Invoice.contract_id",
        back_populates="contract",
        order_by="Invoice.created_at",
    )


class Situation(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Situation d'avancement — facturation progressive d'un contrat.

    Chaque situation est cumulative depuis le début du contrat.
    """

    __tablename__ = "situations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False
    )
    bpu_quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="RESTRICT"), nullable=False
    )
    situation_number: Mapped[int] = mapped_column(Integer, nullable=False)
    period_label: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/invoiced/paid
    cumulative_total: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    previously_invoiced: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    invoice_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("contract_id", "situation_number"),
    )

    # Relations
    contract: Mapped["Contract"] = relationship(back_populates="situations")
    invoice: Mapped["Invoice | None"] = relationship(
        foreign_keys=[invoice_id], back_populates="situation_source"
    )
    lines: Mapped[list["SituationLine"]] = relationship(
        back_populates="situation", cascade="all, delete-orphan"
    )


class SituationLine(Base, UUIDPrimaryKeyMixin):
    """Ligne de situation — détail par ligne de BPU."""

    __tablename__ = "situation_lines"

    situation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("situations.id", ondelete="CASCADE"), nullable=False
    )
    quote_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quote_lines.id", ondelete="RESTRICT"), nullable=False
    )
    total_contract: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    previous_completion_percent: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )
    completion_percent: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )
    cumulative_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    previously_invoiced: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    line_invoice_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)

    __table_args__ = (
        CheckConstraint("completion_percent BETWEEN 0 AND 100", name="check_completion"),
        CheckConstraint(
            "completion_percent >= previous_completion_percent", name="check_cumulative"
        ),
    )

    # Relations
    situation: Mapped["Situation"] = relationship(back_populates="lines")
    quote_line: Mapped["QuoteLine"] = relationship()
