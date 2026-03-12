# Kerpta — Service de recherche d'entreprises via l'API Recherche d'Entreprises (data.gouv.fr)
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Logique métier pour la recherche d'entreprises.

API principale : https://recherche-entreprises.api.gouv.fr (gratuite, sans clé)
  GET /search?q=…&per_page=10  — recherche full-text par nom, SIREN, SIRET

API secondaire (TVA intracommunautaire non-française) :
  GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{num}

Détection automatique du type de requête :
  9 chiffres  → SIREN
  14 chiffres → SIRET
  FR + 11 ch. → numéro TVA intracommunautaire (→ extrait le SIREN)
  2 lettres UE + 4-13 alphanums → TVA européenne (→ VIES)
  Autre       → recherche par dénomination
"""

import logging
import re
from typing import Literal

import httpx

from .schemas import Address, CompanyDetails, CompanySearchResult, Etablissement

_log = logging.getLogger(__name__)

REC_ENT_BASE = "https://recherche-entreprises.api.gouv.fr"
_TIMEOUT = 10.0

# ── Libellés formes juridiques (codes INSEE / catégories juridiques) ───────────

LEGAL_FORM: dict[str, str] = {
    "1000": "Entrepreneur individuel",
    "1100": "Agriculteur exploitant",
    "1200": "Artisan-commerçant",
    "1300": "Officier public ou ministériel",
    "1500": "Agent commercial",
    "2110": "Indivision",
    "5202": "SNC",
    "5306": "SCS",
    "5307": "SCA",
    "5410": "GIE",
    "5498": "EURL",
    "5499": "SARL",
    "5505": "SA",
    "5515": "SA cotée",
    "5520": "SA",
    "5525": "SA cotée",
    "5599": "SA",
    "5710": "SAS",
    "5720": "SASU",
    "6316": "SCI",
    "6531": "SCIC",
    "6532": "SCOP",
    "6540": "Société civile",
    "9220": "Association",
    "7111": "Autorité constitutionnelle",
    "7112": "Autorité juridictionnelle",
    "7120": "Service d'état",
    "7343": "Établissement public national",
}

# ── Libellés tranches d'effectifs ─────────────────────────────────────────────

EFFECTIFS: dict[str, str] = {
    "NN": "Non-employeur",
    "00": "0 salarié",
    "01": "1-2 salariés",
    "02": "3-5 salariés",
    "03": "6-9 salariés",
    "11": "10-19 salariés",
    "12": "20-49 salariés",
    "21": "50-99 salariés",
    "22": "100-199 salariés",
    "31": "200-249 salariés",
    "32": "250-499 salariés",
    "41": "500-999 salariés",
    "42": "1 000-1 999 salariés",
    "51": "2 000-4 999 salariés",
    "52": "5 000-9 999 salariés",
    "53": "10 000+ salariés",
}


# ── Fonctions utilitaires ─────────────────────────────────────────────────────


def compute_tva_intracom(siren: str) -> str:
    """Calcule le numéro TVA intracommunautaire français depuis un SIREN.

    Formule officielle : clé = (12 + 3 × (siren mod 97)) mod 97
    """
    try:
        key = (12 + 3 * (int(siren) % 97)) % 97
        return f"FR{key:02d}{siren}"
    except ValueError:
        return f"FR??{siren}"


def detect_query_type(q: str) -> Literal["siren", "siret", "tva", "name"]:
    """Détecte le type d'une requête de recherche d'entreprise."""
    normalized = re.sub(r"\s", "", q).upper()
    if re.fullmatch(r"\d{9}", normalized):
        return "siren"
    if re.fullmatch(r"\d{14}", normalized):
        return "siret"
    if re.fullmatch(r"FR\d{11}", normalized):
        return "tva"
    if is_eu_vat(normalized):
        return "tva"
    return "name"


def extract_siren_from_tva(tva: str) -> str:
    """Extrait le SIREN depuis un numéro TVA intracommunautaire FR."""
    normalized = re.sub(r"\s", "", tva).upper()
    return normalized[4:13]  # Skip "FR" + 2 chiffres de clé → 9 chiffres SIREN


# ── Appels HTTP vers l'API Recherche d'Entreprises ───────────────────────────


async def _fetch_companies(q: str, per_page: int = 10) -> list[dict]:
    """Effectue une requête vers l'API recherche-entreprises.api.gouv.fr."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            f"{REC_ENT_BASE}/search",
            params={"q": q, "per_page": per_page},
            headers={"Accept": "application/json"},
        )
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        return resp.json().get("results", [])


