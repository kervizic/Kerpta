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

import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .inpi import InpiCompanyData, get_inpi_data
from .schemas import Address, CompanyDetails, CompanySearchResult, Dirigeant, Etablissement, FinanceYear

_log = logging.getLogger(__name__)

# Durée de validité du cache local (24 heures)
_CACHE_TTL = timedelta(hours=24)

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


def _parse_date(val: str | None) -> date | None:
    """Convertit une date ISO string en objet date Python (nécessaire pour asyncpg)."""
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


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
    """Effectue une requête vers l'API recherche-entreprises.api.gouv.fr.

    Retry 3× avec backoff exponentiel (1s, 2s) en cas d'erreur réseau ou 5xx.
    """
    last_exc: Exception = RuntimeError("no attempt")
    for attempt in range(3):
        try:
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
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            _log.warning("[companies] tentative %d/3 échouée : %s", attempt + 1, exc)
            if attempt < 2:
                await asyncio.sleep(1.0 * (attempt + 1))
    raise last_exc


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


def _extract_finances(raw: dict) -> list[FinanceYear]:
    """Extrait les données financières depuis raw_data."""
    finances = raw.get("finances") or {}
    result = []
    for annee, data in sorted(finances.items(), reverse=True):
        ca = data.get("ca")
        resultat_net = data.get("resultat_net")
        if ca or resultat_net:
            result.append(FinanceYear(
                annee=annee,
                ca=float(ca) if ca else None,
                resultat_net=float(resultat_net) if resultat_net else None,
            ))
    return result


def _extract_dirigeants(raw: dict) -> list[Dirigeant]:
    """Extrait les dirigeants depuis raw_data."""
    dirigeants_raw = raw.get("dirigeants") or []
    result = []
    for d in dirigeants_raw:
        result.append(Dirigeant(
            nom=d.get("nom"),
            prenoms=d.get("prenoms"),
            qualite=d.get("qualite"),
            nationalite=d.get("nationalite"),
            annee_de_naissance=str(d["annee_de_naissance"]) if d.get("annee_de_naissance") else None,
            type_dirigeant=d.get("type_dirigeant"),
        ))
    return result


def _extract_complements(raw: dict) -> tuple[list[str], bool | None, bool | None, bool | None]:
    """Extrait les compléments (IDCC, ESS, etc.) depuis raw_data.

    Retourne (conventions_collectives, est_ess, est_association, est_qualiopi).
    """
    complements = raw.get("complements") or {}
    idcc_list = complements.get("liste_idcc") or []
    conventions = [str(code) for code in idcc_list]
    est_ess = complements.get("est_ess")
    est_association = complements.get("est_association")
    est_qualiopi = complements.get("est_qualiopi")
    return conventions, est_ess, est_association, est_qualiopi


