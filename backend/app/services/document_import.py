# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service d'import de documents depuis le JSON Factur-X extrait par l'IA.

Mapping JSON Factur-X -> devis / facture / commande Kerpta.
Les documents importes sont toujours crees en brouillon (draft).
"""

import logging
import uuid
from datetime import date
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
    """Extrait et normalise les lignes depuis le JSON Factur-X."""
    raw_lines = data.get("lignes") or []
    lines = []
    for i, ln in enumerate(raw_lines):
        qty = _safe_decimal(ln.get("quantite"), "1")
        if qty <= 0:
            qty = Decimal("1")
        price = _safe_decimal(ln.get("prix_unitaire_ht"), "0")
        vat_rate = _safe_decimal(ln.get("taux_tva"), "0")
        # Limiter le taux TVA a 20% max (coherent avec les schemas existants)
        if vat_rate > Decimal("20"):
            vat_rate = Decimal("20")
        calc = _calc_line(qty, price, vat_rate)

        lines.append({
            "position": i,
            "reference": ln.get("reference"),
            "description": ln.get("designation") or ln.get("description"),
            "quantity": qty,
            "unit": ln.get("unite"),
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


async def _find_or_create_client(
    org_id: uuid.UUID, name: str, data: dict, db: AsyncSession
) -> str:
    """Cherche un client par nom, le cree si inexistant. Retourne le client_id."""
    if not name:
        raise HTTPException(400, "Nom du client (parties.emetteur.designation) manquant dans les donnees extraites")

    # Chercher par nom (case-insensitive)
    result = await db.execute(
        text("""
            SELECT id::text FROM clients
            WHERE organization_id = :org_id AND LOWER(name) = LOWER(:name)
            LIMIT 1
        """),
        {"org_id": str(org_id), "name": name},
    )
    row = result.fetchone()
    if row:
        return row[0]

    # Creer le client
    client_id = uuid.uuid4()
    emetteur = (data.get("parties") or {}).get("emetteur") or {}
    adresse = emetteur.get("adresse") or {}
    identifiants = emetteur.get("identifiants") or {}

    # Construire l'adresse au format attendu
    address_parts = []
    if adresse.get("rue"):
        address_parts.append(adresse["rue"])
    if adresse.get("code_postal") or adresse.get("ville"):
        address_parts.append(
            f"{adresse.get('code_postal', '')} {adresse.get('ville', '')}".strip()
        )

    await db.execute(
        text("""
            INSERT INTO clients (
                id, organization_id, name, siret, vat_number,
                billing_address, created_at, updated_at
            ) VALUES (
                :id, :org_id, :name, :siret, :vat,
                :address, now(), now()
            )
        """),
        {
            "id": str(client_id),
            "org_id": str(org_id),
            "name": name,
            "siret": identifiants.get("siret"),
            "vat": identifiants.get("tva"),
            "address": "\n".join(address_parts) if address_parts else None,
        },
    )
    _log.info("Client cree par import : %s (%s)", name, client_id)
    return str(client_id)


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


# ── Import as Quote ─────────────────────────────────────────────────────────


async def import_as_quote(
    org_id: uuid.UUID,
    extracted_data: dict,
    db: AsyncSession,
    source_filename: str | None = None,
) -> dict:
    """Cree un devis brouillon depuis un JSON Factur-X extrait."""
    from app.services.numbering import generate_number

    parties = extracted_data.get("parties") or {}
    emetteur = parties.get("emetteur") or {}
    doc = extracted_data.get("document") or {}

    # Trouver/creer le client
    client_name = emetteur.get("designation")
    client_id = await _find_or_create_client(org_id, client_name, extracted_data, db)

    # Extraire les lignes
    lines = _extract_lines(extracted_data)

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

    await db.commit()
    _log.info("Devis importe : %s (%s) - %d lignes", number, quote_id, len(lines))
    return {"id": str(quote_id), "number": number, "client_name": client_name}


# ── Import as Invoice ────────────────────────────────────────────────────────


async def import_as_invoice(
    org_id: uuid.UUID,
    extracted_data: dict,
    db: AsyncSession,
    source_filename: str | None = None,
) -> dict:
    """Cree une facture brouillon depuis un JSON Factur-X extrait."""
    from app.services.numbering import generate_number

    parties = extracted_data.get("parties") or {}
    emetteur = parties.get("emetteur") or {}
    doc = extracted_data.get("document") or {}

    # Trouver/creer le client
    client_name = emetteur.get("designation")
    client_id = await _find_or_create_client(org_id, client_name, extracted_data, db)

    # Extraire les lignes
    lines = _extract_lines(extracted_data)

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

    await db.commit()
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
    source_filename: str | None = None,
) -> dict:
    """Cree une commande brouillon depuis un JSON Factur-X extrait."""
    parties = extracted_data.get("parties") or {}
    emetteur = parties.get("emetteur") or {}
    doc = extracted_data.get("document") or {}

    # Trouver/creer le client
    client_name = emetteur.get("designation")
    client_id = await _find_or_create_client(org_id, client_name, extracted_data, db)

    # Extraire les lignes
    lines = _extract_lines(extracted_data)

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

    await db.commit()
    _log.info("Commande importee : %s - %d lignes", order_id, len(lines))
    return {"id": str(order_id), "client_name": client_name}
