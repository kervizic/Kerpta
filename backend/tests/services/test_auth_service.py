# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Tests unitaires — AuthService.handle_oauth_callback.

Cas couverts :
  1. Connexion normale → utilisateur retrouvé par UUID GoTrue
  2. Reset GoTrue simulé → nouvel UUID, même provider_sub → UUID mis à jour
  3. Nouvel utilisateur → INSERT + outcome "new_user"
  4. Rétrocompatibilité → provider_sub null mis à jour au login
  5. extract_provider_sub → parsing du JWT GoTrue (Google, Azure, Apple, manquant)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from app.services.auth_service import (
    AuthService,
    LoginOutcome,
    build_provider_sub,
    extract_provider_sub,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────


def _make_user(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "test@example.com",
    full_name: str | None = "Test User",
    avatar_url: str | None = None,
    provider_sub: str | None = None,
    is_platform_admin: bool = False,
) -> MagicMock:
    """Fabrique un mock d'objet User SQLAlchemy."""
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.email = email
    user.full_name = full_name
    user.avatar_url = avatar_url
    user.provider_sub = provider_sub
    user.is_platform_admin = is_platform_admin
    user.last_login_at = None
    return user


def _make_service(db: MagicMock | None = None) -> AuthService:
    """Crée une instance AuthService avec un mock de session."""
    if db is None:
        db = MagicMock()
        db.execute = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.add = MagicMock()
    return AuthService(db)


# ── Helpers ────────────────────────────────────────────────────────────────────


class _ScalarResult:
    """Mock de scalars().one_or_none()."""

    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalar_one(self):
        return self._value


# ── Tests build_provider_sub ──────────────────────────────────────────────────


def test_build_provider_sub_google():
    result = build_provider_sub("google", "112233445566778899")
    assert result == "google:112233445566778899"


def test_build_provider_sub_azure():
    oid = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    result = build_provider_sub("azure", oid)
    assert result == f"azure:{oid}"


def test_build_provider_sub_normalise_case():
    result = build_provider_sub("Google", "123")
    assert result.startswith("google:")


# ── Tests extract_provider_sub ────────────────────────────────────────────────


def test_extract_provider_sub_google():
    payload = {
        "sub": "gotrue-uuid",
        "app_metadata": {"provider": "google"},
        "user_metadata": {"provider_id": "112233"},
    }
    result = extract_provider_sub(payload)
    assert result == "google:112233"


def test_extract_provider_sub_azure():
    payload = {
        "app_metadata": {"provider": "azure"},
        "user_metadata": {"provider_id": "azure-oid-xxx"},
    }
    result = extract_provider_sub(payload)
    assert result == "azure:azure-oid-xxx"


def test_extract_provider_sub_apple():
    payload = {
        "app_metadata": {"provider": "apple"},
        "user_metadata": {"provider_id": "000000.abc"},
    }
    result = extract_provider_sub(payload)
    assert result == "apple:000000.abc"


def test_extract_provider_sub_missing_fields():
    """Sans provider ou provider_id, retourne None."""
    assert extract_provider_sub({}) is None
    assert extract_provider_sub({"app_metadata": {"provider": "google"}}) is None
    assert extract_provider_sub({"user_metadata": {"provider_id": "123"}}) is None


# ── Tests handle_oauth_callback ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_existing_user_found_by_uuid():
    """Cas 1 : connexion normale → utilisateur retrouvé par UUID GoTrue."""
    user_id = uuid.uuid4()
    existing_user = _make_user(user_id=user_id, provider_sub="google:123")

    service = _make_service()
    # Étape 1 → trouvé par UUID
    service._find_by_id = AsyncMock(return_value=existing_user)
    service._update_login_metadata = AsyncMock()

    user, outcome = await service.handle_oauth_callback(
        gotrue_user_id=str(user_id),
        email="test@example.com",
        provider_sub="google:123",
    )

    assert outcome == "existing"
    assert user is existing_user
    service._find_by_id.assert_called_once_with(user_id)
    service._update_login_metadata.assert_called_once()


@pytest.mark.asyncio
async def test_gotrue_reset_user_found_by_provider_sub():
    """Cas 2 : reset GoTrue → nouvel UUID, même provider_sub → UUID mis à jour."""
    old_user_id = uuid.uuid4()
    new_user_id = uuid.uuid4()
    provider_sub = "google:9988776655"
    existing_user = _make_user(user_id=old_user_id, provider_sub=provider_sub)

    service = _make_service()
    # Étape 1 → non trouvé par UUID (GoTrue a reset)
    service._find_by_id = AsyncMock(return_value=None)
    # Étape 2 → trouvé par provider_sub
    service._find_by_provider_sub = AsyncMock(return_value=existing_user)
    service._update_gotrue_id = AsyncMock()

    user, outcome = await service.handle_oauth_callback(
        gotrue_user_id=str(new_user_id),
        email="test@example.com",
        provider_sub=provider_sub,
        full_name="Test User",
    )

    assert outcome == "gotrue_reset"
    assert user is existing_user
    service._find_by_id.assert_called_once_with(new_user_id)
    service._find_by_provider_sub.assert_called_once_with(provider_sub)
    service._update_gotrue_id.assert_called_once_with(
        existing_user, new_user_id, "Test User", None
    )


@pytest.mark.asyncio
async def test_new_user_created():
    """Cas 3 : premier login → aucun compte → INSERT + outcome "new_user"."""
    new_user_id = uuid.uuid4()
    provider_sub = "github:abcdef"

    created_user = _make_user(user_id=new_user_id, provider_sub=provider_sub)

    service = _make_service()
    service._find_by_id = AsyncMock(return_value=None)
    service._find_by_provider_sub = AsyncMock(return_value=None)
    service._create_user = AsyncMock(return_value=created_user)

    user, outcome = await service.handle_oauth_callback(
        gotrue_user_id=str(new_user_id),
        email="new@example.com",
        full_name="New User",
        provider_sub=provider_sub,
    )

    assert outcome == "new_user"
    assert user is created_user
    service._create_user.assert_called_once_with(
        user_id=new_user_id,
        email="new@example.com",
        full_name="New User",
        avatar_url=None,
        provider_sub=provider_sub,
    )


@pytest.mark.asyncio
async def test_new_user_without_provider_sub():
    """Cas 3b : nouveau provider sans sub → INSERT sans provider_sub."""
    new_user_id = uuid.uuid4()
    created_user = _make_user(user_id=new_user_id, provider_sub=None)

    service = _make_service()
    service._find_by_id = AsyncMock(return_value=None)
    service._find_by_provider_sub = AsyncMock(return_value=None)
    service._create_user = AsyncMock(return_value=created_user)

    user, outcome = await service.handle_oauth_callback(
        gotrue_user_id=str(new_user_id),
        email="new@example.com",
        provider_sub=None,
    )

    assert outcome == "new_user"
    # _find_by_provider_sub ne doit pas être appelé si provider_sub est None
    service._find_by_provider_sub.assert_not_called()


@pytest.mark.asyncio
async def test_retrocompat_provider_sub_filled_on_login():
    """Cas 4 : rétrocompatibilité — provider_sub null mis à jour au login."""
    user_id = uuid.uuid4()
    # Utilisateur existant sans provider_sub (compte créé avant migration 0003)
    existing_user = _make_user(user_id=user_id, provider_sub=None)

    service = _make_service()
    service._find_by_id = AsyncMock(return_value=existing_user)
    service._update_login_metadata = AsyncMock()

    new_provider_sub = "microsoft:zzz"
    user, outcome = await service.handle_oauth_callback(
        gotrue_user_id=str(user_id),
        email="old@example.com",
        provider_sub=new_provider_sub,
    )

    assert outcome == "existing"
    # _update_login_metadata reçoit le nouveau provider_sub pour rétrocompat.
    service._update_login_metadata.assert_called_once_with(
        existing_user, None, None, new_provider_sub
    )


@pytest.mark.asyncio
async def test_has_organization_true():
    """Utilisateur avec organisation → has_organization() retourne True."""
    user_id = uuid.uuid4()

    db = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one = MagicMock(return_value=2)
    db.execute = AsyncMock(return_value=mock_result)

    service = AuthService(db)
    result = await service.has_organization(user_id)
    assert result is True


@pytest.mark.asyncio
async def test_has_organization_false():
    """Utilisateur sans organisation → has_organization() retourne False."""
    user_id = uuid.uuid4()

    db = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one = MagicMock(return_value=0)
    db.execute = AsyncMock(return_value=mock_result)

    service = AuthService(db)
    result = await service.has_organization(user_id)
    assert result is False