async def _load_from_cache(siren: str, db: AsyncSession) -> CompanyDetails | None:
    """Charge une entreprise depuis le cache local si les données ont < 24h."""
    cutoff = datetime.now(timezone.utc) - _CACHE_TTL

    # Vérifier fraîcheur de la société
    row = await db.execute(
        text("""
            SELECT denomination, sigle, legal_form_code, legal_form, vat_number,
                   ape_code, status, creation_date::text, raw_data
            FROM companies
            WHERE siren = :siren AND last_synced_at > :cutoff
        """),
        {"siren": siren, "cutoff": cutoff},
    )
    company = row.fetchone()
    if company is None:
        return None

    c = dict(company._mapping)
    if c["status"] != "active":
        return None

    # Extraire les champs enrichis depuis raw_data
    raw = c.get("raw_data") or {}
    if isinstance(raw, str):
        raw = json.loads(raw)
    effectifs_code = raw.get("tranche_effectif_salarie")
    effectifs_annee = raw.get("annee_tranche_effectif_salarie")

    # Charger les établissements actifs
    rows = await db.execute(
        text("""
            SELECT siret, nic, is_siege, status, address, activite_principale, raw_data
            FROM establishments
            WHERE siren = :siren AND status = 'active'
            ORDER BY is_siege DESC, siret ASC
        """),
        {"siren": siren},
    )
    etab_rows = rows.fetchall()

    siege_etab: Etablissement | None = None
    etabs_actifs: list[Etablissement] = []

    for er in etab_rows:
        e = dict(er._mapping)
        addr_data = e["address"] or {}
        if isinstance(addr_data, str):
            addr_data = json.loads(addr_data)
        etab_raw = e.get("raw_data") or {}
        if isinstance(etab_raw, str):
            etab_raw = json.loads(etab_raw)
        adresse = Address(
            voie=addr_data.get("voie"),
            complement=addr_data.get("complement"),
            code_postal=addr_data.get("code_postal"),
            commune=addr_data.get("commune"),
            pays=addr_data.get("pays", "France"),
        )
        etab = Etablissement(
            siret=e["siret"],
            nic=e["nic"] or "",
            siege=e["is_siege"],
            etat="A",
            activite_principale=e["activite_principale"],
            date_creation=etab_raw.get("date_debut"),
            adresse=adresse,
        )
        etabs_actifs.append(etab)
        if e["is_siege"]:
            siege_etab = etab

    nat_jur = c["legal_form_code"]
    conventions, est_ess, est_association, est_qualiopi = _extract_complements(raw)

    return CompanyDetails(
        siren=siren,
        denomination=c["denomination"],
        nom_complet=raw.get("nom_complet"),
        sigle=c["sigle"],
        activite_principale=c["ape_code"],
        section_activite_principale=raw.get("section_activite_principale"),
        categorie_juridique=nat_jur,
        categorie_juridique_libelle=c["legal_form"] or LEGAL_FORM.get(nat_jur or ""),
        date_creation=c["creation_date"],
        etat="Actif",
        tva_intracom=compute_tva_intracom(siren),
        tranche_effectifs=effectifs_code,
        tranche_effectifs_libelle=EFFECTIFS.get(effectifs_code or ""),
        tranche_effectifs_annee=str(effectifs_annee) if effectifs_annee else None,
        categorie_entreprise=raw.get("categorie_entreprise"),
        caractere_employeur=raw.get("caractere_employeur"),
        nombre_etablissements=raw.get("nombre_etablissements_ouverts"),
        dirigeants=_extract_dirigeants(raw),
        finances=_extract_finances(raw),
        conventions_collectives=conventions,
        est_ess=est_ess,
        est_association=est_association,
        est_qualiopi=est_qualiopi,
        date_mise_a_jour=raw.get("date_mise_a_jour"),
        siege=siege_etab,
        etablissements_actifs=etabs_actifs,
        nombre_etablissements_actifs=len(etabs_actifs),
    )


