# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Organization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Organisation (société/entreprise)."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    siret: Mapped[str | None] = mapped_column(
        __import__("sqlalchemy", fromlist=["CHAR"]).CHAR(14), unique=True, nullable=True
    )
    siren: Mapped[str | None] = mapped_column(
        __import__("sqlalchemy", fromlist=["CHAR"]).CHAR(9), nullable=True
    )
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    legal_form: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # SAS/SARL/EI/EURL/AE/SNC
    address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_year_start: Mapped[datetime | None] = mapped_column(
        __import__("sqlalchemy", fromlist=["Date"]).Date, nullable=True
    )
    vat_regime: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # none/quarterly/monthly/annual
    accounting_regime: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # micro/simplified/real
    rcs_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capital: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    ape_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    expense_validation_threshold: Mapped[float] = mapped_column(
        Numeric(10, 2), default=0, nullable=False
    )
    expense_validator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        __import__("sqlalchemy", fromlist=["ForeignKey"]).ForeignKey("users.id"),
        nullable=True,
    )
    quote_document_types: Mapped[list] = mapped_column(
        JSONB, default=lambda: ["Devis", "Attachement", "BPU"], nullable=False
    )

    # Modules
    module_quotes_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_invoices_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_purchase_orders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_purchases_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_expenses_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_payroll_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_accounting_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    module_esignature_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relations
    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    invitations: Mapped[list["Invitation"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    clients: Mapped[list["Client"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    suppliers: Mapped[list["Supplier"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    products: Mapped[list["Product"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    price_coefficients: Mapped[list["PriceCoefficient"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    invoices: Mapped[list["Invoice"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    quotes: Mapped[list["Quote"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    storage_config: Mapped["OrganizationStorageConfig | None"] = relationship(
        back_populates="organization", uselist=False
    )
    join_requests: Mapped[list["OrganizationJoinRequest"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
