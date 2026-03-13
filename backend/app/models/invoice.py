# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import CHAR, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, TimestampUpdateMixin, UUIDPrimaryKeyMixin


class Invoice(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Facture client — numérotation FA-YYYY-NNNN (avoir : CN-YYYY-NNNN)."""

    __tablename__ = "invoices"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=True
    )
    purchase_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_purchase_orders.id"), nullable=True
    )

    # Lien contrat et situation
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True
    )
    situation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("situations.id", ondelete="SET NULL"), nullable=True
    )
    is_situation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    situation_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    is_credit_note: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    credit_note_for: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/sent/partial/paid/overdue/cancelled
    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(CHAR(3), default="EUR", nullable=False)
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    discount_type: Mapped[str] = mapped_column(
        String(10), default="none", nullable=False
    )  # percent/fixed/none
    discount_value: Mapped[float] = mapped_column(
        Numeric(15, 2), default=0, nullable=False
    )
    payment_terms: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    payment_method: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )  # bank_transfer/check/card/cash/other
    bank_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_mentions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshots figés au moment de l'envoi (art. L441-9 C. com.)
    # Permettent de reproduire la facture à l'identique même si les données sources changent
    client_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # {name, siret, vat_number, address: {street, city, zip, country}}
    seller_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # {name, siret, vat_number, address: {street, city, zip, country}, rcs_city, capital, legal_form, ape_code}

    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Facturation électronique PDP (v2)
    pdp_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdp_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pdp_submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="invoices")
    client: Mapped["Client"] = relationship(back_populates="invoices")
    contract: Mapped["Contract | None"] = relationship(
        foreign_keys=[contract_id], back_populates="invoices"
    )
    situation_source: Mapped["Situation | None"] = relationship(
        foreign_keys=[situation_id], back_populates="invoice"
    )
    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLine.position",
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'une facture."""

    __tablename__ = "invoice_lines"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(15, 4), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 4), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    discount_percent: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )
    total_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    account_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Relations
    invoice: Mapped["Invoice"] = relationship(back_populates="lines")


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Paiement d'une facture."""

    __tablename__ = "payments"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # bank_transfer/check/card/cash
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relations
    invoice: Mapped["Invoice"] = relationship(back_populates="payments")