async def _save_to_cache(siren: str, item: dict, matching: list[dict], db: AsyncSession) -> None:
    """Persiste une entreprise et ses établissements dans le cache local."""
    now = datetime.now(timezone.utc)
    siege = item.get("siege") or {}
    siege_siret = siege.get("siret") if siege else None
    company_status = "active" if item.get("etat_administratif") == "A" else "closed"

    # Préparer raw_data (exclure matching_etablissements pour éviter la redondance)
    raw_company = {k: v for k, v in item.items() if k != "matching_etablissements"}

    # UPSERT company
    await db.execute(
        text("""
            INSERT INTO companies (siren, denomination, sigle, legal_form_code,
                legal_form, vat_number, ape_code, status, creation_date,
                raw_data, last_synced_at, created_at, updated_at)
            VALUES (:siren, :denom, :sigle, :lfc, :lf, :vat, :ape, :status,
                    :cdate, CAST(:raw AS jsonb), :now, now(), now())
            ON CONFLICT (siren) DO UPDATE SET
                denomination = EXCLUDED.denomination,
                sigle = EXCLUDED.sigle,
                legal_form_code = EXCLUDED.legal_form_code,
                legal_form = EXCLUDED.legal_form,
                ape_code = EXCLUDED.ape_code,
                status = EXCLUDED.status,
                raw_data = EXCLUDED.raw_data,
                last_synced_at = EXCLUDED.last_synced_at,
                updated_at = now()
        """),
        {
            "siren": siren,
            "denom": item.get("nom_raison_sociale") or item.get("nom_complet"),
            "sigle": item.get("sigle"),
            "lfc": item.get("nature_juridique"),
            "lf": LEGAL_FORM.get(item.get("nature_juridique") or ""),
            "vat": None,
            "ape": item.get("activite_principale"),
            "status": company_status,
            "cdate": _parse_date(item.get("date_creation")),
            "raw": json.dumps(raw_company),
            "now": now,
        },
    )

    # Collecter tous les établissements (siège + matching)
    etabs_to_upsert: list[dict] = []
    sirets_seen: set[str] = set()

    if siege and siege_siret:
        etabs_to_upsert.append({
            "siret": siege_siret,
            "siren": siren,
            "nic": siege_siret[-5:] if len(siege_siret) >= 5 else None,
            "is_siege": True,
            "status": "active" if siege.get("etat_administratif", "A") == "A" else "closed",
            "address": json.dumps(_build_address_from_siege(siege).model_dump()),
            "activite_principale": siege.get("activite_principale"),
            "raw": json.dumps(siege),
        })
        sirets_seen.add(siege_siret)

    for etab in matching:
        siret = etab.get("siret", "")
        if not siret or siret in sirets_seen:
            continue
        sirets_seen.add(siret)
        etabs_to_upsert.append({
            "siret": siret,
            "siren": siren,
            "nic": siret[-5:] if len(siret) >= 5 else None,
            "is_siege": siret == siege_siret,
            "status": "active" if etab.get("etat_administratif", "A") == "A" else "closed",
            "address": json.dumps(_build_address_from_siege(etab).model_dump()),
            "activite_principale": etab.get("activite_principale"),
            "raw": json.dumps(etab),
        })

    for e in etabs_to_upsert:
        await db.execute(
            text("""
                INSERT INTO establishments (siret, siren, nic, is_siege, status,
                    address, activite_principale, raw_data, last_synced_at,
                    created_at, updated_at)
                VALUES (:siret, :siren, :nic, :is_siege, :status,
                        CAST(:address AS jsonb), :ape, CAST(:raw AS jsonb),
                        :now, now(), now())
                ON CONFLICT (siret) DO UPDATE SET
                    siren = EXCLUDED.siren, nic = EXCLUDED.nic,
                    is_siege = EXCLUDED.is_siege, status = EXCLUDED.status,
                    address = EXCLUDED.address, activite_principale = EXCLUDED.activite_principale,
                    raw_data = EXCLUDED.raw_data,
                    last_synced_at = EXCLUDED.last_synced_at, updated_at = now()
            """),
            {**e, "ape": e["activite_principale"], "now": now},
        )

    # Fermer les établissements absents de la liste fraîche
    # (disparus de l'API = probablement fermés ou radiés)
    if sirets_seen:
        await db.execute(
            text("""
                UPDATE establishments
                SET status = 'closed', updated_at = now()
                WHERE siren = :siren
                  AND status = 'active'
                  AND siret != ALL(:sirets)
            """),
            {"siren": siren, "sirets": list(sirets_seen)},
        )

    await db.commit()


async def _fetch_details_from_api(siren: str) -> tuple[dict, list[dict]] | None:
    """Appelle l'API et retourne (item, matching_etablissements) ou None.

    Gère le fallback par nom quand matching_etablissements est vide.
    """
    results = await _fetch_companies(siren, per_page=1)
    if not results:
        return None

    item = results[0]
    if item.get("etat_administratif") != "A":
        return None

    matching: list[dict] = item.get("matching_etablissements") or []
    nb_ouverts = item.get("nombre_etablissements_ouverts", 0)
    nom = item.get("nom_raison_sociale") or item.get("nom_complet") or ""

    # Fallback par nom si matching_etablissements vide
    if not matching and nb_ouverts > 1 and nom:
        try:
            results_by_name = await _fetch_companies(nom, per_page=5)
            for candidate in results_by_name:
                if candidate.get("siren") == item.get("siren", siren):
                    matching = candidate.get("matching_etablissements") or []
                    break
        except Exception:
            pass

    return item, matching


