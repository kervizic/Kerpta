# Kerpta — Schémas Pydantic pour les organisations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrgCreateRequest(BaseModel):
    """Données pour créer une nouvelle organisation."""

    name: str = Field(..., min_length=1, max_length=255)
    siret: str | None = Field(None, min_length=14, max_length=14)
    siren: str | None = Field(None, min_length=9, max_length=9)
    vat_number: str | None = None
    legal_form: str | None = None  # SAS/SARL/EI/EURL/AE/SNC
    address: dict | None = None
    email: str | None = None
    phone: str | None = None
    vat_regime: str | None = None  # none/quarterly/monthly/annual
    accounting_regime: str | None = None  # micro/simplified/real
    rcs_city: str | None = None
    capital: Decimal | None = None
    ape_code: str | None = None


class OrgMembershipOut(BaseModel):
    """Organisation avec le rôle de l'utilisateur."""

    model_config = ConfigDict(from_attributes=True)

    org_id: str
    org_name: str
    org_siret: str | None
    org_siren: str | None
    org_logo_url: str | None
    role: str
    joined_at: datetime | None


class OrgCreateOut(BaseModel):
    """Réponse après création d'une organisation."""

    org_id: str
    org_name: str
    role: str = "owner"


class OrgSearchResult(BaseModel):
    """Résultat de recherche d'une organisation Kerpta."""

    org_id: str
    org_name: str
    org_siret: str | None
    org_siren: str | None


class JoinRequestCreate(BaseModel):
    """Données pour soumettre une demande de rattachement."""

    message: str | None = Field(None, max_length=500)


class JoinRequestOut(BaseModel):
    """Demande de rattachement."""

    id: str
    organization_id: str
    org_name: str
    status: str
    message: str | None
    created_at: datetime


class JoinRequestReview(BaseModel):
    """Données pour accepter ou refuser une demande."""

    action: str = Field(..., pattern="^(accept|reject)$")
    role: str | None = None  # obligatoire si action=accept
    custom_permissions: list[str] | None = None
