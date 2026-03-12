# Kerpta — Router de recherche d'entreprises (API Sirene INSEE)
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes de recherche d'entreprises via l'API Sirene INSEE.

Routes exposées :
  GET /api/v1/companies/search?q={query}
      Recherche par nom, SIREN (9 ch.), SIRET (14 ch.) ou TVA (FR...).
      Retourne uniquement les entreprises actives.

  GET /api/v1/companies/{siren}
      Détails complets : siège + tous les établissements actifs.

Authentification : Bearer JWT requis (tout utilisateur connecté).
La clé API INSEE est lue depuis platform_config.api_keys.insee_api_key.
"""

import logging
import re
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id

from . import service
from .schemas import CompanyDetails, CompanySearchResult

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])


# ── Dépendance : clé API INSEE ────────────────────────────────────────────────


async def _get_insee_key(db: AsyncSession = Depends(get_db)) -> str:
    """Récupère la clé API INSEE depuis platform_config."""
    result = await db.execute(text("SELECT api_keys FROM platform_config LIMIT 1"))
    row = result.fetchone()
    api_keys: dict = (row[0] or {}) if row else {}
    key = (api_keys.get("insee_api_key") or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Clé API INSEE non configurée — contactez votre administrateur",
        )
    return key


# ── Gestion d'erreurs httpx ────────────────────────────────────────────────────


def _handle_httpx_error(exc: Exception) -> None:
    """Convertit les erreurs httpx en HTTPException FastAPI."""
    if isinstance(exc, httpx.HTTPStatusError):
        _log.warning("[companies] INSEE HTTP %s", exc.response.status_code)
        raise HTTPException(502, f"Erreur API INSEE : {exc.response.status_code}")
    if isinstance(exc, httpx.RequestError):
        _log.warning("[companies] Erreur réseau INSEE : %s", exc)
        raise HTTPException(502, "Impossible de joindre l'API INSEE")
    raise exc


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/search", response_model=list[CompanySearchResult])
async def search_companies(
    q: str = Query(
        ...,
        min_length=2,
        description="Nom de société, SIREN (9 ch.), SIRET (14 ch.) ou TVA (FR...)",
    ),
    api_key: str = Depends(_get_insee_key),
    _user: UUID = Depends(get_current_user_id),
) -> list[CompanySearchResult]:
    """Recherche une entreprise active par dénomination, SIREN, SIRET ou TVA.

    - **9 chiffres** → recherche par SIREN
    - **14 chiffres** → recherche par SIRET
    - **FR + 11 chiffres** → numéro TVA intracommunautaire (extrait le SIREN)
    - **Autres** → recherche en texte libre sur la dénomination

    Retourne uniquement les entreprises dont l'état administratif est **Actif**.
    """
    try:
        return await service.search_companies(q.strip(), api_key)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        _handle_httpx_error(exc)
    return []  # Unreachable — satisfies mypy


@router.get("/{siren}", response_model=CompanyDetails)
async def get_company_details(
    siren: str,
    api_key: str = Depends(_get_insee_key),
    _user: UUID = Depends(get_current_user_id),
) -> CompanyDetails:
    """Retourne les détails complets d'une entreprise active.

    Inclut :
    - Informations de l'unité légale (forme juridique, APE, TVA, effectifs…)
    - Siège social
    - Tous les établissements actifs avec adresses complètes

    Retourne **404** si le SIREN est introuvable ou si l'entreprise est cessée.
    """
    if not re.fullmatch(r"\d{9}", siren):
        raise HTTPException(422, "SIREN invalide — 9 chiffres attendus")
    try:
        details = await service.get_company_details(siren, api_key)
        if details is None:
            raise HTTPException(404, f"SIREN {siren} introuvable ou entreprise cessée")
        return details
    except HTTPException:
        raise
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        _handle_httpx_error(exc)
    raise HTTPException(500, "Erreur interne")  # Unreachable — satisfies mypy
