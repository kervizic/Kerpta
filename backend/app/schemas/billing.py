# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# ── Comptes bancaires ────────────────────────────────────────────────────────


class BankAccountCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    bank_name: str | None = Field(None, max_length=100)
    iban: str = Field(..., min_length=15, max_length=34)
    bic: str | None = Field(None, max_length=11)
    is_default: bool = False


class BankAccountUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=100)
    bank_name: str | None = Field(None, max_length=100)
    iban: str | None = Field(None, min_length=15, max_length=34)
    bic: str | None = Field(None, max_length=11)
    is_default: bool | None = None


class BankAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    bank_name: str | None = None
    iban: str
    bic: str | None = None
    is_default: bool
    created_at: datetime | None = None


# ── Profils de facturation ───────────────────────────────────────────────────


class BillingProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    bank_account_id: str | None = None
    payment_terms: int = 30
    payment_term_type: str = Field("net", pattern=r"^(net|end_of_month|end_of_month_the)$")
    payment_term_day: int | None = Field(None, ge=1, le=31)
    payment_method: str | None = Field(None, max_length=30)
    late_penalty_rate: Decimal | None = None
    discount_rate: Decimal | None = None
    vat_regime: str = Field("encaissements", pattern=r"^(encaissements|debits|non_assujetti|franchise)$")
    recovery_fee: Decimal = Field(default=Decimal("40.00"), ge=0)
    early_payment_discount: bool = False
    payment_note: str | None = None
    legal_mentions_auto: bool = True
    legal_mentions: str | None = None
    footer: str | None = None
    is_default: bool = False


class BillingProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    bank_account_id: str | None = None
    payment_terms: int | None = None
    payment_term_type: str | None = Field(None, pattern=r"^(net|end_of_month|end_of_month_the)$")
    payment_term_day: int | None = Field(None, ge=1, le=31)
    payment_method: str | None = Field(None, max_length=30)
    late_penalty_rate: Decimal | None = None
    discount_rate: Decimal | None = None
    vat_regime: str | None = Field(None, pattern=r"^(encaissements|debits|non_assujetti|franchise)$")
    recovery_fee: Decimal | None = Field(None, ge=0)
    early_payment_discount: bool | None = None
    payment_note: str | None = None
    legal_mentions_auto: bool | None = None
    legal_mentions: str | None = None
    footer: str | None = None
    is_default: bool | None = None


class BillingProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    bank_account_id: str | None = None
    bank_account_label: str | None = None
    bank_account_iban: str | None = None
    payment_terms: int
    payment_term_type: str = "net"
    payment_term_day: int | None = None
    payment_method: str | None = None
    late_penalty_rate: Decimal | None = None
    discount_rate: Decimal | None = None
    vat_regime: str = "encaissements"
    recovery_fee: Decimal = Decimal("40.00")
    early_payment_discount: bool = False
    payment_note: str | None = None
    legal_mentions_auto: bool = True
    legal_mentions: str | None = None
    footer: str | None = None
    is_default: bool
    created_at: datetime | None = None


# ── Unités personnalisées ────────────────────────────────────────────────────


class UnitCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=50)


class UnitUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=50)
    position: int | None = None


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    position: int
