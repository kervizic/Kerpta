# Kerpta — Service de recherche d'entreprises via l'API Sirene INSEE
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Logique métier pour la recherche d'entreprises.

Endpoints utilisés :
  GET /api-sirene/3.11/siren/{siren}            — unité légale par SIREN
  GET /api-sirene/3.11/siret/{siret}            — établissement par SIRET
  GET /api-sirene/3.11/siret?q=...              — recherche multi-critères
  Header d'auth : X-INSEE-Api-Key-Integration: <clé>

Détection automatique du type de requête :
  9 chiffres  → SIREN
  14 chiffres → SIRET
  FR + 11 ch. → numéro TVA intracommunautaire (→ extrait le SIREN)
  Autre       → recherche par dénomination
"""

import logging
import re
from typing import Literal

import httpx

from .schemas import Address, CompanyDetails, CompanySearchResult, Etablissement

_log = logging.getLogger(__name__)

INSEE_BASE = "https://api.insee.fr/api-sirene/3.11"
_TIMEOUT = 10.0

# ── Libellés formes juridiques (codes NAF 2008 / INSEE) ───────────────────────

LEGAL_FORM: dict[str, str] = {
    "1000": "Entrepreneur individuel",
    "1100": "Agriculteur exploitant",
    "1200": "Artisan-commerçant",
    "1300": "Officier public ou ministériel",
    "1500": "Agent commercial",
    "2110": "Indivision",
    "5202": "SASU",
    "5308": "EURL",
    "5306": "SCI",
    "5410": "SNC",
    "5499": "SAS",
    "5498": "SARL",
    "5599": "SA non cotée",
    "5710": "SA cotée (CA)",
    "5720": "SA cotée (Directoire)",
    "6532": "SCOP",
    "6531": "SCIC",
    "6540": "Association loi 1901",
    "9220": "Association",
    "7111": "Autorité constitutionnelle",
    "7112": "Autorité juridictionnelle",
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
    """Détecte le type d'une requête de recherche d'entreprise.

    Détection dans l'ordre :
      - 9 chiffres → SIREN
      - 14 chiffres → SIRET
      - FR + 11 chiffres → TVA française (→ INSEE)
      - 2 lettres pays UE + 4-13 alphanum → TVA européenne (→ VIES)
      - Autre → recherche par dénomination
    """
    normalized = re.sub(r"\s", "", q).upper()
    if re.fullmatch(r"\d{9}", normalized):
        return "siren"
    if re.fullmatch(r"\d{14}", normalized):
        return "siret"
    if re.fullmatch(r"FR\d{11}", normalized):
        return "tva"
    # Autres TVA européennes : code pays UE + 4-13 chars alphanumériques
    if is_eu_vat(normalized):
        return "tva"
    return "name"


def extract_siren_from_tva(tva: str) -> str:
    """Extrait le SIREN depuis un numéro TVA intracommunautaire FR.

    Format TVA : FR (2) + clé (2) + SIREN (9) = 13 caractères.
    """
    normalized = re.sub(r"\s", "", tva).upper()
    return normalized[4:13]  # Skip "FR" + 2 chiffres de clé → 9 chiffres SIREN


def _escape_lucene(text: str) -> str:
    """Échappe les caractères spéciaux Lucene (sauf * pour wildcard)."""
    return re.sub(r'([+\-!(){}[\]^"~?:\\/])', r'\\\1', text)


def _build_name_query(name: str) -> str:
    """Construit la requête Lucene pour la recherche par dénomination."""
    escaped = _escape_lucene(name.strip())
    base = "etatAdministratifUniteLegale:A AND etablissementSiege:true"
    if " " in escaped:
        # Recherche par phrase exacte
        return f'denominationUniteLegale:"{escaped}" AND {base}'
    else:
        # Recherche par préfixe (wildcard)
        return f"denominationUniteLegale:{escaped}* AND {base}"


def _build_address(adr: dict) -> Address:
    """Construit une adresse formatée depuis le dict adresseEtablissement INSEE."""
    num = adr.get("numeroVoieEtablissement") or ""
    ind = adr.get("indiceRepetitionEtablissement") or ""
    typ = adr.get("typeVoieEtablissement") or ""
    lib = adr.get("libelleVoieEtablissement") or ""
    voie_parts = [p for p in [num, ind, typ, lib] if p]
    voie = " ".join(voie_parts) or None
    return Address(
        voie=voie,
        complement=adr.get("complementAdresseEtablissement") or None,
        code_postal=adr.get("codePostalEtablissement") or None,
        commune=adr.get("libelleCommuneEtablissement") or None,
        pays=adr.get("libellePaysEtrangerEtablissement") or "France",
    )


def _extract_etab(raw: dict) -> Etablissement:
    """Extrait les données d'un établissement depuis la réponse API Sirene."""
    periodes = raw.get("periodesEtablissement") or [{}]
    p = periodes[0] if periodes else {}
    return Etablissement(
        siret=raw.get("siret", ""),
        nic=raw.get("nic", ""),
        siege=raw.get("etablissementSiege", False),
        etat=p.get("etatAdministratifEtablissement", "?"),
        activite_principale=p.get("activitePrincipaleEtablissement") or None,
        date_creation=raw.get("dateCreationEtablissement") or None,
        adresse=_build_address(raw.get("adresseEtablissement") or {}),
    )


