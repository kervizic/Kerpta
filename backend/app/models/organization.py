# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text
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
    vat_exigibility: Mapped[str] = mapped_column(
        String(20), default="encaissements", nullable=False
    )  # encaissements/debits — choix fiscal de l'entreprise
    accounting_regime: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # micro/simplified/real
    rcs_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capital: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    ape_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_siret: Mapped[str | None] = mapped_column(
        __import__("sqlalchemy", fromlist=["CHAR"]).CHAR(14), nullable=True
    )
    company_info_manual: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # true = infos légales éditables manuellement (pas synchro SIRENE)
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
    module_contracts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Config granulaire des modules (JSONB) — clé absente = activé
    module_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Relations
    contracts: Mapped[list["Contract"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    logo: Mapped["OrganizationLogo | None"] = relationship(
        back_populates="organization", uselist=False, cascade="all, delete-orphan"
    )
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


class OrganizationLogo(Base, TimestampMixin):
    """Logo d'une organisation — table séparée pour éviter de charger les données binaires
    lors des requêtes courantes sur organizations."""

    __tablename__ = "organization_logos"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    # Données du logo encodées en base64 (PNG, max ~100 KB après redimensionnement)
    logo_b64: Mapped[str] = mapped_column(Text, nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Poids en octets après traitement Pillow (info)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Dimensions réelles stockées (utile pour le template de facture)
    width_px: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    height_px: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=__import__("sqlalchemy", fromlist=["func"]).func.now(),
        onupdate=__import__("sqlalchemy", fromlist=["func"]).func.now(),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship(back_populates="logo")
