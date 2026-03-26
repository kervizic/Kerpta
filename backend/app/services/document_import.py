# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service d'import de documents via staging IA.

Workflow :
1. extract-document -> create_import (status=pending)
2. L'utilisateur corrige le JSON dans le frontend
3. validate_import (cree le document) ou reject_import

Les fonctions internes import_as_quote/invoice/order restent disponibles
pour la creation effective depuis validate_import.
"""

import json
import logging
import uuid
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _safe_decimal(value, default: str = "0") -> Decimal:
    """Convertit une valeur en Decimal de maniere securisee."""
    if value is None:
        return Decimal(default)
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _safe_date(value) -> date | None:
    """Convertit une date string YYYY-MM-DD en date."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _calc_line(qty: Decimal, price: Decimal, vat_rate: Decimal) -> dict:
    """Calcule total_ht et total_vat d'une ligne importee."""
    total_ht = (qty * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total_vat = (total_ht * vat_rate / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return {"total_ht": total_ht, "total_vat": total_vat}


def _extract_lines(data: dict) -> list[dict]:
    """Extrait et normalise les lignes depuis le JSON Factur-X.

    Supporte le champ 'lignes' (format Factur-X original) et 'lines' (format frontend).
    """
    raw_lines = data.get("lignes") or data.get("lines") or []
    _log.info("_extract_lines: %d lignes trouvees (cles dispo: %s)", len(raw_lines), list(data.keys()))
    lines = []
    for i, ln in enumerate(raw_lines):
        qty = _safe_decimal(ln.get("quantite") or ln.get("quantity"), "1")
        if qty <= 0:
            qty = Decimal("1")
        price = _safe_decimal(ln.get("prix_unitaire_ht") or ln.get("unit_price"), "0")
        vat_rate = _safe_decimal(ln.get("taux_tva") or ln.get("vat_rate"), "0")
        # Limiter le taux TVA a 20% max (coherent avec les schemas existants)
        if vat_rate > Decimal("20"):
            vat_rate = Decimal("20")
        calc = _calc_line(qty, price, vat_rate)

        lines.append({
            "position": i,
            "reference": ln.get("reference"),
            "description": ln.get("designation") or ln.get("description"),
            "quantity": qty,
            "unit": ln.get("unite") or ln.get("unit"),
            "unit_price": price,
            "vat_rate": vat_rate,
            "discount_percent": Decimal("0"),
            "total_ht": calc["total_ht"],
            "total_vat": calc["total_vat"],
        })
    return lines


def _build_notes(data: dict, source_filename: str | None = None) -> str:
    """Construit les notes a partir des infos supplementaires du document."""
    parts = []

    # Numero d'origine
    doc = data.get("document") or {}
    if doc.get("numero"):
        parts.append(f"Document original : {doc['numero']}")
    if doc.get("reference"):
        parts.append(f"Reference : {doc['reference']}")
    if doc.get("numero_commande"):
        parts.append(f"N- commande : {doc['numero_commande']}")

    # IBAN
    paiement = data.get("paiement") or {}
    if paiement.get("iban"):
        parts.append(f"IBAN : {paiement['iban']}")
    if paiement.get("mode"):
        parts.append(f"Mode de paiement : {paiement['mode']}")

    # Fichier source
    if source_filename:
        parts.append(f"Fichier source : {source_filename}")

    return "\n".join(parts) if parts else ""


async def suggest_client(
    org_id: uuid.UUID, name: str, db: AsyncSession
) -> dict | None:
    """Cherche un client par nom (fuzzy) pour pre-selection dans le frontend."""
    if not name:
        return None
    result = await db.execute(
        text("""
            SELECT id::text, name FROM clients
            WHERE organization_id = :org_id
              AND (LOWER(name) = LOWER(:name) OR LOWER(name) LIKE LOWER(:pattern))
            ORDER BY CASE WHEN LOWER(name) = LOWER(:name) THEN 0 ELSE 1 END
            LIMIT 1
        """),
        {"org_id": str(org_id), "name": name, "pattern": f"%{name}%"},
    )
    row = result.mappings().first()
    if row:
        return {"id": row["id"], "name": row["name"]}
    return None


async def _resolve_client_id(
    org_id: uuid.UUID, client_id: str | None, suggested_name: str | None, db: AsyncSession
) -> str | None:
    """Resout le client_id fourni par l'utilisateur.

    - Si client_id est fourni et valide -> l'utiliser
    - Si client_id est None mais suggested_name est trouve -> utiliser le suggested
    - Si rien n'est trouve -> retourner None (brouillon sans client)
    """
    if client_id:
        # Verifier que le client existe dans l'org
        result = await db.execute(
            text("SELECT id::text FROM clients WHERE id = :cid AND organization_id = :org_id"),
            {"cid": client_id, "org_id": str(org_id)},
        )
        if result.fetchone():
            return client_id
        raise HTTPException(404, "Client introuvable")

    # Tenter un auto-match par nom
    if suggested_name:
        suggested = await suggest_client(org_id, suggested_name, db)
        if suggested:
            _log.info("Client auto-matche par nom '%s' -> %s", suggested_name, suggested["id"])
            return suggested["id"]

    _log.info("Aucun client trouve (suggested_name=%s) - brouillon sans client", suggested_name)
    return None


async def _insert_lines(
    table: str, parent_col: str, parent_id: str, lines: list[dict], db: AsyncSession
) -> None:
    """Insere les lignes dans la table appropriee (quote_lines, invoice_lines, order_lines)."""
    # Colonnes supplementaires pour invoice_lines
    has_account_code = table == "invoice_lines"

    for line in lines:
        line_id = uuid.uuid4()
        cols = """id, {parent_col}, position, reference, description,
                  quantity, unit, unit_price, vat_rate, discount_percent,
                  total_ht, total_vat""".format(parent_col=parent_col)
        vals = """:lid, :pid, :pos, :ref, :desc,
                  :qty, :unit, :price, :vat_rate, :disc,
                  :ht, :vat_amt"""
        params = {
            "lid": str(line_id),
            "pid": parent_id,
            "pos": line["position"],
            "ref": line.get("reference"),
            "desc": line.get("description"),
            "qty": str(line["quantity"]),
            "unit": line.get("unit"),
            "price": str(line["unit_price"]),
            "vat_rate": str(line["vat_rate"]),
            "disc": str(line["discount_percent"]),
            "ht": str(line["total_ht"]),
            "vat_amt": str(line["total_vat"]),
        }

        if has_account_code:
            cols += ", account_code"
            vals += ", :acct"
            params["acct"] = None

        await db.execute(
            text(f"INSERT INTO {table} ({cols}) VALUES ({vals})"),
            params,
        )


# ── Populate structured fields ───────────────────────────────────────────────


async def _populate_structured_fields(
    import_id: uuid.UUID,
    extracted_json: dict,
    db: AsyncSession,
) -> None:
    """Parse le JSON Factur-X et remplit les colonnes structurees + lignes.

    Les colonnes structurees sont EN PLUS du JSON, pas a la place.
    """
    parties = extracted_json.get("parties") or {}

    # Emetteur
    emetteur = parties.get("emetteur") or {}
    emetteur_identifiants = emetteur.get("identifiants") or {}
    emetteur_adresse = emetteur.get("adresse") or {}

    # Destinataire
    destinataire = parties.get("destinataire") or {}
    dest_identifiants = destinataire.get("identifiants") or {}
    dest_adresse = destinataire.get("adresse") or {}

    doc = extracted_json.get("document") or {}
    meta = extracted_json.get("meta") or {}
    totaux = extracted_json.get("totaux") or {}
    paiement = extracted_json.get("paiement") or {}

    # Construire l'adresse complete de l'emetteur
    em_addr_parts = [
        emetteur_adresse.get("rue"),
        emetteur_adresse.get("code_postal") or emetteur_adresse.get("cp"),
        emetteur_adresse.get("ville"),
    ]
    emetteur_address = " ".join(p for p in em_addr_parts if p) or None

    # Construire l'adresse complete du destinataire
    dest_addr_parts = [
        dest_adresse.get("rue"),
        dest_adresse.get("code_postal") or dest_adresse.get("cp"),
        dest_adresse.get("ville"),
    ]
    destinataire_address = " ".join(p for p in dest_addr_parts if p) or None

    # Mettre a jour les colonnes structurees sur document_imports
    await db.execute(
        text("""
            UPDATE document_imports SET
                extracted_emetteur_name = :emetteur_name,
                extracted_emetteur_siret = :emetteur_siret,
                extracted_emetteur_siren = :emetteur_siren,
                extracted_emetteur_tva = :emetteur_tva,
                extracted_emetteur_address = :emetteur_address,
                extracted_destinataire_name = :dest_name,
                extracted_destinataire_siret = :dest_siret,
                extracted_destinataire_siren = :dest_siren,
                extracted_destinataire_tva = :dest_tva,
                extracted_destinataire_address = :dest_address,
                extracted_doc_number = :doc_number,
                extracted_doc_date = :doc_date,
                extracted_doc_due_date = :doc_due_date,
                extracted_doc_type = :doc_type,
                extracted_total_ht = :total_ht,
                extracted_total_tva = :total_tva,
                extracted_total_ttc = :total_ttc,
                extracted_iban = :iban,
                extracted_payment_mode = :payment_mode,
                extracted_currency = :currency,
                extracted_reference = :reference,
                extracted_order_number = :order_number
            WHERE id = :import_id
        """),
        {
            "import_id": str(import_id),
            "emetteur_name": emetteur.get("designation"),
            "emetteur_siret": emetteur_identifiants.get("siret"),
            "emetteur_siren": emetteur_identifiants.get("siren"),
            "emetteur_tva": emetteur_identifiants.get("tva"),
            "emetteur_address": emetteur_address,
            "dest_name": destinataire.get("designation"),
            "dest_siret": dest_identifiants.get("siret"),
            "dest_siren": dest_identifiants.get("siren"),
            "dest_tva": dest_identifiants.get("tva"),
            "dest_address": destinataire_address,
            "doc_number": doc.get("numero"),
            "doc_date": _safe_date(doc.get("date_emission")),
            "doc_due_date": _safe_date(doc.get("date_echeance")),
            "doc_type": meta.get("type_document"),
            "total_ht": str(_safe_decimal(totaux.get("total_ht"))) if totaux.get("total_ht") is not None else None,
            "total_tva": str(_safe_decimal(totaux.get("total_tva"))) if totaux.get("total_tva") is not None else None,
            "total_ttc": str(_safe_decimal(totaux.get("total_ttc"))) if totaux.get("total_ttc") is not None else None,
            "iban": paiement.get("iban"),
            "payment_mode": paiement.get("mode"),
            "currency": meta.get("devise"),
            "reference": doc.get("reference"),
            "order_number": doc.get("numero_commande"),
        },
    )

    # Inserer les lignes dans document_import_lines
    raw_lines = extracted_json.get("lignes") or extracted_json.get("lines") or []
    for i, ln in enumerate(raw_lines):
        qty = _safe_decimal(ln.get("quantite") or ln.get("quantity"))
        price = _safe_decimal(ln.get("prix_unitaire_ht") or ln.get("unit_price"))
        vat_rate = _safe_decimal(ln.get("taux_tva") or ln.get("vat_rate"))
        total_ht = _safe_decimal(ln.get("total_ht"))
        total_ttc = _safe_decimal(ln.get("total_ttc"))

        await db.execute(
            text("""
                INSERT INTO document_import_lines
                    (import_id, position, extracted_reference,
                     extracted_designation, extracted_description,
                     extracted_quantity, extracted_unit,
                     extracted_unit_price, extracted_vat_rate,
                     extracted_total_ht, extracted_total_ttc)
                VALUES
                    (:import_id, :pos, :ref,
                     :designation, :description,
                     :qty, :unit,
                     :price, :vat_rate,
                     :total_ht, :total_ttc)
            """),
            {
                "import_id": str(import_id),
                "pos": i,
                "ref": ln.get("reference"),
                "designation": ln.get("designation"),
                "description": ln.get("description"),
                "qty": str(qty) if ln.get("quantite") or ln.get("quantity") else None,
                "unit": ln.get("unite") or ln.get("unit"),
                "price": str(price) if ln.get("prix_unitaire_ht") or ln.get("unit_price") else None,
                "vat_rate": str(vat_rate) if ln.get("taux_tva") or ln.get("vat_rate") else None,
                "total_ht": str(total_ht) if ln.get("total_ht") else None,
                "total_ttc": str(total_ttc) if ln.get("total_ttc") else None,
            },
        )

    _log.info(
        "_populate_structured_fields: %s - %d lignes inserees",
        import_id, len(raw_lines),
    )


async def _auto_match_client(
    org_id: uuid.UUID,
    import_id: uuid.UUID,
    extracted_json: dict,
    db: AsyncSession,
) -> str | None:
    """Auto-match du client par SIRET exact puis par nom fuzzy.

    Stocke le client_id matche dans document_imports.client_id.
    """
    parties = extracted_json.get("parties") or {}
    # Le CLIENT est le DESTINATAIRE (pas l'emetteur)
    destinataire = parties.get("destinataire") or {}
    dest_identifiants = destinataire.get("identifiants") or {}

    client_id = None

    # 1. Chercher par SIRET exact (14 chiffres)
    siret = dest_identifiants.get("siret")
    if siret:
        result = await db.execute(
            text("SELECT id::text FROM clients WHERE organization_id = :org_id AND siret = :siret LIMIT 1"),
            {"org_id": str(org_id), "siret": siret},
        )
        row = result.fetchone()
        if row:
            client_id = row[0]
            _log.info("Client auto-matche par SIRET '%s' -> %s", siret, client_id)

    # 2. Sinon par SIREN (9 chiffres) - cherche les clients dont le SIRET commence par ce SIREN
    if not client_id:
        siren = dest_identifiants.get("siren")
        if siren:
            result = await db.execute(
                text("SELECT id::text FROM clients WHERE organization_id = :org_id AND (siret LIKE :pattern OR siren = :siren) LIMIT 1"),
                {"org_id": str(org_id), "pattern": f"{siren}%", "siren": siren},
            )
            row = result.fetchone()
            if row:
                client_id = row[0]
                _log.info("Client auto-matche par SIREN '%s' -> %s", siren, client_id)

    # 3. Sinon par N. TVA intracommunautaire
    if not client_id:
        tva = dest_identifiants.get("tva")
        if tva:
            result = await db.execute(
                text("SELECT id::text FROM clients WHERE organization_id = :org_id AND vat_number = :tva LIMIT 1"),
                {"org_id": str(org_id), "tva": tva},
            )
            row = result.fetchone()
            if row:
                client_id = row[0]
                _log.info("Client auto-matche par TVA '%s' -> %s", tva, client_id)

    # 4. Sinon par nom (fuzzy)
    if not client_id:
        client_name = destinataire.get("designation")
        if client_name:
            suggested = await suggest_client(org_id, client_name, db)
            if suggested:
                client_id = suggested["id"]
                _log.info("Client auto-matche par nom '%s' -> %s", client_name, client_id)

    # 3. Stocker le client_id dans document_imports
    if client_id:
        await db.execute(
            text("UPDATE document_imports SET client_id = :cid WHERE id = :iid"),
            {"cid": client_id, "iid": str(import_id)},
        )

    return client_id


# ── Staging : CRUD des imports IA ────────────────────────────────────────────


async def create_import(
    org_id: uuid.UUID,
    extracted_json: dict,
    source_file_url: str | None,
    source_filename: str | None,
    confidence: float | None,
    model_used: str | None,
    duration_ms: int | None,
    db: AsyncSession,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    prompt_sent: str | None = None,
    assigned_to: uuid.UUID | None = None,
) -> dict:
    """Cree un import en staging (status=pending).

    Appele par la route extract-document apres extraction IA.
    Remplit aussi les colonnes structurees et auto-matche le client.
    """
    import_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    await db.execute(
        text("""
            INSERT INTO document_imports
                (id, organization_id, status, source_file_url, source_filename,
                 extracted_json, confidence, model_used, extraction_duration_ms,
                 tokens_in, tokens_out, prompt_sent, assigned_to, created_at)
            VALUES (:id, :org_id, 'pending', :file_url, :filename,
                    CAST(:extracted AS jsonb), :confidence, :model, :duration,
                    :tin, :tout, :prompt, :assigned_to, :now)
        """),
        {
            "id": str(import_id),
            "org_id": str(org_id),
            "file_url": source_file_url,
            "filename": source_filename,
            "extracted": json.dumps(extracted_json),
            "confidence": confidence,
            "model": model_used,
            "duration": duration_ms,
            "tin": tokens_in,
            "tout": tokens_out,
            "prompt": prompt_sent,
            "assigned_to": str(assigned_to) if assigned_to else None,
            "now": now,
        },
    )

    # Remplir les colonnes structurees depuis le JSON
    await _populate_structured_fields(import_id, extracted_json, db)

    # Auto-match du client (SIRET puis nom)
    matched_client_id = await _auto_match_client(org_id, import_id, extracted_json, db)

    await db.commit()

    _log.info("Import cree : %s (source=%s, client=%s)", import_id, source_filename, matched_client_id)
    return {
        "import_id": str(import_id),
        "status": "pending",
        "extracted_json": extracted_json,
        "client_id": matched_client_id,
    }


async def get_import(
    org_id: uuid.UUID,
    import_id: str,
    db: AsyncSession,
) -> dict:
    """Recupere le detail d'un import avec colonnes structurees et lignes."""
    result = await db.execute(
        text("""
            SELECT di.id::text, di.status, di.source_file_url, di.source_filename,
                   di.extracted_json, di.corrected_json,
                   di.client_id::text, di.target_type, di.target_id::text,
                   di.action, di.confidence, di.model_used,
                   di.extraction_duration_ms, di.tokens_in, di.tokens_out,
                   di.created_at, di.validated_at,
                   c.name AS client_name,
                   di.extracted_emetteur_name, di.extracted_emetteur_siret,
                   di.extracted_emetteur_siren, di.extracted_emetteur_tva,
                   di.extracted_emetteur_address,
                   di.extracted_destinataire_name, di.extracted_destinataire_siret,
                   di.extracted_destinataire_siren, di.extracted_destinataire_tva,
                   di.extracted_destinataire_address,
                   di.extracted_doc_number,
                   di.extracted_doc_date, di.extracted_doc_due_date,
                   di.extracted_doc_type, di.extracted_total_ht,
                   di.extracted_total_tva, di.extracted_total_ttc,
                   di.extracted_iban, di.extracted_payment_mode,
                   di.extracted_currency, di.extracted_reference,
                   di.extracted_order_number, di.prompt_sent
            FROM document_imports di
            LEFT JOIN clients c ON c.id = di.client_id
            WHERE di.id = :iid AND di.organization_id = :org_id
        """),
        {"iid": import_id, "org_id": str(org_id)},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Import introuvable")

    # Charger les lignes
    lines = await get_import_lines(import_id, db)

    return {
        "id": row["id"],
        "status": row["status"],
        "source_file_url": row["source_file_url"],
        "source_filename": row["source_filename"],
        "extracted_json": row["extracted_json"],
        "corrected_json": row["corrected_json"],
        "client_id": row["client_id"],
        "target_type": row["target_type"],
        "target_id": row["target_id"],
        "action": row["action"],
        "confidence": float(row["confidence"]) if row["confidence"] is not None else None,
        "model_used": row["model_used"],
        "extraction_duration_ms": row["extraction_duration_ms"],
        "tokens_in": row["tokens_in"],
        "tokens_out": row["tokens_out"],
        "created_at": str(row["created_at"]) if row["created_at"] else None,
        "validated_at": str(row["validated_at"]) if row["validated_at"] else None,
        "client_name": row["client_name"],
        # Colonnes structurees - Emetteur
        "extracted_emetteur_name": row["extracted_emetteur_name"],
        "extracted_emetteur_siret": row["extracted_emetteur_siret"],
        "extracted_emetteur_siren": row["extracted_emetteur_siren"],
        "extracted_emetteur_tva": row["extracted_emetteur_tva"],
        "extracted_emetteur_address": row["extracted_emetteur_address"],
        # Colonnes structurees - Destinataire
        "extracted_destinataire_name": row["extracted_destinataire_name"],
        "extracted_destinataire_siret": row["extracted_destinataire_siret"],
        "extracted_destinataire_siren": row["extracted_destinataire_siren"],
        "extracted_destinataire_tva": row["extracted_destinataire_tva"],
        "extracted_destinataire_address": row["extracted_destinataire_address"],
        "extracted_doc_number": row["extracted_doc_number"],
        "extracted_doc_date": str(row["extracted_doc_date"]) if row["extracted_doc_date"] else None,
        "extracted_doc_due_date": str(row["extracted_doc_due_date"]) if row["extracted_doc_due_date"] else None,
        "extracted_doc_type": row["extracted_doc_type"],
        "extracted_total_ht": float(row["extracted_total_ht"]) if row["extracted_total_ht"] is not None else None,
        "extracted_total_tva": float(row["extracted_total_tva"]) if row["extracted_total_tva"] is not None else None,
        "extracted_total_ttc": float(row["extracted_total_ttc"]) if row["extracted_total_ttc"] is not None else None,
        "extracted_iban": row["extracted_iban"],
        "extracted_payment_mode": row["extracted_payment_mode"],
        "extracted_currency": row["extracted_currency"],
        "extracted_reference": row["extracted_reference"],
        "extracted_order_number": row["extracted_order_number"],
        "prompt_sent": row["prompt_sent"],
        # Lignes extraites
        "lines": lines,
    }


async def get_import_lines(
    import_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Recupere les lignes d'un import avec leur statut de matching."""
    result = await db.execute(
        text("""
            SELECT id::text, position, extracted_reference,
                   extracted_designation, extracted_description,
                   extracted_quantity, extracted_unit,
                   extracted_unit_price, extracted_vat_rate,
                   extracted_total_ht, extracted_total_ttc,
                   matched_line_id::text, match_confidence, match_status,
                   created_at
            FROM document_import_lines
            WHERE import_id = :iid
            ORDER BY position
        """),
        {"iid": import_id},
    )
    return [
        {
            "id": r["id"],
            "position": r["position"],
            "extracted_reference": r["extracted_reference"],
            "extracted_designation": r["extracted_designation"],
            "extracted_description": r["extracted_description"],
            "extracted_quantity": float(r["extracted_quantity"]) if r["extracted_quantity"] is not None else None,
            "extracted_unit": r["extracted_unit"],
            "extracted_unit_price": float(r["extracted_unit_price"]) if r["extracted_unit_price"] is not None else None,
            "extracted_vat_rate": float(r["extracted_vat_rate"]) if r["extracted_vat_rate"] is not None else None,
            "extracted_total_ht": float(r["extracted_total_ht"]) if r["extracted_total_ht"] is not None else None,
            "extracted_total_ttc": float(r["extracted_total_ttc"]) if r["extracted_total_ttc"] is not None else None,
            "matched_line_id": r["matched_line_id"],
            "match_confidence": float(r["match_confidence"]) if r["match_confidence"] is not None else None,
            "match_status": r["match_status"],
            "created_at": str(r["created_at"]) if r["created_at"] else None,
        }
        for r in result.mappings().fetchall()
    ]


async def get_import_data_for_target(
    org_id: uuid.UUID,
    target_type: str,
    target_id: str,
    db: AsyncSession,
) -> dict | None:
    """Recupere les donnees d'import structurees liees a un document cible.

    Cherche le document_imports lie via target_id.
    Utilisee par l'overlay pour afficher les annotations IA.
    """
    result = await db.execute(
        text("""
            SELECT id::text FROM document_imports
            WHERE organization_id = :org_id
              AND target_type = :ttype
              AND target_id = :tid
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"org_id": str(org_id), "ttype": target_type, "tid": target_id},
    )
    row = result.fetchone()
    if not row:
        return None

    return await get_import(org_id, row[0], db)


async def list_imports(
    org_id: uuid.UUID,
    status: str | None,
    db: AsyncSession,
) -> list[dict]:
    """Liste les imports d'une organisation, filtrable par statut."""
    query = """
        SELECT di.id::text, di.status, di.source_filename,
               di.target_type, di.target_id::text, di.action,
               di.confidence, di.model_used,
               di.tokens_in, di.tokens_out, di.extraction_duration_ms,
               di.created_at, di.validated_at,
               c.name AS client_name,
               di.extracted_emetteur_name, di.extracted_destinataire_name,
               di.extracted_doc_number,
               di.extracted_doc_type, di.extracted_total_ttc
        FROM document_imports di
        LEFT JOIN clients c ON c.id = di.client_id
        WHERE di.organization_id = :org_id
    """
    params: dict = {"org_id": str(org_id)}

    if status:
        query += " AND di.status = :status"
        params["status"] = status

    query += " ORDER BY di.created_at DESC"

    result = await db.execute(text(query), params)
    return [
        {
            "id": r[0],
            "status": r[1],
            "source_filename": r[2],
            "target_type": r[3],
            "target_id": r[4],
            "action": r[5],
            "confidence": float(r[6]) if r[6] is not None else None,
            "model_used": r[7],
            "tokens_in": r[8],
            "tokens_out": r[9],
            "extraction_duration_ms": r[10],
            "created_at": str(r[11]) if r[11] else None,
            "validated_at": str(r[12]) if r[12] else None,
            "client_name": r[13],
            "extracted_emetteur_name": r[14],
            "extracted_destinataire_name": r[15],
            "extracted_doc_number": r[16],
            "extracted_doc_type": r[17],
            "extracted_total_ttc": float(r[18]) if r[18] is not None else None,
        }
        for r in result.fetchall()
    ]


async def validate_import(
    org_id: uuid.UUID,
    import_id: str,
    action: str,
    target_type: str,
    client_id: str | None,
    corrected_json: dict | None,
    db: AsyncSession,
    *,
    target_id: str | None = None,
) -> dict:
    """Valide un import : cree le document ou attache le fichier source.

    action='create' : cree un devis/facture/commande depuis le JSON
    action='attach' : rattache le fichier source a un document existant
    """
    # Charger l'import
    result = await db.execute(
        text("""
            SELECT status, extracted_json, source_file_url, source_filename
            FROM document_imports
            WHERE id = :iid AND organization_id = :org_id
        """),
        {"iid": import_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Import introuvable")
    if row[0] != "pending":
        raise HTTPException(400, f"Import deja traite (status={row[0]})")

    extracted = row[1]
    source_file_url = row[2]
    source_filename = row[3]

    # Utiliser le JSON corrige si fourni, sinon l'extrait
    final_json = corrected_json or extracted

    now = datetime.now(timezone.utc)
    created_target_id = None

    if action == "create":
        if target_type not in ("quote", "invoice", "order"):
            raise HTTPException(422, f"target_type invalide : {target_type}")

        # Creer le document via les fonctions existantes
        if target_type == "quote":
            doc = await import_as_quote(
                org_id, final_json, db,
                client_id=client_id,
                source_filename=source_filename,
            )
            created_target_id = doc["id"]
        elif target_type == "invoice":
            doc = await import_as_invoice(
                org_id, final_json, db,
                client_id=client_id,
                source_filename=source_filename,
            )
            created_target_id = doc["id"]
        elif target_type == "order":
            doc = await import_as_order(
                org_id, final_json, db,
                client_id=client_id,
                source_filename=source_filename,
            )
            created_target_id = doc["id"]

        # Attacher le fichier source au document cree si on a une URL S3
        if source_file_url and created_target_id:
            await db.execute(
                text("""
                    INSERT INTO import_file_attachments
                        (id, organization_id, parent_type, parent_id,
                         file_url, original_filename, import_id, created_at)
                    VALUES (:id, :org_id, :ptype, :pid,
                            :furl, :fname, :iid, :now)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "org_id": str(org_id),
                    "ptype": target_type,
                    "pid": created_target_id,
                    "furl": source_file_url,
                    "fname": source_filename,
                    "iid": import_id,
                    "now": now,
                },
            )

    elif action == "attach":
        if not target_id:
            raise HTTPException(400, "target_id requis pour action='attach'")
        if target_type not in ("quote", "invoice", "order"):
            raise HTTPException(422, f"target_type invalide : {target_type}")

        created_target_id = target_id

        # Attacher le fichier source au document existant
        if source_file_url:
            await db.execute(
                text("""
                    INSERT INTO import_file_attachments
                        (id, organization_id, parent_type, parent_id,
                         file_url, original_filename, import_id, created_at)
                    VALUES (:id, :org_id, :ptype, :pid,
                            :furl, :fname, :iid, :now)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "org_id": str(org_id),
                    "ptype": target_type,
                    "pid": target_id,
                    "furl": source_file_url,
                    "fname": source_filename,
                    "iid": import_id,
                    "now": now,
                },
            )
    else:
        raise HTTPException(422, f"action invalide : {action}")

    # Mettre a jour l'import
    await db.execute(
        text("""
            UPDATE document_imports
            SET status = 'validated',
                action = :action,
                target_type = :ttype,
                target_id = :tid,
                client_id = :cid,
                corrected_json = CAST(:corrected AS jsonb),
                validated_at = :now
            WHERE id = :iid AND organization_id = :org_id
        """),
        {
            "iid": import_id,
            "org_id": str(org_id),
            "action": action,
            "ttype": target_type,
            "tid": created_target_id,
            "cid": client_id,
            "corrected": json.dumps(corrected_json) if corrected_json else None,
            "now": now,
        },
    )
    await db.commit()

    _log.info("Import valide : %s -> %s %s", import_id, action, target_type)
    return {
        "status": "validated",
        "action": action,
        "target_type": target_type,
        "target_id": created_target_id,
    }


async def reject_import(
    org_id: uuid.UUID,
    import_id: str,
    db: AsyncSession,
) -> dict:
    """Rejette un import (passe en status=rejected)."""
    result = await db.execute(
        text("""
            UPDATE document_imports
            SET status = 'rejected', validated_at = :now
            WHERE id = :iid AND organization_id = :org_id AND status != 'rejected'
        """),
        {
            "iid": import_id,
            "org_id": str(org_id),
            "now": datetime.now(timezone.utc),
        },
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Import introuvable ou deja traite")
    await db.commit()

    _log.info("Import rejete : %s", import_id)
    return {"status": "rejected"}


async def update_import(
    org_id: uuid.UUID,
    import_id: str,
    updates: dict,
    db: AsyncSession,
) -> dict:
    """Met a jour les champs editables d'un import."""
    # Mapping champs frontend -> colonnes DB
    field_map = {
        "doc_type": "extracted_doc_type",
        "client_id": "client_id",
        "doc_number": "extracted_doc_number",
        "doc_date": "extracted_doc_date",
        "doc_due_date": "extracted_doc_due_date",
        "reference": "extracted_reference",
        "order_number": "extracted_order_number",
    }

    sets = []
    params: dict = {"iid": import_id, "org_id": str(org_id)}
    for key, value in updates.items():
        col = field_map.get(key)
        if not col:
            continue
        sets.append(f"{col} = :{key}")
        params[key] = value

    if not sets:
        return {"updated": False}

    query = f"UPDATE document_imports SET {', '.join(sets)} WHERE id = :iid AND organization_id = :org_id"
    await db.execute(text(query), params)
    await db.commit()

    return {"updated": True}


async def delete_import(
    org_id: uuid.UUID,
    import_id: str,
    db: AsyncSession,
) -> dict:
    """Supprime un import, ses lignes (CASCADE) et le fichier source sur S3."""
    # Recuperer l'URL du fichier source avant suppression
    row = (await db.execute(
        text("SELECT source_file_url FROM document_imports WHERE id = :iid AND organization_id = :org_id"),
        {"iid": import_id, "org_id": str(org_id)},
    )).fetchone()
    if not row:
        raise HTTPException(404, "Import introuvable")

    file_url = row[0]

    # Supprimer les pieces jointes liees (FK sans CASCADE)
    await db.execute(
        text("DELETE FROM import_file_attachments WHERE import_id = :iid"),
        {"iid": import_id},
    )

    # Supprimer en base (document_import_lines CASCADE, mais pas import_file_attachments)
    await db.execute(
        text("DELETE FROM document_imports WHERE id = :iid AND organization_id = :org_id"),
        {"iid": import_id, "org_id": str(org_id)},
    )
    await db.commit()

    # Supprimer le fichier source sur S3
    if file_url:
        try:
            from app.services import storage as storage_svc
            from app.storage.s3 import S3Adapter
            s3_config = await storage_svc._get_platform_s3_config(db)
            if s3_config:
                bucket = s3_config.get("bucket", "")
                if bucket and f"/{bucket}/" in file_url:
                    remote_path = file_url.split(f"/{bucket}/", 1)[1]
                    adapter = S3Adapter(s3_config)
                    adapter.delete(remote_path)
        except Exception as exc:
            _log.warning("Suppression fichier S3 echouee : %s", exc)

    _log.info("Import supprime : %s", import_id)
    return {"deleted": True}


# ── Import as Quote ─────────────────────────────────────────────────────────


async def import_as_quote(
    org_id: uuid.UUID,
    extracted_data: dict,
    db: AsyncSession,
    client_id: str | None = None,
    source_filename: str | None = None,
) -> dict:
    """Cree un devis brouillon depuis un JSON Factur-X extrait."""
    from app.services.numbering import generate_number

    parties = extracted_data.get("parties") or {}
    # Le CLIENT est le DESTINATAIRE (l'emetteur c'est nous)
    emetteur = parties.get("destinataire") or {}
    doc = extracted_data.get("document") or {}

    # Resoudre le client (optionnel - brouillon sans client accepte)
    client_name = emetteur.get("designation")
    client_id = await _resolve_client_id(org_id, client_id, client_name, db)

    # Extraire les lignes
    lines = _extract_lines(extracted_data)
    _log.info("import_as_quote: %d lignes extraites, client_id=%s", len(lines), client_id)

    # Calculer les totaux
    subtotal_ht = sum(ln["total_ht"] for ln in lines)
    total_vat = sum(ln["total_vat"] for ln in lines)
    total_ttc = subtotal_ht + total_vat

    # Dates
    issue_date = _safe_date(doc.get("date_emission")) or date.today()
    expiry_date = _safe_date(doc.get("date_echeance"))

    # Notes avec les infos complementaires
    notes = _build_notes(extracted_data, source_filename)

    # Generer le numero Kerpta
    quote_id = uuid.uuid4()
    number = await generate_number("quote", org_id, db)

    # Profil de facturation par defaut
    default_bp = await db.execute(
        text("SELECT id::text FROM billing_profiles WHERE organization_id = :org_id AND is_default = true LIMIT 1"),
        {"org_id": str(org_id)},
    )
    bp_row = default_bp.fetchone()
    billing_profile_id = bp_row[0] if bp_row else None

    await db.execute(
        text("""
            INSERT INTO quotes (
                id, organization_id, client_id, number, document_type,
                show_quantity, billing_profile_id, status, issue_date, expiry_date,
                currency, subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value, notes,
                signature_status, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :number, 'devis',
                true, :billing_profile_id, 'draft', :issue_date, :expiry_date,
                'EUR', :ht, :vat, :ttc,
                'none', 0, :notes,
                'none', now(), now()
            )
        """),
        {
            "id": str(quote_id),
            "org_id": str(org_id),
            "client_id": client_id,
            "number": number,
            "billing_profile_id": billing_profile_id,
            "issue_date": issue_date,
            "expiry_date": expiry_date,
            "ht": str(subtotal_ht),
            "vat": str(total_vat),
            "ttc": str(total_ttc),
            "notes": notes,
        },
    )

    # Inserer les lignes
    await _insert_lines("quote_lines", "quote_id", str(quote_id), lines, db)

    _log.info("Devis importe : %s (%s) - %d lignes", number, quote_id, len(lines))
    return {"id": str(quote_id), "number": number, "client_name": client_name}


# ── Import as Invoice ────────────────────────────────────────────────────────


async def import_as_invoice(
    org_id: uuid.UUID,
    extracted_data: dict,
    db: AsyncSession,
    client_id: str | None = None,
    source_filename: str | None = None,
) -> dict:
    """Cree une facture brouillon depuis un JSON Factur-X extrait."""
    from app.services.numbering import generate_number

    parties = extracted_data.get("parties") or {}
    # Le CLIENT est le DESTINATAIRE (l'emetteur c'est nous)
    emetteur = parties.get("destinataire") or {}
    doc = extracted_data.get("document") or {}

    # Resoudre le client (optionnel - brouillon sans client accepte)
    client_name = emetteur.get("designation")
    client_id = await _resolve_client_id(org_id, client_id, client_name, db)

    # Extraire les lignes
    lines = _extract_lines(extracted_data)
    _log.info("import_as_invoice: %d lignes extraites, client_id=%s", len(lines), client_id)

    # Calculer les totaux
    subtotal_ht = sum(ln["total_ht"] for ln in lines)
    total_vat = sum(ln["total_vat"] for ln in lines)
    total_ttc = subtotal_ht + total_vat

    # Dates
    issue_date = _safe_date(doc.get("date_emission")) or date.today()
    due_date = _safe_date(doc.get("date_echeance"))

    # Notes avec les infos complementaires
    notes = _build_notes(extracted_data, source_filename)

    # Generer un numero proforma
    invoice_id = uuid.uuid4()
    proforma_number = await generate_number("proforma", org_id, db)

    # Profil de facturation par defaut
    default_bp = await db.execute(
        text("SELECT id::text, name FROM billing_profiles WHERE organization_id = :org_id AND is_default = true LIMIT 1"),
        {"org_id": str(org_id)},
    )
    bp_row = default_bp.fetchone()
    billing_profile_id = bp_row[0] if bp_row else None
    billing_profile_name = bp_row[1] if bp_row else None

    await db.execute(
        text("""
            INSERT INTO invoices (
                id, organization_id, client_id, client_name,
                proforma_number,
                billing_profile_id, billing_profile_name,
                is_credit_note, status, issue_date, due_date,
                currency, subtotal_ht, total_vat, total_ttc,
                amount_paid, discount_type, discount_value,
                payment_terms, notes, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :client_name,
                :proforma_number,
                :billing_profile_id, :billing_profile_name,
                false, 'draft', :issue_date, :due_date,
                'EUR', :ht, :vat, :ttc,
                0, 'none', 0,
                30, :notes, now(), now()
            )
        """),
        {
            "id": str(invoice_id),
            "org_id": str(org_id),
            "client_id": client_id,
            "client_name": client_name,
            "proforma_number": proforma_number,
            "billing_profile_id": billing_profile_id,
            "billing_profile_name": billing_profile_name,
            "issue_date": issue_date,
            "due_date": due_date,
            "ht": str(subtotal_ht),
            "vat": str(total_vat),
            "ttc": str(total_ttc),
            "notes": notes,
        },
    )

    # Inserer les lignes
    await _insert_lines("invoice_lines", "invoice_id", str(invoice_id), lines, db)

    _log.info("Facture importee : %s (%s) - %d lignes", proforma_number, invoice_id, len(lines))
    return {
        "id": str(invoice_id),
        "proforma_number": proforma_number,
        "client_name": client_name,
    }


# ── Import as Order ──────────────────────────────────────────────────────────


async def import_as_order(
    org_id: uuid.UUID,
    extracted_data: dict,
    db: AsyncSession,
    client_id: str | None = None,
    quote_ids: list[str] | None = None,
    source_filename: str | None = None,
) -> dict:
    """Cree une commande brouillon depuis un JSON Factur-X extrait."""
    parties = extracted_data.get("parties") or {}
    # Le CLIENT est le DESTINATAIRE (l'emetteur c'est nous)
    emetteur = parties.get("destinataire") or {}
    doc = extracted_data.get("document") or {}

    # Resoudre le client (optionnel - brouillon sans client accepte)
    client_name = emetteur.get("designation")
    client_id = await _resolve_client_id(org_id, client_id, client_name, db)

    # Extraire les lignes
    lines = _extract_lines(extracted_data)
    _log.info("import_as_order: %d lignes extraites, client_id=%s", len(lines), client_id)

    # Calculer les totaux
    subtotal_ht = sum(ln["total_ht"] for ln in lines)
    total_vat = sum(ln["total_vat"] for ln in lines)
    total_ttc = subtotal_ht + total_vat

    # Dates
    issue_date = _safe_date(doc.get("date_emission")) or date.today()

    # Notes avec les infos complementaires
    notes = _build_notes(extracted_data, source_filename)

    # Reference client = numero d'origine du document
    client_reference = doc.get("numero")

    order_id = uuid.uuid4()

    await db.execute(
        text("""
            INSERT INTO orders (
                id, organization_id, client_id,
                client_reference, source, status,
                issue_date, billing_mode,
                subtotal_ht, total_vat, total_ttc,
                discount_type, discount_value,
                notes, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id,
                :client_ref, 'client_document', 'draft',
                :issue_date, 'one_shot',
                :ht, :vat, :ttc,
                'none', 0,
                :notes, now(), now()
            )
        """),
        {
            "id": str(order_id),
            "org_id": str(org_id),
            "client_id": client_id,
            "client_ref": client_reference,
            "issue_date": issue_date,
            "ht": str(subtotal_ht),
            "vat": str(total_vat),
            "ttc": str(total_ttc),
            "notes": notes,
        },
    )

    # Inserer les lignes
    await _insert_lines("order_lines", "order_id", str(order_id), lines, db)

    # Lier les devis si fournis
    if quote_ids:
        for qid in quote_ids:
            await db.execute(
                text("INSERT INTO order_quotes (order_id, quote_id) VALUES (:oid, :qid) ON CONFLICT DO NOTHING"),
                {"oid": str(order_id), "qid": qid},
            )

    _log.info("Commande importee : %s - %d lignes", order_id, len(lines))
    return {"id": str(order_id), "client_name": client_name}