def _extract_ul_from_etab(raw: dict) -> dict:
    """Extrait les données de l'uniteLegale embarquée dans un résultat /siret."""
    siren = raw.get("siren") or raw.get("siret", "")[:9]
    ul = raw.get("uniteLegale") or {}
    periodes = ul.get("periodesUniteLegale") or [{}]
    p = periodes[0] if periodes else {}
    return {
        "siren": siren,
        "denomination": p.get("denominationUniteLegale") or None,
        "sigle": p.get("sigleUniteLegale") or None,
        "activite_principale": p.get("activitePrincipaleUniteLegale") or None,
        "categorie_juridique": p.get("categorieJuridiqueUniteLegale") or None,
        "date_creation": ul.get("dateCreationUniteLegale") or None,
        "etat": p.get("etatAdministratifUniteLegale") or "?",
        "tranche_effectifs": ul.get("trancheEffectifsUniteLegale") or None,
        "categorie_entreprise": ul.get("categorieEntreprise") or None,
    }


def _ul_to_search_result(ul_data: dict, siege_etab: Etablissement | None) -> CompanySearchResult:
    """Construit un CompanySearchResult depuis les données unité légale."""
    siren = ul_data["siren"]
    cat_jur = ul_data.get("categorie_juridique")
    etat_label = "Actif" if ul_data.get("etat") == "A" else "Cessé"
    return CompanySearchResult(
        siren=siren,
        denomination=ul_data.get("denomination"),
        sigle=ul_data.get("sigle"),
        activite_principale=ul_data.get("activite_principale"),
        categorie_juridique=cat_jur,
        categorie_juridique_libelle=LEGAL_FORM.get(cat_jur or "") or None,
        date_creation=ul_data.get("date_creation"),
        etat=etat_label,
        tva_intracom=compute_tva_intracom(siren),
        siege_adresse=siege_etab.adresse if siege_etab else None,
    )


# ── Appels HTTP vers l'API Sirene ─────────────────────────────────────────────


async def _fetch(url: str, api_key: str, params: dict | None = None) -> dict:
    """Effectue une requête GET vers l'API Sirene et retourne le JSON."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            url,
            params=params,
            headers={
                "X-INSEE-Api-Key-Integration": api_key,
                "Accept": "application/json",
            },
        )
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        return resp.json()


async def _get_siege(siren: str, api_key: str) -> Etablissement | None:
    """Récupère le siège social actif d'une entreprise."""
    data = await _fetch(
        f"{INSEE_BASE}/siret",
        api_key,
        params={
            "q": f"siren:{siren} AND etablissementSiege:true",
            "nombre": 1,
        },
    )
    etabs = data.get("etablissements") or []
    return _extract_etab(etabs[0]) if etabs else None