def _build_details_from_api(siren: str, item: dict, matching: list[dict]) -> CompanyDetails:
    """Construit un CompanyDetails depuis les données brutes de l'API."""
    siege = item.get("siege") or {}
    nat_jur = item.get("nature_juridique") or None
    effectifs_code = item.get("tranche_effectif_salarie") or None
    siege_siret = siege.get("siret") if siege else None
    nom = item.get("nom_raison_sociale") or item.get("nom_complet") or ""
    nb_ouverts = item.get("nombre_etablissements_ouverts", 0)

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

    etabs_actifs: list[Etablissement] = []
    sirets_seen: set[str] = set()

    if siege_etab:
        etabs_actifs.append(siege_etab)
        if siege_siret:
            sirets_seen.add(siege_siret)

    for etab in matching:
        if etab.get("etat_administratif") != "A":
            continue
        siret = etab.get("siret", "")
        if siret and siret in sirets_seen:
            continue
        sirets_seen.add(siret)
        etabs_actifs.append(_matching_etab_to_etablissement(etab, siege_siret))

    effectifs_annee = item.get("annee_tranche_effectif_salarie")
    conventions, est_ess, est_association, est_qualiopi = _extract_complements(item)

    return CompanyDetails(
        siren=item.get("siren", siren),
        denomination=nom,
        nom_complet=item.get("nom_complet"),
        sigle=item.get("sigle"),
        activite_principale=item.get("activite_principale"),
        section_activite_principale=item.get("section_activite_principale"),
        categorie_juridique=nat_jur,
        categorie_juridique_libelle=LEGAL_FORM.get(nat_jur or "") or None,
        date_creation=item.get("date_creation"),
        etat="Actif",
        tva_intracom=compute_tva_intracom(siren),
        tranche_effectifs=effectifs_code,
        tranche_effectifs_libelle=EFFECTIFS.get(effectifs_code or ""),
        tranche_effectifs_annee=str(effectifs_annee) if effectifs_annee else None,
        categorie_entreprise=item.get("categorie_entreprise"),
        caractere_employeur=item.get("caractere_employeur"),
        nombre_etablissements=nb_ouverts,
        dirigeants=_extract_dirigeants(item),
        finances=_extract_finances(item),
        conventions_collectives=conventions,
        est_ess=est_ess,
        est_association=est_association,
        est_qualiopi=est_qualiopi,
        date_mise_a_jour=item.get("date_mise_a_jour"),
        siege=siege_etab,
        etablissements_actifs=etabs_actifs,
        nombre_etablissements_actifs=nb_ouverts,
    )


def _enrich_with_inpi(details: CompanyDetails, inpi: InpiCompanyData) -> CompanyDetails:
    """Enrichit un CompanyDetails avec les données INPI."""
    details.capital = inpi.capital
    details.devise_capital = inpi.devise_capital
    details.capital_variable = inpi.capital_variable
    details.objet_social = inpi.objet_social
    details.duree_societe = inpi.duree_societe
    details.date_cloture_exercice = inpi.date_cloture_exercice
    details.date_immatriculation_rcs = inpi.date_immatriculation_rcs
    # Compléter est_ess si absent de data.gouv
    if details.est_ess is None and inpi.est_ess is not None:
        details.est_ess = inpi.est_ess
    return details


async def get_company_details(siren: str, db: AsyncSession | None = None) -> CompanyDetails | None:
    """Retourne les détails d'une entreprise active via son SIREN.

    Lazy caching : si une session DB est fournie, vérifie le cache local d'abord.
    Si les données ont moins de 24h, retourne le cache sans appel API.
    Sinon, appelle l'API, met à jour le cache, et retourne le résultat.

    Si les identifiants INPI sont configurés, enrichit avec capital, objet social, etc.
    """
    # 1. Vérifier le cache local si DB disponible
    if db is not None:
        try:
            cached = await _load_from_cache(siren, db)
            if cached is not None:
                _log.debug("[companies] Cache hit pour SIREN %s", siren)
                # Enrichir avec INPI même si cache hit (données INPI pas cachées)
                try:
                    inpi_data = await get_inpi_data(siren, db)
                    if inpi_data:
                        _enrich_with_inpi(cached, inpi_data)
                except Exception:
                    _log.debug("[companies] Enrichissement INPI ignoré pour %s (cache)", siren)
                return cached
        except Exception:
            _log.warning("[companies] Erreur lecture cache pour %s, fallback API", siren)

    # 2. Appel API
    result = await _fetch_details_from_api(siren)
    if result is None:
        return None

    item, matching = result

    # 3. Sauvegarder dans le cache
    if db is not None:
        try:
            await _save_to_cache(siren, item, matching, db)
            _log.debug("[companies] Cache mis à jour pour SIREN %s", siren)
        except Exception:
            _log.warning("[companies] Erreur écriture cache pour %s", siren, exc_info=True)

    details = _build_details_from_api(siren, item, matching)

    # 4. Enrichir avec les données INPI
    if db is not None:
        try:
            inpi_data = await get_inpi_data(siren, db)
            if inpi_data:
                _enrich_with_inpi(details, inpi_data)
        except Exception:
            _log.debug("[companies] Enrichissement INPI ignoré pour %s", siren)

    return details


