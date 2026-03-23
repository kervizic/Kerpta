# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Schemas Pydantic pour les commandes clients."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ── Lignes ────────────────────────────────────────────────────────────────────


class OrderLineIn(BaseModel):
    product_id: str | None = None
    position: int = 0
    reference: str | None = Field(None, max_length=100)
    description: str | None = None
    quantity: Decimal = Field(..., gt=0)
    unit: str | None = Field(None, max_length=50)
    unit_price: Decimal
    vat_rate: Decimal = Field(..., ge=0, le=20)
    discount_percent: Decimal = Decimal("0")


class OrderLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str | None = None
    position: int
    reference: str | None = None
    description: str | None = None
    quantity: Decimal
    unit: str | None = None
    unit_price: Decimal
    vat_rate: Decimal
    discount_percent: Decimal
    total_ht: Decimal
    total_vat: Decimal


# ── Commande ──────────────────────────────────────────────────────────────────


class OrderCreate(BaseModel):
    client_id: str
    contract_id: str | None = None
    client_reference: str | None = Field(None, max_length=255)
    source: str = Field(..., pattern=r"^(quote_validation|quote_invoice|client_document|manual)$")
    issue_date: date
    delivery_date: date | None = None
    discount_type: str = Field("none", pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal = Decimal("0")
    notes: str | None = None
    lines: list[OrderLineIn] = []
    quote_ids: list[str] | None = None


class OrderUpdate(BaseModel):
    client_id: str | None = None
    client_reference: str | None = Field(None, max_length=255)
    issue_date: date | None = None
    delivery_date: date | None = None
    discount_type: str | None = Field(None, pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal | None = None
    notes: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|confirmed|cancelled)$")
    lines: list[OrderLineIn] | None = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_id: str
    client_name: str | None = None
    client_reference: str | None = None
    display_reference: str | None = None
    source: str
    status: str
    issue_date: date
    delivery_date: date | None = None
    currency: str = "EUR"
    subtotal_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    discount_type: str = "none"
    discount_value: Decimal = Decimal("0")
    notes: str | None = None
    client_document_url: str | None = None
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime


class LinkedQuote(BaseModel):
    id: str
    number: str


class LinkedInvoice(BaseModel):
    id: str
    number: str | None = None
    proforma_number: str | None = None


class OrderDetailOut(OrderOut):
    lines: list[OrderLineOut] = []
    linked_quotes: list[LinkedQuote] = []
    linked_invoices: list[LinkedInvoice] = []