def _build_address_from_siege(siege: dict) -> Address:
    """Construit une adresse formatée depuis le dict siege de l'API."""
    voie_parts = [p for p in [
        siege.get("numero_voie"),
        siege.get("indice_repetition"),
        siege.get("type_voie"),
        siege.get("libelle_voie"),
    ] if p]
    voie = " ".join(voie_parts) or None
    return Address(
        voie=voie,
        complement=siege.get("complement_adresse") or None,
        code_postal=siege.get("code_postal") or None,
        commune=siege.get("libelle_commune") or None,
        pays="France",
    )


def _extract_ca(item: dict) -> float | None:
    """Extrait le CA annuel le plus récent (None si 0 ou absent = non déclaré)."""
    finances = item.get("finances") or {}
    if not finances:
        return None
    latest_year = max(finances.keys())
    ca = finances[latest_year].get("ca")
    return float(ca) if ca and ca > 0 else None


def _item_to_search_result(item: dict) -> CompanySearchResult:
    """Convertit un résultat de l'API en CompanySearchResult."""
    siren = item.get("siren", "")
    siege = item.get("siege") or {}
    nat_jur = item.get("nature_juridique") or None

    adresse = _build_address_from_siege(siege) if siege else None

    return CompanySearchResult(
        siren=siren,
        denomination=item.get("nom_raison_sociale") or item.get("nom_complet"),
        sigle=item.get("sigle"),
        activite_principale=siege.get("activite_principale") or item.get("activite_principale"),
        categorie_juridique=nat_jur,
        categorie_juridique_libelle=LEGAL_FORM.get(nat_jur or "") or None,
        date_creation=item.get("date_creation"),
        etat="Actif" if item.get("etat_administratif") == "A" else "Cessé",
        tva_intracom=compute_tva_intracom(siren) if siren else "",
        siege_adresse=adresse,
        siret_siege=siege.get("siret"),
        ca=_extract_ca(item),
    )


# ── Fonctions publiques ───────────────────────────────────────────────────────


async def search_companies(q: str) -> list[CompanySearchResult]:
    """Recherche des entreprises actives par nom, SIREN, SIRET ou TVA.

    Retourne uniquement les entreprises dont l'état administratif est actif.
    """
    qtype = detect_query_type(q)
    normalized = re.sub(r"\s", "", q).strip()

    # TVA française → extraire le SIREN, TVA européenne non-FR → VIES
    if qtype == "tva":
        country_code = normalized[:2].upper()
        if country_code != "FR":
            return await search_by_vat_eu(normalized)
        normalized = extract_siren_from_tva(q)

    results = await _fetch_companies(normalized)
    return [
        _item_to_search_result(item)
        for item in results
        if item.get("etat_administratif") == "A"
    ]


def _matching_etab_to_etablissement(etab: dict, siege_siret: str | None) -> Etablissement:
    """Convertit un matching_etablissement de l'API en Etablissement."""
    siret = etab.get("siret", "")
    is_siege = (siret == siege_siret) if siege_siret else bool(etab.get("est_siege"))
    adresse = _build_address_from_siege(etab)
    return Etablissement(
        siret=siret,
        nic=siret[-5:] if len(siret) >= 5 else "",
        siege=is_siege,
        etat=etab.get("etat_administratif", "A"),
        activite_principale=etab.get("activite_principale") or None,
        date_creation=etab.get("date_debut") or None,
        adresse=adresse,
    )