# ── Intégration VIES — TVA européenne (hors France) ──────────────────────────

VIES_BASE = "https://ec.europa.eu/taxation_customs/vies/rest-api"

EU_MEMBER_STATES: set[str] = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
    "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK",
    "XI",  # Irlande du Nord — couverte par VIES post-Brexit
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


# ── Enrichissement des organisations ─────────────────────────────────────────


async def _enrich_org_row(
    org_id: str,
    siren: str,
    manual: list,
    inpi_token: str | None,
    db: AsyncSession,
) -> bool:
    """Enrichit une organisation depuis data.gouv + INPI.

    Retourne True si au moins un champ a été mis à jour, False sinon.
    """
    from .inpi import _fetch_company_inpi, _extract_inpi_data

    updates: dict[str, str] = {}
    params: dict = {"org_id": org_id}

    # ── 1. data.gouv — SIRET siège, TVA, adresse, etc. ────────────
    api_result = await _fetch_details_from_api(siren)
    if api_result is not None:
        item, matching = api_result
        siege = item.get("siege") or {}
        siege_siret = siege.get("siret")
        nat_jur = item.get("nature_juridique") or ""
        nom = item.get("nom_raison_sociale") or item.get("nom_complet") or ""

        # SIRET siège
        if siege_siret and "siret" not in manual:
            updates["siret"] = "siret = :siret"
            params["siret"] = siege_siret

        # TVA intracommunautaire
        if "vat_number" not in manual:
            updates["vat_number"] = "vat_number = :vat_number"
            params["vat_number"] = compute_tva_intracom(siren)

        # Nom
        if nom and "name" not in manual:
            updates["name"] = "name = :name"
            params["name"] = nom

        # Forme juridique
        if nat_jur and "legal_form" not in manual:
            label = LEGAL_FORM.get(nat_jur, nat_jur)
            updates["legal_form"] = "legal_form = :legal_form"
            params["legal_form"] = label

        # Code APE
        ape = item.get("activite_principale")
        if ape and "ape_code" not in manual:
            updates["ape_code"] = "ape_code = :ape_code"
            params["ape_code"] = ape

        # Adresse siège
        if siege and "address" not in manual:
            addr = _build_address_from_siege(siege)
            updates["address"] = "address = CAST(:address AS jsonb)"
            params["address"] = json.dumps({
                "voie": addr.voie,
                "complement": addr.complement,
                "code_postal": addr.code_postal,
                "commune": addr.commune,
                "pays": addr.pays,
            })

        # Sauvegarder dans le cache SIRENE
        try:
            await _save_to_cache(siren, item, matching, db)
        except Exception:
            pass

    # ── 2. INPI — capital, objet social, dates ────────────────────
    if inpi_token is not None:
        raw = await _fetch_company_inpi(siren, inpi_token)
        if raw is not None:
            inpi = _extract_inpi_data(raw)

            if inpi.capital is not None and "capital" not in manual:
                updates["capital"] = "capital = :capital"
                params["capital"] = inpi.capital

            if inpi.capital_variable is not None and "capital_variable" not in manual:
                updates["capital_variable"] = "capital_variable = :capital_variable"
                params["capital_variable"] = inpi.capital_variable

            if inpi.objet_social and "objet_social" not in manual:
                updates["objet_social"] = "objet_social = :objet_social"
                params["objet_social"] = inpi.objet_social

            if inpi.date_cloture_exercice and "date_cloture_exercice" not in manual:
                updates["date_cloture_exercice"] = "date_cloture_exercice = :date_cloture_exercice"
                params["date_cloture_exercice"] = inpi.date_cloture_exercice

            if inpi.date_immatriculation_rcs and "date_immatriculation_rcs" not in manual:
                updates["date_immatriculation_rcs"] = "date_immatriculation_rcs = :date_immatriculation_rcs"
                params["date_immatriculation_rcs"] = inpi.date_immatriculation_rcs

    # ── 3. Appliquer les updates ──────────────────────────────────
    # Toujours mettre à jour last_enriched_at même si aucun champ n'a changé
    set_clause = ", ".join(updates.values()) if updates else ""
    if set_clause:
        set_clause += ", "
    set_clause += "last_enriched_at = NOW(), updated_at = NOW()"
    await db.execute(
        text(f"UPDATE organizations SET {set_clause} WHERE id = :org_id"),
        params,
    )

    _log.debug("[enrich] Org %s (SIREN %s) → %d champs mis à jour", org_id, siren, len(updates))
    return len(updates) > 0


