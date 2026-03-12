# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Tâche Celery — Synchronisation nocturne du cache SIRENE.

Exécutée chaque nuit à 2h00 (Europe/Paris) via Celery Beat.

Principe :
  1. Récupère la liste des SIREN uniques présents dans :
       - organizations.siren
       - clients.company_siren  (+ extraits des sirets clients si company_siren null)
       - suppliers.company_siren
  2. Pour chaque SIREN, appelle l'API recherche-entreprises.api.gouv.fr
  3. UPSERT dans companies + establishments
  4. Met à jour le statut (active/closed) des établissements

Règle métier :
  Si un établissement passe status='closed', les documents existants
  qui référencent ce billing_siret restent valides (données historiques)
  mais il ne peut plus être sélectionné pour de nouveaux documents.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx

from app.tasks.celery_app import celery

_log = logging.getLogger(__name__)

REC_ENT_BASE = "https://recherche-entreprises.api.gouv.fr"
_TIMEOUT = 15.0


# ── Sync d'un SIREN ─────────────────────────────────────────────────────────


async def _fetch_from_api(q: str, per_page: int = 1) -> list[dict]:
    """Appelle l'API recherche-entreprises avec retry."""
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
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        _log.warning("[sirene_sync] Erreur API pour q=%s : %s", q, exc)
        return []


async def _fetch_siren(siren: str) -> dict | None:
    """Récupère une entreprise par SIREN avec fallback par nom pour les établissements.

    L'API retourne matching_etablissements=[] lors d'une recherche par SIREN.
    Parade : si vide et >1 établissement, relancer par dénomination.
    """
    results = await _fetch_from_api(siren, per_page=1)
    if not results:
        return None

    item = results[0]
    matching = item.get("matching_etablissements") or []
    nb_ouverts = item.get("nombre_etablissements_ouverts", 0)
    nom = item.get("nom_raison_sociale") or item.get("nom_complet") or ""

    # Fallback par nom si matching_etablissements vide
    if not matching and nb_ouverts > 1 and nom:
        try:
            results_by_name = await _fetch_from_api(nom, per_page=5)
            for candidate in results_by_name:
                if candidate.get("siren") == siren:
                    item["matching_etablissements"] = (
                        candidate.get("matching_etablissements") or []
                    )
                    break
        except Exception:
            pass  # pas critique — on garde le siège seul

    return item


def _build_address(etab: dict) -> dict:
    """Construit le JSONB adresse depuis un dict établissement de l'API."""
    voie_parts = [p for p in [
        etab.get("numero_voie"),
        etab.get("indice_repetition"),
        etab.get("type_voie"),
        etab.get("libelle_voie"),
    ] if p]
    return {
        "voie": " ".join(voie_parts) or None,
        "complement": etab.get("complement_adresse") or None,
        "code_postal": etab.get("code_postal") or None,
        "commune": etab.get("libelle_commune") or None,
        "pays": "France",
    }


