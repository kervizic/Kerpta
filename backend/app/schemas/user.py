# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Schémas Pydantic pour les utilisateurs Kerpta."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Champs communs à tous les contextes utilisateur."""

    email: EmailStr
    full_name: str | None = None
    avatar_url: str | None = None

    # Identifiant stable côté provider OAuth (ex. "google:112233...")
    # Null pour les comptes créés avant la migration 0003.
    provider_sub: str | None = None


class UserCreate(UserBase):
    """Schéma utilisé lors de la création d'un utilisateur après callback OAuth.

    `id` est l'UUID GoTrue transmis dans le JWT Supabase.
    """

    id: uuid.UUID


class UserUpdate(BaseModel):
    """Mise à jour partielle d'un utilisateur (PATCH)."""

    full_name: str | None = None
    avatar_url: str | None = None
    provider_sub: str | None = None


class UserRead(UserBase):
    """Représentation publique d'un utilisateur (lecture API)."""

    id: uuid.UUID
    is_platform_admin: bool = False
    last_login_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Vue réduite exposée aux autres membres d'une organisation."""

    id: uuid.UUID
    full_name: str | None = None
    avatar_url: str | None = None

    model_config = {"from_attributes": True}
