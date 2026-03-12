# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ContractCreate(BaseModel):
    client_id: str | None = None
    supplier_id: str | None = None
    contract_type: str = Field(
        ...,
        pattern=r"^(purchase_order|fixed_price|progress_billing|recurring|employment|nda|other)$",
    )
    title: str | None = Field(None, max_length=255)
    start_date: date | None = None
    end_date: date | None = None
    auto_renew: bool = False
    renewal_notice_days: int = 30
    bpu_quote_id: str | None = None
    notes: str | None = None


class ContractUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    status: str | None = Field(
        None, pattern=r"^(draft|active|completed|terminated|cancelled)$"
    )
    start_date: date | None = None
    end_date: date | None = None
    auto_renew: bool | None = None
    renewal_notice_days: int | None = None
    bpu_quote_id: str | None = None
    notes: str | None = None


class ContractOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reference: str
    client_id: str | None = None
    client_name: str | None = None
    supplier_id: str | None = None
    contract_type: str
    status: str
    title: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    auto_renew: bool
    renewal_notice_days: int
    bpu_quote_id: str | None = None
    total_budget: Decimal
    total_invoiced: Decimal
    signed_pdf_url: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ContractDetailOut(ContractOut):
    remaining: Decimal = Decimal("0")
    progress_percent: Decimal = Decimal("0")
    quote_count: int = 0
    situation_count: int = 0
    invoice_count: int = 0


class BudgetOut(BaseModel):
    total_budget: Decimal
    total_invoiced: Decimal
    remaining: Decimal
    progress_percent: Decimal


class PaginatedContracts(BaseModel):
    items: list[ContractOut]
    total: int
    page: int
    page_size: int