# ── Fonctions publiques ───────────────────────────────────────────────────────


async def search_companies(q: str, api_key: str) -> list[CompanySearchResult]:
    """Recherche des entreprises actives par nom, SIREN, SIRET ou TVA.

    Retourne uniquement les entreprises dont l'état est actif (A).
    """
    qtype = detect_query_type(q)
    normalized = re.sub(r"\s", "", q).strip()

    # TVA française → extrait le SIREN et recherche via INSEE
    # TVA européenne non-française → recherche via VIES
    if qtype == "tva":
        country_code = normalized[:2]
        if country_code == "FR":
            normalized = extract_siren_from_tva(q)
            qtype = "siren"
        else:
            # EU TVA non-française → VIES
            return await search_by_vat_eu(normalized)

    if qtype == "siren":
        data = await _fetch(f"{INSEE_BASE}/siren/{normalized}", api_key)
        ul = data.get("uniteLegale")
        if not ul:
            return []
        periodes = ul.get("periodesUniteLegale") or [{}]
        p = periodes[0] if periodes else {}
        # Filtre les sociétés actives uniquement
        if p.get("etatAdministratifUniteLegale") != "A":
            return []
        ul_data = {
            "siren": ul.get("siren", normalized),
            "denomination": p.get("denominationUniteLegale"),
            "sigle": p.get("sigleUniteLegale"),
            "activite_principale": p.get("activitePrincipaleUniteLegale"),
            "categorie_juridique": p.get("categorieJuridiqueUniteLegale"),
            "date_creation": ul.get("dateCreationUniteLegale"),
            "etat": p.get("etatAdministratifUniteLegale", "A"),
            "tranche_effectifs": ul.get("trancheEffectifsUniteLegale"),
            "categorie_entreprise": ul.get("categorieEntreprise"),
        }
        siege_etab = await _get_siege(normalized, api_key)
        return [_ul_to_search_result(ul_data, siege_etab)]

    if qtype == "siret":
        data = await _fetch(f"{INSEE_BASE}/siret/{normalized}", api_key)
        raw = data.get("etablissement")
        if not raw:
            return []
        ul_data = _extract_ul_from_etab(raw)
        # Filtre les sociétés actives uniquement
        if ul_data.get("etat") != "A":
            return []
        siege_etab: Etablissement | None = None
        if raw.get("etablissementSiege"):
            siege_etab = _extract_etab(raw)
        else:
            siege_etab = await _get_siege(ul_data["siren"], api_key)
        return [_ul_to_search_result(ul_data, siege_etab)]

    # Recherche par dénomination
    q_str = _build_name_query(q)
    data = await _fetch(f"{INSEE_BASE}/siret", api_key, params={"q": q_str, "nombre": 20})
    etabs = data.get("etablissements") or []

    # Fallback : si aucun résultat avec phrase exacte, essayer token seul
    if not etabs and " " in q.strip():
        first_word = _escape_lucene(q.strip().split()[0])
        q_fallback = (
            f"denominationUniteLegale:{first_word}* "
            f"AND etatAdministratifUniteLegale:A AND etablissementSiege:true"
        )
        data = await _fetch(f"{INSEE_BASE}/siret", api_key, params={"q": q_fallback, "nombre": 20})
        etabs = data.get("etablissements") or []

    results: list[CompanySearchResult] = []
    seen: set[str] = set()
    for etab in etabs:
        ul_data = _extract_ul_from_etab(etab)
        siren = ul_data["siren"]
        if siren in seen:
            continue
        seen.add(siren)
        # Vérification active (normalement filtrée par la requête)
        if ul_data.get("etat") != "A":
            continue
        siege_etab = _extract_etab(etab)
        results.append(_ul_to_search_result(ul_data, siege_etab))

    return results


