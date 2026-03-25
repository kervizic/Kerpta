# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Schemas Pydantic pour les commandes clients."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ── Types de commande ────────────────────────────────────────────────────────


class OrderTypeCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    billing_mode: str = Field("one_shot", pattern=r"^(one_shot|progress|recurring)$")
    is_default: bool = False


class OrderTypeUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=100)
    billing_mode: str | None = Field(None, pattern=r"^(one_shot|progress|recurring)$")
    is_default: bool | None = None
    position: int | None = None


class OrderTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    billing_mode: str
    is_default: bool
    position: int
    is_archived: bool = False


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
    order_type_id: str | None = None
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
    order_type_id: str | None = None
    client_reference: str | None = Field(None, max_length=255)
    issue_date: date | None = None
    delivery_date: date | None = None
    discount_type: str | None = Field(None, pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal | None = None
    notes: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|confirmed|cancelled)$")
    lines: list[OrderLineIn] | None = None
    # Facturation recurrente
    recurring_frequency: str | None = Field(
        None, pattern=r"^(weekly|monthly|quarterly|biannual|yearly|custom)$"
    )
    recurring_interval_days: int | None = Field(None, ge=1)
    recurring_day: int | None = Field(None, ge=1, le=31)
    recurring_start: date | None = None
    recurring_end: date | None = None
    recurring_next_date: date | None = None
    # Facturation par avancement
    progress_total_pct: Decimal | None = Field(None, ge=0, le=100)
    retention_pct: Decimal | None = Field(None, ge=0, le=100)


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
    # Type et mode de facturation
    order_type_id: str | None = None
    order_type_label: str | None = None
    billing_mode: str = "one_shot"


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
    # Champs recurrence
    recurring_frequency: str | None = None
    recurring_interval_days: int | None = None
    recurring_day: int | None = None
    recurring_start: date | None = None
    recurring_end: date | None = None
    recurring_next_date: date | None = None
    # Champs avancement
    progress_total_pct: Decimal = Decimal("0")
    retention_pct: Decimal = Decimal("0")
