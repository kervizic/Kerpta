# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Documents d'execution - table unifiee pour commandes, BL, attachements, situations.

Types :
  order        — Commande (BC-YYYY-NNNN)
  delivery     — Bon de livraison (BL-YYYY-NNNN)
  work_report  — Attachement terrain (AT-YYYY-NNNN)
  progress     — Situation d'avancement (SA-YYYY-NNNN)
"""

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


class ExecutionDocument(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Document d'execution - pivot unifie entre devis/contrat et facture.

    Statuts : draft -> validated -> invoiced
    """

    __tablename__ = "execution_documents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    exec_type: Mapped[str] = mapped_column(String(20), nullable=False)
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
    )
    source_quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    period_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    observation_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing_profiles.id", ondelete="SET NULL"), nullable=True
    )

    # Montants
    subtotal_ht: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_vat: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    total_ttc: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    discount_type: Mapped[str] = mapped_column(String(10), default="none", nullable=False)
    discount_value: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)

    # Situations : numero auto-incremente par contrat
    situation_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Validation
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "number"),
        CheckConstraint(
            "exec_type IN ('order', 'delivery', 'work_report', 'progress')",
            name="check_exec_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'validated', 'invoiced')",
            name="check_exec_status",
        ),
    )

    # Relations
    organization: Mapped["Organization"] = relationship()
    client: Mapped["Client | None"] = relationship()
    source_quote: Mapped["Quote | None"] = relationship(foreign_keys=[source_quote_id])
    contract: Mapped["Contract | None"] = relationship(
        foreign_keys=[contract_id], back_populates="execution_documents"
    )
    invoice: Mapped["Invoice | None"] = relationship(
        foreign_keys=[invoice_id], back_populates="execution_source"
    )
    lines: Mapped[list["ExecutionLine"]] = relationship(
        back_populates="execution_document",
        cascade="all, delete-orphan",
        order_by="ExecutionLine.position",
    )
    links_as_a: Mapped[list["ExecutionLink"]] = relationship(
        foreign_keys="ExecutionLink.execution_a_id",
        back_populates="execution_a",
        cascade="all, delete-orphan",
    )
    links_as_b: Mapped[list["ExecutionLink"]] = relationship(
        foreign_keys="ExecutionLink.execution_b_id",
        back_populates="execution_b",
        cascade="all, delete-orphan",
    )


class ExecutionLine(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Ligne d'un document d'execution.

    Champs quantite (order/delivery/work_report) : quantity, total_ht, total_vat
    Champs avancement (progress) : total_contract, previous_pct, current_pct, etc.
    """

    __tablename__ = "execution_lines"

    execution_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("execution_documents.id", ondelete="CASCADE"), nullable=False
    )
    source_line_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    unit_price: Mapped[float] = mapped_column(Numeric(15, 4), default=0, nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=True)

    # Champs quantite (order, delivery, work_report)
    quantity: Mapped[float | None] = mapped_column(Numeric(15, 4), default=0, nullable=True)
    total_ht: Mapped[float | None] = mapped_column(Numeric(15, 2), default=0, nullable=True)
    total_vat: Mapped[float | None] = mapped_column(Numeric(15, 2), default=0, nullable=True)

    # Champs avancement (progress)
    total_contract: Mapped[float | None] = mapped_column(Numeric(15, 2), default=0, nullable=True)
    previous_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), default=0, nullable=True)
    current_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), default=0, nullable=True)
    cumulative_amount: Mapped[float | None] = mapped_column(Numeric(15, 2), default=0, nullable=True)
    previously_invoiced: Mapped[float | None] = mapped_column(Numeric(15, 2), default=0, nullable=True)
    line_invoice_amount: Mapped[float | None] = mapped_column(Numeric(15, 2), default=0, nullable=True)

    __table_args__ = (
        CheckConstraint("current_pct BETWEEN 0 AND 100", name="check_current_pct"),
        CheckConstraint("previous_pct BETWEEN 0 AND 100", name="check_previous_pct"),
    )

    # Relations
    execution_document: Mapped["ExecutionDocument"] = relationship(back_populates="lines")


class ExecutionLink(Base, UUIDPrimaryKeyMixin):
    """Lien horizontal entre deux documents d'execution.

    Types : fulfills (ex: BL remplit une commande), consolidates (ex: regroupement).
    """

    __tablename__ = "execution_links"

    execution_a_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("execution_documents.id", ondelete="CASCADE"), nullable=False
    )
    execution_b_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("execution_documents.id", ondelete="CASCADE"), nullable=False
    )
    link_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=__import__("sqlalchemy", fromlist=["func"]).func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("execution_a_id", "execution_b_id"),
        CheckConstraint("execution_a_id != execution_b_id", name="check_no_self_link"),
        CheckConstraint("link_type IN ('fulfills', 'consolidates')", name="check_link_type"),
    )

    # Relations
    execution_a: Mapped["ExecutionDocument"] = relationship(
        foreign_keys=[execution_a_id], back_populates="links_as_a"
    )
    execution_b: Mapped["ExecutionDocument"] = relationship(
        foreign_keys=[execution_b_id], back_populates="links_as_b"
    )
