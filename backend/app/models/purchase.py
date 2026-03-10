# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, TimestampUpdateMixin, UUIDPrimaryKeyMixin


# ── Bons de commande clients ─────────────────────────────────────────────────


class ClientPurchaseOrder(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Bon de commande reçu d'un client — BCR-YYYY-NNNN."""

    __tablename__ = "client_purchase_orders"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=True
    )
    number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    client_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="received", nullable=False
    )  # received/confirmed/invoiced/cancelled
    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    delivery_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relations
    client: Mapped["Client"] = relationship(back_populates="purchase_orders")
    lines: Mapped[list["ClientPurchaseOrderLine"]] = relationship(
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        order_by="ClientPurchaseOrderLine.position",
    )


class ClientPurchaseOrderLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'un bon de commande client."""

    __tablename__ = "client_purchase_order_lines"

    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_purchase_orders.id"), nullable=False
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
    total_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)

    # Relations
    purchase_order: Mapped["ClientPurchaseOrder"] = relationship(back_populates="lines")


# ── Achats fournisseurs ──────────────────────────────────────────────────────


class SupplierQuote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Devis reçu d'un fournisseur — DRF-YYYY-NNNN."""

    __tablename__ = "supplier_quotes"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    supplier_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="received", nullable=False
    )  # received/accepted/refused/expired
    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    supplier_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_orders.id"), nullable=True
    )

    # Relations
    supplier: Mapped["Supplier"] = relationship(back_populates="supplier_quotes")
    lines: Mapped[list["SupplierQuoteLine"]] = relationship(
        back_populates="supplier_quote",
        cascade="all, delete-orphan",
        order_by="SupplierQuoteLine.position",
    )


class SupplierQuoteLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'un devis fournisseur."""

    __tablename__ = "supplier_quote_lines"

    supplier_quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_quotes.id"), nullable=False
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
    total_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)

    # Relations
    supplier_quote: Mapped["SupplierQuote"] = relationship(back_populates="lines")


class SupplierOrder(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Bon de commande fournisseur — BCF-YYYY-NNNN."""

    __tablename__ = "supplier_orders"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    supplier_quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_quotes.id"), nullable=True
    )
    number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/sent/confirmed/cancelled
    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    expected_delivery_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relations
    supplier: Mapped["Supplier"] = relationship(back_populates="supplier_orders")
    lines: Mapped[list["SupplierOrderLine"]] = relationship(
        back_populates="supplier_order",
        cascade="all, delete-orphan",
        order_by="SupplierOrderLine.position",
    )


class SupplierOrderLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'un bon de commande fournisseur."""

    __tablename__ = "supplier_order_lines"

    supplier_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_orders.id"), nullable=False
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
    total_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    account_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Relations
    supplier_order: Mapped["SupplierOrder"] = relationship(back_populates="lines")


class SupplierInvoice(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Facture reçue d'un fournisseur — FF-YYYY-NNNN."""

    __tablename__ = "supplier_invoices"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    supplier_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_orders.id"), nullable=True
    )
    number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    supplier_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="received", nullable=False
    )  # received/validated/paid/contested
    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id"), nullable=True
    )

    # Relations
    supplier: Mapped["Supplier"] = relationship(back_populates="supplier_invoices")
    lines: Mapped[list["SupplierInvoiceLine"]] = relationship(
        back_populates="supplier_invoice",
        cascade="all, delete-orphan",
        order_by="SupplierInvoiceLine.position",
    )


class SupplierInvoiceLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'une facture fournisseur."""

    __tablename__ = "supplier_invoice_lines"

    supplier_invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_invoices.id"), nullable=False
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
    total_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    account_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Relations
    supplier_invoice: Mapped["SupplierInvoice"] = relationship(back_populates="lines")
