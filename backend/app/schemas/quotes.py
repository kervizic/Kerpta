# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class QuoteLineIn(BaseModel):
    product_id: str | None = None
    client_product_variant_id: str | None = None
    position: int = 0
    reference: str | None = Field(None, max_length=100)
    description: str | None = None
    quantity: Decimal = Field(..., gt=0)
    unit: str | None = Field(None, max_length=50)
    unit_price: Decimal
    vat_rate: Decimal = Field(..., ge=0, le=20)
    discount_percent: Decimal = Decimal("0")


class QuoteLineOut(BaseModel):
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


class QuoteCreate(BaseModel):
    client_id: str
    document_type: str = Field("devis", pattern=r"^(devis|bpu|attachement)$")
    show_quantity: bool = True
    contract_id: str | None = None
    is_avenant: bool = False
    bpu_source_id: str | None = None
    issue_date: date
    expiry_date: date | None = None
    discount_type: str = Field("none", pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal = Decimal("0")
    billing_profile_id: str | None = None
    notes: str | None = None
    footer: str | None = None
    lines: list[QuoteLineIn] = []


class QuoteUpdate(BaseModel):
    client_id: str | None = None
    billing_profile_id: str | None = None
    document_type: str | None = Field(None, pattern=r"^(devis|bpu|attachement)$")
    show_quantity: bool | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    discount_type: str | None = Field(None, pattern=r"^(percent|fixed|none)$")
    discount_value: Decimal | None = None
    notes: str | None = None
    footer: str | None = None
    lines: list[QuoteLineIn] | None = None


class QuoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    client_id: str
    client_name: str | None = None
    document_type: str
    show_quantity: bool
    contract_id: str | None = None
    is_avenant: bool
    avenant_number: int | None = None
    bpu_source_id: str | None = None
    status: str
    issue_date: date
    expiry_date: date | None = None
    subtotal_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    discount_type: str
    discount_value: Decimal
    notes: str | None = None
    footer: str | None = None
    billing_profile_id: str | None = None
    pdf_url: str | None = None
    sent_at: datetime | None = None
    accepted_at: datetime | None = None
    signature_status: str = "none"
    created_at: datetime | None = None
    updated_at: datetime | None = None


class QuoteDetailOut(QuoteOut):
    lines: list[QuoteLineOut] = []


class PaginatedQuotes(BaseModel):
    items: list[QuoteOut]
    total: int
    page: int
    page_size: int


class DocumentImport(BaseModel):
    extracted_data: dict
    source_filename: str | None = None
