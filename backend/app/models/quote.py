# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampUpdateMixin, UUIDPrimaryKeyMixin


class Quote(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Devis client — numérotation DEV-YYYY-NNNN."""

    __tablename__ = "quotes"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    document_type: Mapped[str] = mapped_column(
        String(100), default="Devis", nullable=False
    )
    show_quantity: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/sent/accepted/refused/expired
    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(
        __import__("sqlalchemy", fromlist=["CHAR"]).CHAR(3), default="EUR", nullable=False
    )
    subtotal_ht: Mapped[float] = mapped_column(
        Numeric(15, 2), default=0, nullable=False
    )
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    discount_type: Mapped[str] = mapped_column(
        String(10), default="none", nullable=False
    )  # percent/fixed/none
    discount_value: Mapped[float] = mapped_column(
        Numeric(15, 2), default=0, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=True
    )
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Signature électronique (DocuSeal)
    signature_status: Mapped[str] = mapped_column(
        String(20), default="none", nullable=False
    )  # none/awaiting/viewed/signed/refused
    signature_request_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    signed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    signed_pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="quotes")
    client: Mapped["Client"] = relationship(back_populates="quotes")
    lines: Mapped[list["QuoteLine"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan", order_by="QuoteLine.position"
    )


class QuoteLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'un devis."""

    __tablename__ = "quote_lines"

    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    client_product_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_product_variants.id"), nullable=True
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

    # Relations
    quote: Mapped["Quote"] = relationship(back_populates="lines")
