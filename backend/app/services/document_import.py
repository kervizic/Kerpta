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
) -> dict:
    """Cree un import en staging (status=pending).

    Appele par la route extract-document apres extraction IA.
    """
    import_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    await db.execute(
        text("""
            INSERT INTO document_imports
                (id, organization_id, status, source_file_url, source_filename,
                 extracted_json, confidence, model_used, extraction_duration_ms,
                 tokens_in, tokens_out, created_at)
            VALUES (:id, :org_id, 'pending', :file_url, :filename,
                    CAST(:extracted AS jsonb), :confidence, :model, :duration,
                    :tin, :tout, :now)
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
            "now": now,
        },
    )
    await db.commit()

    _log.info("Import cree : %s (source=%s)", import_id, source_filename)
    return {
        "import_id": str(import_id),
        "status": "pending",
        "extracted_json": extracted_json,
    }


async def get_import(
    org_id: uuid.UUID,
    import_id: str,
    db: AsyncSession,
) -> dict:
    """Recupere le detail d'un import."""
    result = await db.execute(
        text("""
            SELECT di.id::text, di.status, di.source_file_url, di.source_filename,
                   di.extracted_json, di.corrected_json,
                   di.client_id::text, di.target_type, di.target_id::text,
                   di.action, di.confidence, di.model_used,
                   di.extraction_duration_ms, di.tokens_in, di.tokens_out,
                   di.created_at, di.validated_at,
                   c.name AS client_name
            FROM document_imports di
            LEFT JOIN clients c ON c.id = di.client_id
            WHERE di.id = :iid AND di.organization_id = :org_id
        """),
        {"iid": import_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Import introuvable")

    return {
        "id": row[0],
        "status": row[1],
        "source_file_url": row[2],
        "source_filename": row[3],
        "extracted_json": row[4],
        "corrected_json": row[5],
        "client_id": row[6],
        "target_type": row[7],
        "target_id": row[8],
        "action": row[9],
        "confidence": float(row[10]) if row[10] is not None else None,
        "model_used": row[11],
        "extraction_duration_ms": row[12],
        "tokens_in": row[13],
        "tokens_out": row[14],
        "created_at": str(row[15]) if row[15] else None,
        "validated_at": str(row[16]) if row[16] else None,
        "client_name": row[17],
    }


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
               c.name AS client_name
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
            WHERE id = :iid AND organization_id = :org_id AND status = 'pending'
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
    emetteur = parties.get("emetteur") or {}
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
    emetteur = parties.get("emetteur") or {}
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
    emetteur = parties.get("emetteur") or {}
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
