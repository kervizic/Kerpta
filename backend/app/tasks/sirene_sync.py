# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Tâche Celery — Détection nocturne des fermetures SIRENE.

Exécutée chaque nuit à 2h00 (Europe/Paris) via Celery Beat.

Principe simplifié (lazy caching) :
  La mise à jour courante des données entreprises/établissements se fait
  directement dans FastAPI à chaque consultation (get_company_details).
  Si les données ont > 24h, l'API est appelée et le cache mis à jour.

  Ce job nocturne ne sert qu'à détecter les fermetures d'entreprises ou
  d'établissements qui ne sont plus consultés activement, afin de bloquer
  leur utilisation dans de nouveaux documents.

Principe :
  1. Récupère les SIREN présents dans companies dont last_synced_at > 7 jours
  2. Pour chaque, appelle l'API et met à jour le statut (active/closed)
  3. Ne touche PAS aux SIREN récemment synchronisés (< 7 jours = déjà frais)
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

# Ne re-synchroniser que les SIREN pas vus depuis > 7 jours
_STALE_DAYS = 7


async def _fetch_from_api(q: str, per_page: int = 1) -> list[dict]:
    """Appelle l'API recherche-entreprises."""
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


async def _fetch_siren(siren: str) -> dict | None:
    """Récupère une entreprise par SIREN avec fallback par nom pour les établissements."""
    results = await _fetch_from_api(siren, per_page=1)
    if not results:
        return None

    item = results[0]
    matching = item.get("matching_etablissements") or []
    nb_ouverts = item.get("nombre_etablissements_ouverts", 0)
    nom = item.get("nom_raison_sociale") or item.get("nom_complet") or ""

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
            pass

    return item


# Libellés formes juridiques (sous-ensemble)
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


async def sync_siren_to_db(siren: str, db_url: str) -> bool:
    """Synchronise un SIREN dans le cache local (companies + establishments).

    Utilisé par le job nocturne pour les SIREN périmés (> 7 jours).
    Utilise asyncpg directement (contexte Celery, pas FastAPI).
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

    matching: list[dict] = item.get("matching_etablissements") or []
    etabs_data: list[dict] = []
    sirets_seen: set[str] = set()

    if siege and siege_siret:
        etabs_data.append({
            "siret": siege_siret,
            "siren": siren,
            "nic": siege_siret[-5:] if len(siege_siret) >= 5 else None,
            "is_siege": True,
            "status": "active" if siege.get("etat_administratif", "A") == "A" else "closed",
            "address": json.dumps(_build_address(siege)),
            "activite_principale": siege.get("activite_principale"),
        })
        sirets_seen.add(siege_siret)

    for etab in matching:
        siret = etab.get("siret", "")
        if not siret or siret in sirets_seen:
            continue
        sirets_seen.add(siret)
        etabs_data.append({
            "siret": siret,
            "siren": siren,
            "nic": siret[-5:] if len(siret) >= 5 else None,
            "is_siege": siret == siege_siret,
            "status": "active" if etab.get("etat_administratif", "A") == "A" else "closed",
            "address": json.dumps(_build_address(etab)),
            "activite_principale": etab.get("activite_principale"),
        })

    try:
        conn = await asyncpg.connect(db_url)
        try:
            async with conn.transaction():
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
                        ape_code=EXCLUDED.ape_code,
                        status=EXCLUDED.status,
                        last_synced_at=EXCLUDED.last_synced_at,
                        updated_at=now()
                    """,
                    siren,
                    item.get("nom_raison_sociale") or item.get("nom_complet"),
                    item.get("sigle"),
                    item.get("nature_juridique"),
                    _LEGAL_FORM.get(item.get("nature_juridique") or ""),
                    None,
                    item.get("activite_principale"),
                    company_status,
                    now,
                )

                for etab in etabs_data:
                    await conn.execute(
                        """
                        INSERT INTO establishments (siret, siren, nic, is_siege, status,
                            address, activite_principale, last_synced_at, created_at, updated_at)
                        VALUES ($1,$2,$3,$4,$5,CAST($6 AS jsonb),$7,$8,now(),now())
                        ON CONFLICT (siret) DO UPDATE SET
                            siren=EXCLUDED.siren, nic=EXCLUDED.nic,
                            is_siege=EXCLUDED.is_siege, status=EXCLUDED.status,
                            address=EXCLUDED.address, activite_principale=EXCLUDED.activite_principale,
                            last_synced_at=EXCLUDED.last_synced_at, updated_at=now()
                        """,
                        etab["siret"], etab["siren"], etab["nic"],
                        etab["is_siege"], etab["status"],
                        etab["address"], etab["activite_principale"], now,
                    )
        finally:
            await conn.close()

        _log.info("[sirene_sync] SIREN %s sync OK — %s établissements", siren, len(etabs_data))
        return True

    except Exception as exc:
        _log.error("[sirene_sync] Erreur BDD pour SIREN %s : %s", siren, exc)
        return False


# ── Tâche Celery ─────────────────────────────────────────────────────────────


@celery.task(name="sirene.sync_stale", bind=True, max_retries=3)  # type: ignore[misc]
def sync_stale_companies_task(self: object) -> dict:  # type: ignore[override]
    """Synchronise uniquement les SIREN périmés (> 7 jours sans mise à jour).

    Les SIREN consultés récemment sont déjà à jour grâce au lazy caching
    dans get_company_details(). Ce job ne traite que les SIREN « dormants »
    pour détecter les fermetures d'entreprises ou d'établissements.

    Planifiée par Celery Beat chaque nuit à 2h00 (Europe/Paris).
    """
    from app.core.config import settings

    async def _run() -> dict:
        import asyncpg  # type: ignore[import]

        conn = await asyncpg.connect(settings.DATABASE_URL)
        try:
            rows = await conn.fetch("""
                SELECT siren FROM companies
                WHERE last_synced_at < now() - interval '%s days'
                  AND status = 'active'
                ORDER BY last_synced_at ASC
            """ % _STALE_DAYS)
            sirens = [r["siren"] for r in rows]
        finally:
            await conn.close()

        if not sirens:
            _log.info("[sirene_sync] Aucun SIREN périmé à synchroniser")
            return {"ok": 0, "errors": 0, "total": 0}

        _log.info("[sirene_sync] %d SIREN(s) périmé(s) à synchroniser", len(sirens))

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
            ok_count, err_count, len(sirens),
        )
        return {"ok": ok_count, "errors": err_count, "total": len(sirens)}

    return asyncio.run(_run())
