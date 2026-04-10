# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Schemas Pydantic - documents d'execution."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ── Input schemas ───────────────────────────────────────────────────────────


class ExecutionLineIn(BaseModel):
    position: int = 0
    reference: str | None = Field(None, max_length=100)
    description: str | None = None
    unit: str | None = Field(None, max_length=50)
    product_id: str | None = None
    unit_price: Decimal = Decimal("0")
    vat_rate: Decimal = Field(Decimal("0"), ge=0, le=20)
    discount_percent: Decimal = Decimal("0")
    # Champs quantite (order/delivery/work_report)
    quantity: Decimal | None = None
    # Champs avancement (progress)
    total_contract: Decimal | None = None
    current_pct: Decimal | None = Field(None, ge=0, le=100)
    source_line_id: str | None = None
    source_quote_id: str | None = None


class ExecutionCreate(BaseModel):
    exec_type: str = Field(..., pattern=r"^(order|delivery|work_report|progress)$")
    client_id: str
    source_quote_id: str | None = None
    contract_id: str | None = None
    period_label: str | None = None
    client_reference: str | None = None
    observation_date: date | None = None
    notes: str | None = None
    billing_profile_id: str | None = None
    discount_type: str = "none"
    discount_value: Decimal = Decimal("0")
    lines: list[ExecutionLineIn] = []


class ExecutionUpdate(BaseModel):
    client_id: str | None = None
    client_reference: str | None = None
    period_label: str | None = None
    observation_date: date | None = None
    notes: str | None = None
    billing_profile_id: str | None = None
    discount_type: str | None = None
    discount_value: Decimal | None = None
    lines: list[ExecutionLineIn] | None = None


class ExecutionFromQuote(BaseModel):
    exec_type: str = Field(..., pattern=r"^(order|delivery|work_report|progress)$")
    client_reference: str | None = None
    period_label: str | None = None


class ExecutionFromExecution(BaseModel):
    exec_type: str = Field(..., pattern=r"^(order|delivery|work_report|progress)$")
    period_label: str | None = None
    execution_ids: list[str] = []


class ExecutionFromContract(BaseModel):
    exec_type: str = Field(..., pattern=r"^(order|delivery|work_report|progress)$")
    period_label: str | None = None


class ExecutionInvoiceRequest(BaseModel):
    grouping_mode: str = Field("global", pattern=r"^(global|by_origin|by_lot)$")


class ExecutionLinkCreate(BaseModel):
    execution_b_id: str
    link_type: str = Field(..., pattern=r"^(fulfills|consolidates)$")


class BatchArchiveRequest(BaseModel):
    ids: list[str]
    archive: bool = True


# ── Output schemas ──────────────────────────────────────────────────────────


class ExecutionLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    position: int
    reference: str | None = None
    description: str | None = None
    unit: str | None = None
    product_id: str | None = None
    unit_price: Decimal
    vat_rate: Decimal
    discount_percent: Decimal | None = None
    source_line_id: str | None = None
    source_quote_id: str | None = None
    # Quantite
    quantity: Decimal | None = None
    total_ht: Decimal | None = None
    total_vat: Decimal | None = None
    # Avancement
    total_contract: Decimal | None = None
    previous_pct: Decimal | None = None
    current_pct: Decimal | None = None
    cumulative_amount: Decimal | None = None
    previously_invoiced: Decimal | None = None
    line_invoice_amount: Decimal | None = None


class ExecutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exec_type: str
    number: str
    client_id: str | None = None
    client_name: str | None = None
    status: str
    period_label: str | None = None
    client_reference: str | None = None
    observation_date: date | None = None
    source_quote_id: str | None = None
    contract_id: str | None = None
    invoice_id: str | None = None
    situation_number: int | None = None
    subtotal_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    discount_type: str = "none"
    discount_value: Decimal = Decimal("0")
    is_archived: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExecutionLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    other_execution: ExecutionOut
    link_type: str


class ExecutionDetailOut(ExecutionOut):
    lines: list[ExecutionLineOut] = []
    linked_documents: list[ExecutionLinkOut] = []
    notes: str | None = None
    billing_profile_id: str | None = None
    validated_at: datetime | None = None
    created_by: str | None = None
    source_quote_number: str | None = None
    contract_reference: str | None = None
    invoice_number: str | None = None


class ExecutionChainOut(BaseModel):
    quote: dict | None = None
    executions: list[ExecutionOut] = []
    invoice: dict | None = None


class PaginatedExecutions(BaseModel):
    items: list[ExecutionOut]
    total: int
    page: int
    page_size: int
    total_pages: int = 0
