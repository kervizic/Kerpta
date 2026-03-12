# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    type: str = Field(..., pattern=r"^(company|individual)$")
    name: str = Field(..., min_length=1, max_length=255)
    siret: str | None = Field(None, min_length=14, max_length=14)
    country_code: str = Field("FR", min_length=2, max_length=2)
    company_siren: str | None = Field(None, min_length=9, max_length=9)
    vat_number: str | None = Field(None, max_length=20)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=20)
    billing_address: dict | None = None
    shipping_address: dict | None = None
    payment_terms: int = 30
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    siret: str | None = Field(None, min_length=14, max_length=14)
    country_code: str | None = Field(None, min_length=2, max_length=2)
    vat_number: str | None = Field(None, max_length=20)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=20)
    billing_address: dict | None = None
    shipping_address: dict | None = None
    payment_terms: int | None = None
    notes: str | None = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    name: str
    siret: str | None = None
    country_code: str
    vat_number: str | None = None
    email: str | None = None
    phone: str | None = None
    billing_address: dict | None = None
    shipping_address: dict | None = None
    payment_terms: int
    notes: str | None = None
    created_at: datetime | None = None
    archived_at: datetime | None = None


class ClientDetailOut(ClientOut):
    quote_count: int = 0
    invoice_count: int = 0
    contract_count: int = 0
    total_invoiced: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")


class PaginatedClients(BaseModel):
    items: list[ClientOut]
    total: int
    page: int
    page_size: int
