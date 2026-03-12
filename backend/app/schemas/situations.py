# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SituationCreate(BaseModel):
    period_label: str = Field(..., min_length=1, max_length=255)


class SituationLineUpdate(BaseModel):
    quote_line_id: str
    completion_percent: Decimal = Field(..., ge=0, le=100)


class SituationUpdate(BaseModel):
    period_label: str | None = Field(None, min_length=1, max_length=255)
    lines: list[SituationLineUpdate] | None = None


class SituationLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    quote_line_id: str
    description: str | None = None
    reference: str | None = None
    unit: str | None = None
    total_contract: Decimal
    previous_completion_percent: Decimal
    completion_percent: Decimal
    cumulative_amount: Decimal
    previously_invoiced: Decimal
    line_invoice_amount: Decimal


class SituationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    contract_id: str
    bpu_quote_id: str
    situation_number: int
    period_label: str
    status: str
    cumulative_total: Decimal
    previously_invoiced: Decimal
    invoice_amount: Decimal
    invoice_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SituationDetailOut(SituationOut):
    lines: list[SituationLineOut] = []