async def enrich_single_org(org_id: str, db: AsyncSession) -> bool:
    """Enrichit une seule organisation depuis data.gouv + INPI.

    Retourne True si des champs ont été mis à jour.
    """
    from .inpi import _authenticate, _get_inpi_credentials

    # Récupérer le SIREN et manual_fields de l'org
    result = await db.execute(
        text("SELECT siren, manual_fields FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )
    row = result.fetchone()
    if row is None or not row[0] or len(row[0].strip()) != 9:
        return False

    siren = row[0].strip()
    manual: list = row[1] if isinstance(row[1], list) else []

    # Préparer l'auth INPI (optionnel)
    inpi_token: str | None = None
    creds = await _get_inpi_credentials(db)
    if creds is not None:
        username, password = creds
        inpi_token = await _authenticate(username, password)

    updated = await _enrich_org_row(org_id, siren, manual, inpi_token, db)
    await db.commit()
    return updated


async def enrich_all_orgs(db: AsyncSession) -> dict:
    """Enrichit toutes les organisations ayant un SIREN via data.gouv + INPI.

    Pour chaque organisation :
      - data.gouv : SIRET siège, TVA intracommunautaire, adresse, legal_form, ape_code, name
      - INPI (si credentials configurés) : capital, objet_social, date_cloture, date_immat RCS

    Ne touche pas aux champs listés dans manual_fields de chaque organisation.
    Retourne un résumé { enriched: int, skipped: int, errors: int }.
    """
    from .inpi import _authenticate, _fetch_company_inpi, _extract_inpi_data, _get_inpi_credentials

    # Préparer l'auth INPI (optionnel)
    inpi_token: str | None = None
    creds = await _get_inpi_credentials(db)
    if creds is not None:
        username, password = creds
        inpi_token = await _authenticate(username, password)
        if inpi_token is None:
            _log.warning("[enrich] Auth INPI échouée — enrichissement INPI ignoré")

    # Récupérer toutes les orgs avec un SIREN
    result = await db.execute(
        text("""
            SELECT id, siren, manual_fields
            FROM organizations
            WHERE siren IS NOT NULL AND LENGTH(TRIM(siren)) = 9
        """)
    )
    rows = result.fetchall()
    _log.info("[enrich] %d organisations à enrichir", len(rows))

    enriched = 0
    skipped = 0
    errors = 0

    for row in rows:
        org_id, siren, manual_fields_raw = row
        siren = siren.strip()
        manual: list = manual_fields_raw if isinstance(manual_fields_raw, list) else []

        try:
            updated = await _enrich_org_row(org_id, siren, manual, inpi_token, db)
            if updated:
                enriched += 1
            else:
                skipped += 1
        except Exception as exc:
            _log.warning("[enrich] Erreur pour SIREN %s : %s", siren, exc)
            errors += 1

    await db.commit()
    _log.info("[enrich] Terminé : enriched=%d, skipped=%d, errors=%d", enriched, skipped, errors)
    return {"enriched": enriched, "skipped": skipped, "errors": errors}
