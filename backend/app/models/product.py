# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class PriceCoefficient(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Coefficient de prix nommé (ex: Matière ×1.2)."""

    __tablename__ = "price_coefficients"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True
    )

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="price_coefficients")


class Product(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Article du catalogue produits & services."""

    __tablename__ = "products"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    account_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True
    )
    is_in_catalog: Mapped[bool] = mapped_column(Boolean, default=True)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(15, 4), nullable=True)
    sale_price_mode: Mapped[str] = mapped_column(
        String(20), default="fixed", nullable=False
    )  # fixed/coefficient
    unit_price: Mapped[float | None] = mapped_column(Numeric(15, 4), nullable=True)
    sale_price_coefficient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("price_coefficients.id"), nullable=True
    )
    is_composite: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="products")
    purchase_links: Mapped[list["ProductPurchaseLink"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    components: Mapped[list["ProductComponent"]] = relationship(
        foreign_keys="ProductComponent.parent_product_id",
        back_populates="parent_product",
        cascade="all, delete-orphan",
    )
    variants: Mapped[list["ClientProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ClientProductVariant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Adaptation d'un article catalogue pour un client spécifique."""

    __tablename__ = "client_product_variants"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    variant_index: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    override_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    override_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    price_mode: Mapped[str] = mapped_column(
        String(20), default="inherit", nullable=False
    )  # inherit/fixed/coefficient
    unit_price: Mapped[float | None] = mapped_column(Numeric(15, 4), nullable=True)
    price_coefficient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("price_coefficients.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relations
    product: Mapped["Product"] = relationship(back_populates="variants")
    client: Mapped["Client"] = relationship(back_populates="product_variants")

    __table_args__ = (
        __import__("sqlalchemy", fromlist=["UniqueConstraint"]).UniqueConstraint(
            "product_id", "client_id", "variant_index"
        ),
    )


class ProductPurchaseLink(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Lien article ↔ achat fournisseur."""

    __tablename__ = "product_purchase_links"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    supplier_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_price: Mapped[float] = mapped_column(Numeric(15, 4), nullable=False)
    sale_price_mode: Mapped[str] = mapped_column(
        String(20), default="coefficient", nullable=False
    )  # fixed/coefficient
    fixed_sale_price: Mapped[float | None] = mapped_column(Numeric(15, 4), nullable=True)
    price_coefficient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("price_coefficients.id"), nullable=True
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relations
    product: Mapped["Product"] = relationship(back_populates="purchase_links")


class ProductComponent(Base, UUIDPrimaryKeyMixin):
    """Composant d'un article composé (feature future)."""

    __tablename__ = "product_components"

    parent_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    component_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    quantity: Mapped[float] = mapped_column(Numeric(15, 4), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relations
    parent_product: Mapped["Product"] = relationship(
        foreign_keys=[parent_product_id], back_populates="components"
    )
