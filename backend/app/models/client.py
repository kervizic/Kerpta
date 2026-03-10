# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import CHAR, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Client(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Client d'une organisation."""

    __tablename__ = "clients"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # company/individual
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    siret: Mapped[str | None] = mapped_column(CHAR(14), nullable=True)
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    billing_address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    shipping_address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    payment_terms: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="clients")
    quotes: Mapped[list["Quote"]] = relationship(back_populates="client")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="client")
    purchase_orders: Mapped[list["ClientPurchaseOrder"]] = relationship(
        back_populates="client"
    )
    product_variants: Mapped[list["ClientProductVariant"]] = relationship(
        back_populates="client"
    )


class Supplier(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Fournisseur d'une organisation."""

    __tablename__ = "suppliers"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    siret: Mapped[str | None] = mapped_column(CHAR(14), nullable=True)
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    default_category: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="suppliers")
    supplier_invoices: Mapped[list["SupplierInvoice"]] = relationship(
        back_populates="supplier"
    )
    supplier_orders: Mapped[list["SupplierOrder"]] = relationship(
        back_populates="supplier"
    )
    supplier_quotes: Mapped[list["SupplierQuote"]] = relationship(
        back_populates="supplier"
    )
