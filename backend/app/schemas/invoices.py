# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class InvoiceLineIn(BaseModel):
    product_id: str | None = None
    position: int = 0
    description: str | None = None
    quantity: Decimal = Field(..., gt=0)
    unit: str | None = Field(None, max_length=50)
    unit_price: Decimal
    vat_rate: Decimal = Field(..., ge=0, le=20)
    discount_percent: Decimal = Decimal("0")
    account_code: str | None = Field(None, max_length=10)


class InvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str | None = None
    position: int
    description: str | None = None
    quantity: Decimal
    unit: str | None = None
    unit_price: Decimal
    vat_rate: Decimal
    discount_percent: Decimal
    total_ht: Decimal
    total_vat: Decimal
    account_code: str | None = None


class InvoiceCreate(BaseModel):
    client_id: str
    quote_id: str | None = None
    purchase_order_id: str | None = None
    contract_id: str | None = None
    issue_date: date
    due_date: date | None = None
    payment_terms: int = 30
    payment_method: str | None = None
    discount_type: str = Field("none", pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal = Decimal("0")
    billing_profile_id: str | None = None
    notes: str | None = None
    footer: str | None = None
    bank_details: dict | None = None
    lines: list[InvoiceLineIn] = []


class InvoiceUpdate(BaseModel):
    client_id: str | None = None
    billing_profile_id: str | None = None
    issue_date: date | None = None
    due_date: date | None = None
    payment_terms: int | None = None
    payment_method: str | None = None
    discount_type: str | None = Field(None, pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal | None = None
    notes: str | None = None
    footer: str | None = None
    bank_details: dict | None = None
    lines: list[InvoiceLineIn] | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    client_id: str
    client_name: str | None = None
    quote_id: str | None = None
    purchase_order_id: str | None = None
    contract_id: str | None = None
    situation_id: str | None = None
    is_situation: bool
    situation_number: int | None = None
    billing_profile_id: str | None = None
    is_credit_note: bool
    credit_note_for: str | None = None
    status: str
    issue_date: date
    due_date: date | None = None
    subtotal_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    amount_paid: Decimal
    discount_type: str
    discount_value: Decimal
    payment_terms: int
    payment_method: str | None = None
    notes: str | None = None
    pdf_url: str | None = None
    sent_at: datetime | None = None
    paid_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class InvoiceDetailOut(InvoiceOut):
    lines: list[InvoiceLineOut] = []


class PaginatedInvoices(BaseModel):
    items: list[InvoiceOut]
    total: int
    page: int
    page_size: int