async def sync_siren_to_db(siren: str, db_url: str) -> bool:
    """Synchronise un SIREN dans le cache local (companies + establishments).

    Utilise asyncpg directement (pas SQLAlchemy) pour être utilisable depuis Celery.
    Retourne True si sync OK, False sinon.
    """
    import asyncpg  # type: ignore[import]

    item = await _fetch_siren(siren)
    if not item:
        _log.info("[sirene_sync] SIREN %s introuvable dans l'API", siren)
        return False

    now = datetime.now(timezone.utc)
    company_status = "active" if item.get("etat_administratif") == "A" else "closed"
    siege = item.get("siege") or {}
    siege_siret = siege.get("siret") if siege else None

    # Préparer les établissements depuis matching_etablissements + siège
    matching: list[dict] = item.get("matching_etablissements") or []
    etabs_data: list[dict] = []
    sirets_seen: set[str] = set()

    # Siège en premier
    if siege and siege_siret:
        etabs_data.append({
            "siret": siege_siret,
            "siren": siren,
            "nic": siege_siret[-5:] if len(siege_siret) >= 5 else None,
            "is_siege": True,
            "status": "active" if siege.get("etat_administratif", "A") == "A" else "closed",
            "address": json.dumps(_build_address(siege)),
            "activite_principale": siege.get("activite_principale"),
            "closure_date": None,
        })
        sirets_seen.add(siege_siret)

    # Autres établissements
    for etab in matching:
        siret = etab.get("siret", "")
        if not siret or siret in sirets_seen:
            continue
        sirets_seen.add(siret)
        etab_status = "active" if etab.get("etat_administratif", "A") == "A" else "closed"
        etabs_data.append({
            "siret": siret,
            "siren": siren,
            "nic": siret[-5:] if len(siret) >= 5 else None,
            "is_siege": siret == siege_siret,
            "status": etab_status,
            "address": json.dumps(_build_address(etab)),
            "activite_principale": etab.get("activite_principale"),
            "closure_date": None,
        })

    try:
        conn = await asyncpg.connect(db_url)
        try:
            async with conn.transaction():
                # UPSERT company
                await conn.execute(
                    """
                    INSERT INTO companies (siren, denomination, sigle, legal_form_code,
                        legal_form, vat_number, ape_code, status, last_synced_at,
                        created_at, updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
                    ON CONFLICT (siren) DO UPDATE SET
                        denomination=EXCLUDED.denomination,
                        sigle=EXCLUDED.sigle,
                        legal_form_code=EXCLUDED.legal_form_code,
                        legal_form=EXCLUDED.legal_form,
                        vat_number=EXCLUDED.vat_number,
                        ape_code=EXCLUDED.ape_code,
                        status=EXCLUDED.status,
                        last_synced_at=EXCLUDED.last_synced_at,
                        updated_at=now()
                    """,
                    siren,
                    item.get("nom_raison_sociale") or item.get("nom_complet"),
                    item.get("sigle"),
                    item.get("nature_juridique"),
                    # legal_form libellé — on reprend la map du service companies
                    _LEGAL_FORM.get(item.get("nature_juridique") or ""),
                    None,  # vat_number — non fourni par l'API
                    item.get("activite_principale"),
                    company_status,
                    now,
                )

                # UPSERT établissements
                for etab in etabs_data:
                    await conn.execute(
                        """
                        INSERT INTO establishments (siret, siren, nic, is_siege, status,
                            address, activite_principale, last_synced_at, created_at, updated_at)
                        VALUES ($1,$2,$3,$4,$5,CAST($6 AS jsonb),$7,$8,now(),now())
                        ON CONFLICT (siret) DO UPDATE SET
                            siren=EXCLUDED.siren,
                            nic=EXCLUDED.nic,
                            is_siege=EXCLUDED.is_siege,
                            status=EXCLUDED.status,
                            address=EXCLUDED.address,
                            activite_principale=EXCLUDED.activite_principale,
                            last_synced_at=EXCLUDED.last_synced_at,
                            updated_at=now()
                        """,
                        etab["siret"], etab["siren"], etab["nic"],
                        etab["is_siege"], etab["status"],
                        etab["address"], etab["activite_principale"], now,
                    )
        finally:
            await conn.close()

        _log.info(
            "[sirene_sync] SIREN %s sync OK — %s établissements",
            siren,
            len(etabs_data),
        )
        return True

    except Exception as exc:
        _log.error("[sirene_sync] Erreur BDD pour SIREN %s : %s", siren, exc)
        return False


# Libellés formes juridiques (copie depuis companies/service.py)
_LEGAL_FORM: dict[str, str] = {
    "1000": "Entrepreneur individuel",
    "5498": "EURL",
    "5499": "SARL",
    "5505": "SA",
    "5710": "SAS",
    "5720": "SASU",
    "6316": "SCI",
    "9220": "Association",
}


# ── Tâche Celery ─────────────────────────────────────────────────────────────


@celery.task(name="sirene.sync_all", bind=True, max_retries=3)  # type: ignore[misc]
def sync_all_companies_task(self: object) -> dict:  # type: ignore[override]
    """Synchronise le cache SIRENE pour toutes les organisations et clients connus.

    Planifiée par Celery Beat chaque nuit à 2h00 (Europe/Paris).
    Peut aussi être déclenchée manuellement via l'interface admin Celery.
    """
    from app.core.config import settings

    async def _run() -> dict:
        import asyncpg  # type: ignore[import]

        conn = await asyncpg.connect(settings.DATABASE_URL)
        try:
            # Collecter tous les SIREN uniques
            rows = await conn.fetch("""
                SELECT DISTINCT siren FROM (
                    SELECT siren FROM organizations WHERE siren IS NOT NULL
                    UNION
                    SELECT company_siren AS siren FROM clients WHERE company_siren IS NOT NULL
                    UNION
                    SELECT company_siren AS siren FROM suppliers WHERE company_siren IS NOT NULL
                ) t
            """)
            sirens = [r["siren"] for r in rows]
        finally:
            await conn.close()

        _log.info("[sirene_sync] %d SIREN(s) à synchroniser", len(sirens))

        ok_count = 0
        err_count = 0
        for siren in sirens:
            success = await sync_siren_to_db(siren, settings.DATABASE_URL)
            if success:
                ok_count += 1
            else:
                err_count += 1

        _log.info(
            "[sirene_sync] Terminé — %d OK / %d erreurs / %d total",
            ok_count,
            err_count,
            len(sirens),
        )
        return {"ok": ok_count, "errors": err_count, "total": len(sirens)}

    return asyncio.run(_run())
