# Kerpta — Service d'enrichissement via l'API INPI/RNE
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Client pour l'API du Registre National des Entreprises (INPI).

L'API INPI fournit des données absentes de data.gouv :
  - Capital social (montant, devise, variable/fixe)
  - Objet social complet
  - Date de clôture de l'exercice social
  - Date d'immatriculation RCS
  - Durée de la société

Endpoint : https://registre-national-entreprises.inpi.fr/api
Auth : JWT (login/password) — token valide 24h
Quota : 10 000 requêtes/jour (compte gratuit niveau 1)
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)

INPI_BASE = "https://registre-national-entreprises.inpi.fr/api"
_TIMEOUT = 15.0

# Cache du token JWT en mémoire (valide 24h, on le renouvelle à 23h)
_token_cache: dict[str, str | float] = {"token": "", "expires_at": 0.0}


# ── Données enrichies INPI ───────────────────────────────────────────────────


@dataclass
class InpiCompanyData:
    """Données d'une entreprise récupérées depuis l'API INPI/RNE."""

    capital: float | None = None
    devise_capital: str | None = None
    capital_variable: bool | None = None
    objet_social: str | None = None
    duree_societe: int | None = None  # en années
    date_cloture_exercice: str | None = None  # "3009" = 30 septembre
    date_immatriculation_rcs: str | None = None  # ISO date
    est_ess: bool | None = None
    associe_unique: bool | None = None
    nombre_salaries: int | None = None


# ── Auth INPI ────────────────────────────────────────────────────────────────


async def _get_inpi_credentials(db: AsyncSession) -> tuple[str, str] | None:
    """Récupère les identifiants INPI depuis platform_config.api_keys."""
    result = await db.execute(
        text("SELECT api_keys FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    if not row or not row[0]:
        return None
    api_keys = row[0]
    inpi = api_keys.get("inpi")
    if not inpi or not inpi.get("username") or not inpi.get("password"):
        return None
    return inpi["username"], inpi["password"]


async def _authenticate(username: str, password: str) -> str | None:
    """Authentifie auprès de l'API INPI et retourne le JWT token."""
    global _token_cache

    # Réutiliser le token s'il est encore valide (marge de 1h)
    if _token_cache["token"] and time.time() < (_token_cache["expires_at"] - 3600):
        return str(_token_cache["token"])

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{INPI_BASE}/sso/login",
                json={"username": username, "password": password},
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 401:
                _log.warning("[inpi] Identifiants INPI invalides")
                return None
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        _log.warning("[inpi] Erreur auth INPI : %s", exc)
        return None

    token = data.get("token")
    if not token:
        _log.warning("[inpi] Réponse auth INPI sans token")
        return None

    # Le token INPI expire en 86400s (24h)
    _token_cache["token"] = token
    _token_cache["expires_at"] = time.time() + 86400

    _log.debug("[inpi] Token INPI obtenu, expire dans 24h")
    return token


# ── Fetch company data ───────────────────────────────────────────────────────


async def _fetch_company_inpi(siren: str, token: str) -> dict | None:
    """Appelle GET /api/companies/{siren} et retourne la réponse brute."""
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(
                    f"{INPI_BASE}/companies/{siren}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json",
                    },
                )
                if resp.status_code == 404:
                    return None
                if resp.status_code == 401:
                    # Token expiré — invalider le cache
                    _token_cache["token"] = ""
                    _token_cache["expires_at"] = 0.0
                    _log.warning("[inpi] Token INPI expiré, retry")
                    return None
                resp.raise_for_status()
                return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            _log.warning("[inpi] Tentative %d/2 pour %s : %s", attempt + 1, siren, exc)
            if attempt == 0:
                await asyncio.sleep(1.0)
    _log.error("[inpi] Échec récupération INPI pour %s : %s", siren, last_exc)
    return None


def _extract_inpi_data(raw: dict) -> InpiCompanyData:
    """Extrait les données pertinentes depuis la réponse brute INPI."""
    content = raw.get("formality", {}).get("content", {})
    pm = content.get("personneMorale", {})
    identite = pm.get("identite", {})
    description = identite.get("description", {})
    entreprise = identite.get("entreprise", {})
    registre = content.get("registreAnterieur", {})

    # Date d'immatriculation RCS
    rncs = registre.get("rncs", {})
    date_immat = None
    if rncs.get("estPresent") and rncs.get("dateImmatriculation"):
        # Format ISO "2018-03-23T00:00:00+01:00" → "2018-03-23"
        date_immat = str(rncs["dateImmatriculation"])[:10]

    return InpiCompanyData(
        capital=description.get("montantCapital"),
        devise_capital=description.get("deviseCapital"),
        capital_variable=description.get("capitalVariable"),
        objet_social=description.get("objet"),
        duree_societe=description.get("duree"),
        date_cloture_exercice=description.get("dateClotureExerciceSocial"),
        date_immatriculation_rcs=date_immat,
        est_ess=description.get("ess"),
        associe_unique=description.get("indicateurAssocieUnique"),
        nombre_salaries=entreprise.get("nombreSalarie"),
    )


# ── Fonction publique ────────────────────────────────────────────────────────


async def get_inpi_data(siren: str, db: AsyncSession) -> InpiCompanyData | None:
    """Récupère les données INPI pour un SIREN donné.

    Retourne None si :
      - Les identifiants INPI ne sont pas configurés
      - L'authentification échoue
      - L'entreprise n'est pas trouvée
    """
    creds = await _get_inpi_credentials(db)
    if creds is None:
        _log.debug("[inpi] Pas d'identifiants INPI configurés — enrichissement ignoré")
        return None

    username, password = creds
    token = await _authenticate(username, password)
    if token is None:
        return None

    raw = await _fetch_company_inpi(siren, token)
    if raw is None:
        return None

    data = _extract_inpi_data(raw)
    _log.debug("[inpi] Données INPI récupérées pour %s : capital=%s", siren, data.capital)
    return data
