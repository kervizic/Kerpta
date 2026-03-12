# Kerpta — Router de recherche d'entreprises (API Recherche d'Entreprises data.gouv.fr)
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes de recherche d'entreprises via l'API recherche-entreprises.api.gouv.fr.

Routes exposées :
  GET /api/v1/companies/search?q={query}
      Recherche par nom, SIREN (9 ch.), SIRET (14 ch.) ou TVA (FR...).
      Retourne uniquement les entreprises actives.

  GET /api/v1/companies/{siren}
      Détails complets : siège + informations légales.

Authentification : Bearer JWT requis (tout utilisateur connecté).
Aucune clé API requise — l'API gouvernementale est publique et gratuite.
"""

import logging
import re
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user_id

from . import service
from .schemas import CompanyDetails, CompanySearchResult

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])


# ── Gestion d'erreurs httpx ────────────────────────────────────────────────────


def _handle_httpx_error(exc: Exception) -> None:
    """Convertit les erreurs httpx en HTTPException FastAPI."""
    if isinstance(exc, httpx.HTTPStatusError):
        _log.warning("[companies] HTTP %s", exc.response.status_code)
        raise HTTPException(502, f"Erreur API : {exc.response.status_code}")
    if isinstance(exc, httpx.RequestError):
        _log.warning("[companies] Erreur réseau : %s", exc)
        raise HTTPException(502, "Impossible de joindre le service de recherche d'entreprises")
    raise exc


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/search", response_model=list[CompanySearchResult])
async def search_companies(
    q: str = Query(
        ...,
        min_length=2,
        description="Nom de société, SIREN (9 ch.), SIRET (14 ch.) ou TVA (FR...)",
    ),
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
        return await service.search_companies(q.strip())
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        _handle_httpx_error(exc)
    return []  # Unreachable — satisfies mypy


@router.get("/{siren}", response_model=CompanyDetails)
async def get_company_details(
    siren: str,
    _user: UUID = Depends(get_current_user_id),
) -> CompanyDetails:
    """Retourne les détails d'une entreprise active.

    Retourne **404** si le SIREN est introuvable ou si l'entreprise est cessée.
    """
    if not re.fullmatch(r"\d{9}", siren):
        raise HTTPException(422, "SIREN invalide — 9 chiffres attendus")
    try:
        details = await service.get_company_details(siren)
        if details is None:
            raise HTTPException(404, f"SIREN {siren} introuvable ou entreprise cessée")
        return details
    except HTTPException:
        raise
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        _handle_httpx_error(exc)
    raise HTTPException(500, "Erreur interne")  # Unreachable — satisfies mypy
