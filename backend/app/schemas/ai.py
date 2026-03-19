# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Schemas Pydantic pour le module Intelligence Artificielle."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Fournisseurs ──────────────────────────────────────────────────────────────


class AiProviderCreate(BaseModel):
    name: str = Field(..., max_length=100)
    type: str = Field(
        ...,
        max_length=30,
        description="ollama, vllm, openai, anthropic, mistral, google, openai_compatible",
    )
    base_url: str | None = Field(None, max_length=255)
    api_key: str | None = None


class AiProviderUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    type: str | None = Field(None, max_length=30)
    base_url: str | None = Field(None, max_length=255)
    api_key: str | None = None
    is_active: bool | None = None


class AiProviderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    base_url: str | None
    is_active: bool
    last_check_at: datetime | None
    last_check_ok: bool | None
    model_count: int = 0
    created_at: datetime
    updated_at: datetime


class AiProviderTestResult(BaseModel):
    success: bool
    message: str
    models_found: int = 0


# ── Modeles ───────────────────────────────────────────────────────────────────


class AiModelCreate(BaseModel):
    provider_id: UUID
    model_id: str = Field(..., max_length=255)
    display_name: str = Field(..., max_length=255)
    capabilities: list[str] | None = None
    context_window: int | None = None


class AiModelUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=255)
    capabilities: list[str] | None = None
    context_window: int | None = None
    is_active: bool | None = None


class AiModelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider_id: UUID
    provider_name: str = ""
    provider_type: str = ""
    model_id: str
    display_name: str
    capabilities: list[str] | None
    context_window: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Roles ─────────────────────────────────────────────────────────────────────


class AiRolesUpdate(BaseModel):
    vl: UUID | None = None
    instruct: UUID | None = None
    thinking: UUID | None = None


class AiRolesResponse(BaseModel):
    vl: AiModelResponse | None = None
    instruct: AiModelResponse | None = None
    thinking: AiModelResponse | None = None


class AiRoleTestResult(BaseModel):
    role: str
    success: bool
    message: str
    duration_ms: int = 0


# ── Config ────────────────────────────────────────────────────────────────────


class AiConfigUpdate(BaseModel):
    ai_enabled: bool | None = None
    ai_litellm_base_url: str | None = Field(None, max_length=255)
    ai_litellm_master_key: str | None = None
    ai_features: dict | None = None


class AiConfigResponse(BaseModel):
    ai_enabled: bool
    ai_litellm_base_url: str | None
    has_master_key: bool
    ai_features: dict | None
    roles: AiRolesResponse


# ── OCR ───────────────────────────────────────────────────────────────────────


class AiOcrResponse(BaseModel):
    supplier_name: str | None = None
    supplier_siret: str | None = None
    supplier_address: str | None = None
    invoice_number: str | None = None
    issue_date: str | None = None
    due_date: str | None = None
    total_ht: Decimal | None = None
    total_tva: Decimal | None = None
    total_ttc: Decimal | None = None
    iban: str | None = None
    lines: list[dict] | None = None
    raw_text: str | None = None


# ── Categorisation ────────────────────────────────────────────────────────────


class AiCategorizeRequest(BaseModel):
    label: str
    amount: Decimal
    supplier_name: str | None = None


class AiCategorizeResponse(BaseModel):
    suggested_account: str
    account_label: str
    confidence: float = 0.0
    alternatives: list[dict] | None = None


# ── Chat ──────────────────────────────────────────────────────────────────────


class AiChatMessage(BaseModel):
    role: str = Field(..., description="user ou assistant")
    content: str


class AiChatRequest(BaseModel):
    messages: list[AiChatMessage]
    use_thinking: bool = False


class AiChatResponse(BaseModel):
    content: str
    role_used: str
    tokens_in: int = 0
    tokens_out: int = 0


# ── Generation ────────────────────────────────────────────────────────────────


class AiGenerateRequest(BaseModel):
    prompt: str
    context: str | None = None


class AiGenerateResponse(BaseModel):
    content: str
    tokens_in: int = 0
    tokens_out: int = 0


# ── Status ────────────────────────────────────────────────────────────────────


class AiStatusResponse(BaseModel):
    ai_enabled: bool
    module_ai_enabled: bool
    available_roles: list[str]
    features: dict


# ── Usage ─────────────────────────────────────────────────────────────────────


class AiUsageStats(BaseModel):
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_calls: int = 0
    calls_by_role: dict[str, int] = {}
    daily_stats: list[dict] | None = None
    top_organizations: list[dict] | None = None