async def get_company_details(siren: str) -> CompanyDetails | None:
    """Retourne les détails d'une entreprise active via son SIREN, avec tous ses établissements."""
    results = await _fetch_companies(siren, per_page=1)
    if not results:
        return None

    item = results[0]
    if item.get("etat_administratif") != "A":
        return None

    siege = item.get("siege") or {}
    nat_jur = item.get("nature_juridique") or None
    effectifs_code = item.get("tranche_effectif_salarie") or None
    siege_siret = siege.get("siret") if siege else None

    # Établissement siège
    siege_etab: Etablissement | None = None
    if siege:
        adresse = _build_address_from_siege(siege)
        siege_etab = Etablissement(
            siret=siege_siret or "",
            nic=siege_siret[-5:] if siege_siret and len(siege_siret) >= 5 else "",
            siege=True,
            etat="A",
            activite_principale=siege.get("activite_principale"),
            date_creation=item.get("date_creation"),
            adresse=adresse,
        )

    # Tous les établissements actifs depuis matching_etablissements
    matching: list[dict] = item.get("matching_etablissements") or []
    etabs_actifs: list[Etablissement] = []
    sirets_seen: set[str] = set()

    # D'abord le siège (priorité en tête de liste)
    if siege_etab:
        etabs_actifs.append(siege_etab)
        if siege_siret:
            sirets_seen.add(siege_siret)

    # Puis les autres établissements actifs
    for etab in matching:
        if etab.get("etat_administratif") != "A":
            continue
        siret = etab.get("siret", "")
        if siret and siret in sirets_seen:
            continue
        sirets_seen.add(siret)
        etabs_actifs.append(_matching_etab_to_etablissement(etab, siege_siret))

    return CompanyDetails(
        siren=item.get("siren", siren),
        denomination=item.get("nom_raison_sociale") or item.get("nom_complet"),
        sigle=item.get("sigle"),
        activite_principale=item.get("activite_principale"),
        categorie_juridique=nat_jur,
        categorie_juridique_libelle=LEGAL_FORM.get(nat_jur or "") or None,
        date_creation=item.get("date_creation"),
        etat="Actif",
        tva_intracom=compute_tva_intracom(siren),
        tranche_effectifs=effectifs_code,
        tranche_effectifs_libelle=EFFECTIFS.get(effectifs_code or ""),
        categorie_entreprise=item.get("categorie_entreprise"),
        siege=siege_etab,
        etablissements_actifs=etabs_actifs,
        nombre_etablissements_actifs=item.get("nombre_etablissements_ouverts", 0),
    )


# ── Intégration VIES — TVA européenne (hors France) ──────────────────────────

VIES_BASE = "https://ec.europa.eu/taxation_customs/vies/rest-api"

EU_MEMBER_STATES: set[str] = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
    "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK",
}


def is_eu_vat(q: str) -> bool:
    """Détecte si la chaîne ressemble à un numéro de TVA intracommunautaire européen."""
    normalized = re.sub(r"\s", "", q).upper()
    m = re.match(r"^([A-Z]{2})([A-Z0-9]{4,13})$", normalized)
    if not m:
        return False
    return m.group(1) in EU_MEMBER_STATES


def _parse_vies_address(address_str: str) -> Address:
    """Analyse l'adresse multi-lignes retournée par l'API VIES."""
    lines = [ln.strip() for ln in address_str.split("\n") if ln.strip() and ln.strip() != "---"]
    if not lines:
        return Address()

    voie: str | None = lines[0] if lines else None
    code_postal: str | None = None
    commune: str | None = None

    if len(lines) >= 2:
        last = lines[-1]
        m = re.match(r"^(\d{4,5}[-\s]?[A-Z]{0,3})\s+(.+)$", last)
        if m:
            code_postal = m.group(1).replace(" ", "")
            commune = m.group(2).strip()
        else:
            commune = last
        if len(lines) > 2:
            voie = " — ".join(lines[:-1])

    return Address(voie=voie, code_postal=code_postal, commune=commune)


async def search_by_vat_eu(vat: str) -> list[CompanySearchResult]:
    """Vérifie un numéro de TVA européen via le service VIES de la Commission européenne."""
    normalized = re.sub(r"\s", "", vat).upper()
    country_code = normalized[:2]
    vat_number = normalized[2:]

    if country_code == "FR":
        _log.warning("[companies] search_by_vat_eu appelé pour FR — utiliser recherche-entreprises à la place")
        return []

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{VIES_BASE}/ms/{country_code}/vat/{vat_number}",
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
    except httpx.RequestError as exc:
        _log.warning("[companies] VIES réseau : %s", exc)
        raise

    user_error = data.get("userError", "")

    if user_error in ("MS_UNAVAILABLE", "SERVICE_UNAVAILABLE", "MS_MAX_CONCURRENT_REQ"):
        _log.warning("[companies] VIES indisponible pour %s : %s", country_code, user_error)
        raise httpx.HTTPStatusError(
            f"VIES service unavailable: {user_error}",
            request=resp.request,
            response=resp,
        )

    if not data.get("isValid"):
        return []

    name_raw = data.get("name") or ""
    address_raw = data.get("address") or ""
    name = name_raw if name_raw and name_raw != "---" else None
    adresse = _parse_vies_address(address_raw) if address_raw and address_raw != "---" else None

    return [
        CompanySearchResult(
            siren="",
            denomination=name,
            sigle=None,
            activite_principale=None,
            categorie_juridique=None,
            categorie_juridique_libelle=None,
            date_creation=None,
            etat="Actif",
            tva_intracom=normalized,
            siege_adresse=adresse,
        )
    ]
