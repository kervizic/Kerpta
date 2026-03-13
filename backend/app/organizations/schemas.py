# Kerpta — Schémas Pydantic pour les organisations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    vat_exigibility: str | None = None  # encaissements/debits
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
    # Miniature 64×64 px (data URI base64) — pour la sidebar, chargée avec le membership
    org_logo_thumb: str | None = None
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


class AddressOut(BaseModel):
    """Adresse formatée d'un établissement."""

    voie: str | None = None
    complement: str | None = None
    code_postal: str | None = None
    commune: str | None = None
    pays: str = "France"


class EtablissementOut(BaseModel):
    """Établissement d'une organisation (siège ou secondaire)."""

    siret: str
    nic: str
    siege: bool
    # "A" = actif, "F" = fermé/cessé — depuis l'API INSEE ou le cache SIRENE local
    etat: str = "A"
    activite_principale: str | None = None
    adresse: AddressOut | None = None


class OrgDetailOut(BaseModel):
    """Détails complets d'une organisation."""

    model_config = ConfigDict(from_attributes=True)

    org_id: str
    org_name: str
    org_siret: str | None
    org_siren: str | None
    org_logo_url: str | None
    vat_number: str | None
    legal_form: str | None
    address: dict | None
    email: str | None
    phone: str | None
    vat_regime: str | None
    vat_exigibility: str | None = "encaissements"
    accounting_regime: str | None
    rcs_city: str | None
    capital: str | None
    ape_code: str | None
    billing_siret: str | None
    # True si un logo est stocké dans organization_logos
    has_logo: bool = False
    # Établissements récupérés via l'API INSEE (non stockés en BDD)
    etablissements: list[EtablissementOut] = []


class OrgLogoOut(BaseModel):
    """Logo d'une organisation (données base64 complètes)."""

    model_config = ConfigDict(from_attributes=True)

    organization_id: str
    # Data URI complète : "data:image/png;base64,..."
    logo_b64: str
    original_name: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    width_px: int | None = None
    height_px: int | None = None


class OrgUpdateRequest(BaseModel):
    """Données pour mettre à jour une organisation."""

    email: str | None = None
    phone: str | None = None
    vat_regime: str | None = None
    vat_exigibility: str | None = None
    accounting_regime: str | None = None
    billing_siret: str | None = Field(None, min_length=14, max_length=14)
    logo_url: str | None = None


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