async def get_company_details(siren: str, api_key: str) -> CompanyDetails | None:
    """Retourne les détails complets d'une entreprise active.

    Effectue deux appels parallèles à l'API Sirene :
      1. /siren/{siren}                      → informations de l'unité légale
      2. /siret?q=siren:{siren}&...          → tous les établissements actifs
    """
    # 1. Unité légale
    ul_data_raw = await _fetch(f"{INSEE_BASE}/siren/{siren}", api_key)
    ul = ul_data_raw.get("uniteLegale")
    if not ul:
        return None

    periodes = ul.get("periodesUniteLegale") or [{}]
    p = periodes[0] if periodes else {}

    # On ne retourne que les entreprises actives
    if p.get("etatAdministratifUniteLegale") != "A":
        return None

    cat_jur = p.get("categorieJuridiqueUniteLegale")
    effectifs_code = ul.get("trancheEffectifsUniteLegale")

    # 2. Établissements actifs
    etabs_raw = await _fetch(
        f"{INSEE_BASE}/siret",
        api_key,
        params={
            "q": f"siren:{siren} AND etatAdministratifEtablissement:A",
            "nombre": 200,
        },
    )
    raw_etabs = etabs_raw.get("etablissements") or []

    # Filtre en Python par sécurité (la requête filtre déjà mais l'API peut être imprécise)
    etablissements = [
        _extract_etab(e)
        for e in raw_etabs
        if (e.get("periodesEtablissement") or [{}])[0].get("etatAdministratifEtablissement") == "A"
    ]

    siege = next((e for e in etablissements if e.siege), None)

    return CompanyDetails(
        siren=ul.get("siren", siren),
        denomination=p.get("denominationUniteLegale"),
        sigle=p.get("sigleUniteLegale"),
        activite_principale=p.get("activitePrincipaleUniteLegale"),
        categorie_juridique=cat_jur,
        categorie_juridique_libelle=LEGAL_FORM.get(cat_jur or ""),
        date_creation=ul.get("dateCreationUniteLegale"),
        etat="Actif",
        tva_intracom=compute_tva_intracom(siren),
        tranche_effectifs=effectifs_code,
        tranche_effectifs_libelle=EFFECTIFS.get(effectifs_code or ""),
        categorie_entreprise=ul.get("categorieEntreprise"),
        siege=siege,
        etablissements_actifs=etablissements,
        nombre_etablissements_actifs=len(etablissements),
    )


# ── Intégration VIES — TVA européenne (hors France) ──────────────────────────

VIES_BASE = "https://ec.europa.eu/taxation_customs/vies/rest-api"

# États membres de l'UE supportés par le service VIES
EU_MEMBER_STATES: set[str] = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
    "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK",
}


def is_eu_vat(q: str) -> bool:
    """Détecte si la chaîne ressemble à un numéro de TVA intracommunautaire européen.

    Format général : code pays 2 lettres + 4 à 13 caractères alphanumériques.
    Le code pays doit être un état membre connu de l'UE.
    """
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
        # Format "1234AB VILLE" ou "1234 VILLE" ou "1234-AB VILLE"
        m = re.match(r"^(\d{4,5}[-\s]?[A-Z]{0,3})\s+(.+)$", last)
        if m:
            code_postal = m.group(1).replace(" ", "")
            commune = m.group(2).strip()
        else:
            commune = last
        if len(lines) > 2:
            voie = " — ".join(lines[:-1])  # Adresse multi-lignes

    return Address(voie=voie, code_postal=code_postal, commune=commune)


async def search_by_vat_eu(vat: str) -> list[CompanySearchResult]:
    """Vérifie un numéro de TVA européen via le service VIES de la Commission européenne.

    Retourne une liste vide si le numéro est invalide ou le service indisponible.
    France : utilise INSEE (plus riche). Les autres pays utilisent VIES directement.
    """
    normalized = re.sub(r"\s", "", vat).upper()
    country_code = normalized[:2]
    vat_number = normalized[2:]

    if country_code == "FR":
        _log.warning("[companies] search_by_vat_eu appelé pour FR — utiliser INSEE à la place")
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

    # Erreurs récupérables (service momentanément indisponible)
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
            siren="",  # Non applicable pour les entreprises étrangères
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
