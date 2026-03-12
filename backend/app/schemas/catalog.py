# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ── Produits ─────────────────────────────────────────────────────────────────


class ProductCreate(BaseModel):
    reference: str | None = Field(None, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    unit: str | None = Field(None, max_length=50)
    vat_rate: Decimal = Field(..., ge=0, le=20)
    account_code: str | None = Field(None, max_length=10)
    client_id: str | None = None
    is_in_catalog: bool = True
    purchase_price: Decimal | None = None
    sale_price_mode: str = Field("fixed", pattern=r"^(fixed|coefficient)$")
    unit_price: Decimal | None = None
    sale_price_coefficient_id: str | None = None


class ProductUpdate(BaseModel):
    reference: str | None = Field(None, max_length=100)
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    unit: str | None = Field(None, max_length=50)
    vat_rate: Decimal | None = Field(None, ge=0, le=20)
    account_code: str | None = Field(None, max_length=10)
    purchase_price: Decimal | None = None
    sale_price_mode: str | None = Field(None, pattern=r"^(fixed|coefficient)$")
    unit_price: Decimal | None = None
    sale_price_coefficient_id: str | None = None
    is_in_catalog: bool | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reference: str | None = None
    name: str
    description: str | None = None
    unit: str | None = None
    vat_rate: Decimal
    account_code: str | None = None
    client_id: str | None = None
    is_in_catalog: bool
    purchase_price: Decimal | None = None
    sale_price_mode: str
    unit_price: Decimal | None = None
    sale_price_coefficient_id: str | None = None
    coefficient_name: str | None = None
    coefficient_value: Decimal | None = None
    is_composite: bool = False
    created_at: datetime | None = None
    archived_at: datetime | None = None


# ── Variantes client ─────────────────────────────────────────────────────────


class VariantCreate(BaseModel):
    client_id: str
    variant_index: int = 1
    override_reference: str | None = Field(None, max_length=100)
    override_name: str | None = Field(None, max_length=255)
    price_mode: str = Field("inherit", pattern=r"^(inherit|fixed|coefficient)$")
    unit_price: Decimal | None = None
    price_coefficient_id: str | None = None


class VariantUpdate(BaseModel):
    override_reference: str | None = Field(None, max_length=100)
    override_name: str | None = Field(None, max_length=255)
    price_mode: str | None = Field(None, pattern=r"^(inherit|fixed|coefficient)$")
    unit_price: Decimal | None = None
    price_coefficient_id: str | None = None
    is_active: bool | None = None


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    client_id: str
    client_name: str | None = None
    variant_index: int
    override_reference: str | None = None
    override_name: str | None = None
    price_mode: str
    unit_price: Decimal | None = None
    price_coefficient_id: str | None = None
    coefficient_name: str | None = None
    coefficient_value: Decimal | None = None
    is_active: bool


# ── Coefficients de prix ─────────────────────────────────────────────────────


class CoefficientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    value: Decimal = Field(..., gt=0)
    client_id: str | None = None


class CoefficientUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    value: Decimal | None = Field(None, gt=0)


class CoefficientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    value: Decimal
    client_id: str | None = None
    client_name: str | None = None
    created_at: datetime | None = None


# ── Liens achats fournisseur ─────────────────────────────────────────────────


class PurchaseLinkCreate(BaseModel):
    supplier_id: str | None = None
    supplier_reference: str | None = Field(None, max_length=100)
    purchase_price: Decimal | None = None
    sale_price_mode: str = Field("coefficient", pattern=r"^(fixed|coefficient)$")
    fixed_sale_price: Decimal | None = None
    price_coefficient_id: str | None = None
    is_default: bool = False


class PurchaseLinkUpdate(BaseModel):
    supplier_reference: str | None = Field(None, max_length=100)
    purchase_price: Decimal | None = None
    sale_price_mode: str | None = Field(None, pattern=r"^(fixed|coefficient)$")
    fixed_sale_price: Decimal | None = None
    price_coefficient_id: str | None = None
    is_default: bool | None = None


class PurchaseLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    supplier_id: str | None = None
    supplier_name: str | None = None
    supplier_reference: str | None = None
    purchase_price: Decimal | None = None
    sale_price_mode: str
    fixed_sale_price: Decimal | None = None
    price_coefficient_id: str | None = None
    coefficient_name: str | None = None
    coefficient_value: Decimal | None = None
    is_default: bool
    created_at: datetime | None = None


# ── Composition d'articles ───────────────────────────────────────────────────


class ComponentCreate(BaseModel):
    component_product_id: str
    quantity: Decimal = Field(..., gt=0)
    unit: str | None = Field(None, max_length=50)
    position: int = 0


class ComponentUpdate(BaseModel):
    quantity: Decimal | None = Field(None, gt=0)
    unit: str | None = Field(None, max_length=50)
    position: int | None = None


class ComponentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_product_id: str
    component_product_id: str
    component_name: str | None = None
    component_reference: str | None = None
    component_unit_price: Decimal | None = None
    quantity: Decimal
    unit: str | None = None
    position: int


# ── Paliers de remise quantité ───────────────────────────────────────────────


class QuantityDiscountCreate(BaseModel):
    min_quantity: Decimal = Field(..., gt=0)
    discount_percent: Decimal = Field(..., gt=0, le=100)
    client_id: str | None = None


class QuantityDiscountUpdate(BaseModel):
    min_quantity: Decimal | None = Field(None, gt=0)
    discount_percent: Decimal | None = Field(None, gt=0, le=100)


class QuantityDiscountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    client_id: str | None = None
    client_name: str | None = None
    min_quantity: Decimal
    discount_percent: Decimal
    created_at: datetime | None = None
