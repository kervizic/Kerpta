# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


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
    created_at: datetime | None = None
    archived_at: datetime | None = None


class VariantCreate(BaseModel):
    client_id: str
    variant_index: int = 1
    override_reference: str | None = Field(None, max_length=100)
    override_name: str | None = Field(None, max_length=255)
    price_mode: str = Field("inherit", pattern=r"^(inherit|fixed|coefficient)$")
    unit_price: Decimal | None = None
    price_coefficient_id: str | None = None


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    client_id: str
    variant_index: int
    override_reference: str | None = None
    override_name: str | None = None
    price_mode: str
    unit_price: Decimal | None = None
    is_active: bool


class CoefficientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    value: Decimal = Field(..., gt=0)
    client_id: str | None = None


class CoefficientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    value: Decimal
    client_id: str | None = None
    created_at: datetime | None = None
