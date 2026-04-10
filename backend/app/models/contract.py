# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampUpdateMixin, UUIDPrimaryKeyMixin


class Contract(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Contrat - enveloppe legere regroupant devis, avenants et documents d'execution.

    Types : purchase_order | fixed_price | progress_billing | recurring
            | employment | nda | other
    Numerotation : CT-YYYY-NNNN (ou BCR-YYYY-NNNN pour purchase_order).
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
    execution_documents: Mapped[list["ExecutionDocument"]] = relationship(
        foreign_keys="ExecutionDocument.contract_id",
        back_populates="contract",
        order_by="ExecutionDocument.created_at",
    )
    invoices: Mapped[list["Invoice"]] = relationship(
        foreign_keys="Invoice.contract_id",
        back_populates="contract",
        order_by="Invoice.created_at",
    )
