# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Commandes clients — pivot de la chaine Devis -> Commande -> Facture.

Pas de numerotation interne (pas de CMD-YYYY-NNNN). L'affichage repose
sur client_reference (reference BC du client) ou les numeros de devis lies.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import CHAR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, TimestampUpdateMixin, UUIDPrimaryKeyMixin


# ── Types de commande ────────────────────────────────────────────────────────


class OrderType(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Type de commande configurable par organisation."""

    __tablename__ = "order_types"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    billing_mode: Mapped[str] = mapped_column(String(20), default="one_shot", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


# ── Tables d'association (N:N) ────────────────────────────────────────────────

order_quotes = Table(
    "order_quotes",
    Base.metadata,
    Column("order_id", UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True),
    Column("quote_id", UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

order_invoices = Table(
    "order_invoices",
    Base.metadata,
    Column("order_id", UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True),
    Column("invoice_id", UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)


# ── Commande client ──────────────────────────────────────────────────────────


class Order(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Commande client — pivot entre devis et factures.

    Sources possibles :
    - quote_validation : devis valide -> commande
    - quote_invoice : devis facture directement -> commande transparente
    - client_document : bon de commande client recu
    - manual : commande directe sans devis
    """

    __tablename__ = "orders"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True
    )
    order_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_types.id"), nullable=True
    )

    # Mode de facturation (copie depuis order_type a la creation)
    billing_mode: Mapped[str] = mapped_column(
        String(20), default="one_shot", nullable=False
    )  # one_shot/progress/recurring

    # Facturation recurrente
    recurring_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recurring_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurring_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurring_start: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    recurring_end: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    recurring_next_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)

    # Facturation par situations / avancement
    progress_total_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    retention_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)

    # Reference du bon de commande du client (ex: "BC-42-2026")
    client_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Source de creation de la commande
    source: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # quote_validation/quote_invoice/client_document/manual

    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )  # draft/confirmed/partially_invoiced/invoiced/cancelled

    issue_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    delivery_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)

    # Montants (Numeric(15,2) — jamais de float)
    currency: Mapped[str] = mapped_column(CHAR(3), default="EUR", nullable=False)
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)

    # Remise globale
    discount_type: Mapped[str] = mapped_column(
        String(10), default="none", nullable=False
    )  # percent/fixed/none
    discount_value: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_document_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relations
    organization: Mapped["Organization"] = relationship()
    client: Mapped["Client"] = relationship(back_populates="orders")
    contract: Mapped["Contract | None"] = relationship(foreign_keys=[contract_id])
    order_type: Mapped["OrderType | None"] = relationship(foreign_keys=[order_type_id])
    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderLine.position",
    )
    quotes: Mapped[list["Quote"]] = relationship(secondary=order_quotes)
    invoices: Mapped[list["Invoice"]] = relationship(secondary=order_invoices)


class OrderLine(Base, UUIDPrimaryKeyMixin):
    """Ligne d'une commande client."""

    __tablename__ = "order_lines"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(15, 4), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 4), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    total_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)

    # Relations
    order: Mapped["Order"] = relationship(back_populates="lines")
