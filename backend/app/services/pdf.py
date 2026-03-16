# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — Génération de PDF (WeasyPrint + Jinja2).

Génère les PDF de factures, devis et avoirs.
Supporte 3 styles configurables par organisation :
  - classique : professionnel, bordures, en-têtes gris
  - moderne : accent couleur, lignes épurées
  - minimaliste : maximum de blanc, typographie soignée
"""

import json
import logging
import uuid
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from app.services import storage as storage_svc
from app.services import billing as billing_svc

_log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"
VALID_STYLES = ("classique", "moderne", "minimaliste")
DEFAULT_STYLE = "classique"
ACCENT_COLOR = "#ff9900"  # Kerpta orange

# Jinja2 environment — chargé une fois au démarrage du module
_jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=True,
)


def _fmt_number(value, decimals: int = 2) -> str:
    """Formate un nombre avec N décimales et séparateur de milliers."""
    try:
        quant = Decimal("1") / Decimal(10) ** decimals  # ex: 0.01 pour 2
        d = Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP)
        sign = "-" if d < 0 else ""
        d = abs(d)
        parts = str(d).split(".")
        integer_part = int(parts[0])
        decimal_part = parts[1] if len(parts) > 1 else "0" * decimals
        formatted = f"{integer_part:,}".replace(",", "\u202f")  # espace fine insécable
        return f"{sign}{formatted},{decimal_part}"
    except Exception:
        return str(value)


def _fmt_currency(value) -> str:
    """Formate un montant en EUR avec 2 décimales et séparateur de milliers."""
    return f"{_fmt_number(value, 2)}\u00a0€"


_jinja_env.filters["fmt_currency"] = _fmt_currency


def _fmt_currency_num(value) -> str:
    """Formate un montant sans le symbole € (pour les colonnes prix unitaire)."""
    return _fmt_number(value, 2)


_jinja_env.filters["fmt_currency_num"] = _fmt_currency_num


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_print_config(org_id: uuid.UUID, db: AsyncSession) -> tuple[str, str, dict]:
    """Récupère le style d'impression, les mentions légales et les options de pied de page.

    Si aucune mention légale personnalisée n'est enregistrée, la génère
    automatiquement depuis le profil de facturation par défaut.

    Returns:
        (style, legal_footer, footer_options)
    """
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[0]:
        auto = await billing_svc.generate_auto_footer(org_id, db)
        return DEFAULT_STYLE, auto.get("footer", ""), {}
    config = row[0] if isinstance(row[0], dict) else {}
    style = config.get("print_style", DEFAULT_STYLE)
    style = style if style in VALID_STYLES else DEFAULT_STYLE
    footer = config.get("document_footer", "")
    if not footer:
        auto = await billing_svc.generate_auto_footer(org_id, db)
        footer = auto.get("footer", "")
    footer_options = {
        "show_phone": config.get("footer_show_phone", False),
        "show_email": config.get("footer_show_email", False),
        "show_website": config.get("footer_show_website", False),
    }
    return style, footer, footer_options


async def _get_org_info(org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Récupère les informations de l'organisation (vendeur)."""
    result = await db.execute(
        text("""
            SELECT name, siret, siren, vat_number, address, legal_form,
                   rcs_city, capital, ape_code, email, phone, website
            FROM organizations WHERE id = :org_id
        """),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return {}
    return {
        "name": row[0],
        "siret": row[1],
        "siren": row[2],
        "vat_number": row[3],
        "address": row[4] if isinstance(row[4], dict) else None,
        "legal_form": row[5],
        "rcs_city": row[6],
        "capital": str(row[7]) if row[7] else None,
        "ape_code": row[8],
        "email": row[9],
        "phone": row[10],
        "website": row[11],
    }


async def _get_bank_details_from_profile(
    org_id: uuid.UUID, db: AsyncSession, profile_id: str | None = None
) -> dict | None:
    """Récupère le RIB du profil de facturation (spécifique puis défaut)."""
    # D'abord essayer le profil spécifique
    if profile_id:
        result = await db.execute(
            text("""
                SELECT ba.iban, ba.bic, ba.bank_name
                FROM billing_profiles bp
                JOIN bank_accounts ba ON ba.id = bp.bank_account_id
                WHERE bp.id = :pid AND bp.organization_id = :org_id
                LIMIT 1
            """),
            {"pid": profile_id, "org_id": str(org_id)},
        )
        row = result.fetchone()
        if row:
            return {"iban": row[0], "bic": row[1], "bank_name": row[2]}
    # Sinon profil par défaut
    result = await db.execute(
        text("""
            SELECT ba.iban, ba.bic, ba.bank_name
            FROM billing_profiles bp
            JOIN bank_accounts ba ON ba.id = bp.bank_account_id
            WHERE bp.organization_id = :org_id AND bp.is_default = true
            LIMIT 1
        """),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return None
    return {"iban": row[0], "bic": row[1], "bank_name": row[2]}


async def _get_payment_note_from_profile(
    org_id: uuid.UUID, db: AsyncSession, profile_id: str | None = None
) -> str:
    """Récupère la note de règlement du profil de facturation (spécifique puis défaut)."""
    if profile_id:
        result = await db.execute(
            text("""
                SELECT payment_note FROM billing_profiles
                WHERE id = :pid AND organization_id = :org_id
                LIMIT 1
            """),
            {"pid": profile_id, "org_id": str(org_id)},
        )
        row = result.fetchone()
        if row and row[0]:
            return row[0]
    result = await db.execute(
        text("""
            SELECT payment_note FROM billing_profiles
            WHERE organization_id = :org_id AND is_default = true
            LIMIT 1
        """),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    return row[0] if row and row[0] else ""


async def _get_rounding_config(org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Récupère la config des arrondis pour le formatage PDF."""
    return await billing_svc.get_rounding(org_id, db)


def _format_lines(lines: list[dict], rounding: dict) -> list[dict]:
    """Pré-formate les valeurs des lignes selon la config d'arrondi."""
    qty_dec = rounding.get("quantity_display", 2)
    price_dec = rounding.get("unit_price_display", 2)
    for line in lines:
        line["quantity_fmt"] = _fmt_number(line.get("quantity", 0), qty_dec)
        line["unit_price_fmt"] = f"{_fmt_number(line.get('unit_price', 0), price_dec)}\u00a0€"
        line["total_ht_fmt"] = _fmt_currency(line.get("total_ht", 0))
    return lines


async def _get_org_logo(org_id: uuid.UUID, db: AsyncSession) -> tuple[str | None, str | None]:
    """Récupère le logo de l'organisation (base64 brut + mime type).

    Le logo_b64 en base contient le préfixe data URI complet
    (ex: "data:image/png;base64,iVBOR..."). On l'extrait pour obtenir
    le base64 brut, car le template HTML construit la data URI lui-même.
    """
    result = await db.execute(
        text("SELECT logo_b64, mime_type FROM organization_logos WHERE organization_id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[0]:
        return None, None

    raw_b64 = row[0]
    mime = row[1] or "image/png"

    # Extraire le base64 brut si c'est une data URI complète
    if raw_b64.startswith("data:"):
        # Format : "data:image/png;base64,iVBOR..."
        parts = raw_b64.split(",", 1)
        if len(parts) == 2:
            header = parts[0]  # "data:image/png;base64"
            if ":" in header and ";" in header:
                mime = header.split(":")[1].split(";")[0]
            raw_b64 = parts[1]

    return raw_b64, mime


async def _get_client_info(client_id: str, org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Récupère les informations du client."""
    result = await db.execute(
        text("""
            SELECT name, siret, vat_number, billing_address
            FROM clients WHERE id = :cid AND organization_id = :org_id
        """),
        {"cid": client_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return {"name": "Client inconnu"}
    return {
        "name": row[0],
        "siret": row[1],
        "vat_number": row[2],
        "address": row[3] if isinstance(row[3], dict) else None,
    }


async def _get_document_columns(
    org_id: uuid.UUID,
    db: AsyncSession,
    document_type: str | None = None,
) -> tuple[dict, bool, bool]:
    """Récupère la config des colonnes du document + options d'en-tête.

    Si *document_type* est fourni, cherche dans les types de documents
    configurés par l'organisation (``quote_document_types``).
    Sinon, utilise la config globale ``document_columns``.

    Returns:
        (columns_dict, show_logo, show_company_name)
    """
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    default_cols = {
        "reference": True, "description": True, "quantity": True, "unit": True,
        "unit_price": True, "vat_rate": True, "discount_percent": True, "total_ht": True,
    }
    if not row or not row[0]:
        return default_cols, True, True

    config = row[0] if isinstance(row[0], dict) else {}

    # Options globales d'en-tête
    show_logo = config.get("document_show_logo", True)
    show_company_name = config.get("document_show_company_name", True)

    # Chercher les colonnes dans les types de documents si un type est spécifié
    if document_type:
        doc_types = config.get("quote_document_types", [])
        for dt in doc_types:
            if dt.get("key") == document_type:
                return dt.get("columns", default_cols), show_logo, show_company_name

    return config.get("document_columns", default_cols), show_logo, show_company_name


def _compute_vat_breakdown(lines: list[dict]) -> list[dict]:
    """Calcule la ventilation TVA par taux."""
    breakdown: dict[str, Decimal] = {}
    for line in lines:
        rate = str(line.get("vat_rate", "0"))
        amount = Decimal(str(line.get("total_vat", "0")))
        breakdown[rate] = breakdown.get(rate, Decimal("0")) + amount
    return [
        {"rate": rate, "amount": str(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))}
        for rate, amount in sorted(breakdown.items(), key=lambda x: -Decimal(x[0]))
        if amount != 0
    ]


def _safe_filename(name: str) -> str:
    """Convertit un nom de fichier en ASCII pur (compatible Content-Disposition latin-1)."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", name)
    return nfkd.encode("ascii", "ignore").decode("ascii") or "document"


def _render_pdf(template_name: str, context: dict) -> bytes:
    """Rend un template HTML en PDF via WeasyPrint."""
    template = _jinja_env.get_template(template_name)
    html_content = template.render(**context)
    pdf_bytes = HTML(string=html_content).write_pdf()
    return pdf_bytes


# ── API publique — Factures ────────────────────────────────────────────────────


async def generate_invoice_pdf(
    org_id: uuid.UUID,
    invoice_id: str,
    db: AsyncSession,
    *,
    proforma: bool = False,
) -> tuple[bytes, str]:
    """Génère le PDF d'une facture.

    Returns:
        (pdf_bytes, filename)
    """
    # Récupérer la facture
    inv_result = await db.execute(
        text("""
            SELECT i.id::text, i.number, i.proforma_number,
                   i.client_id::text, i.client_name,
                   i.is_credit_note, i.is_situation, i.situation_number,
                   i.status, i.issue_date, i.due_date,
                   i.subtotal_ht, i.total_vat, i.total_ttc,
                   i.amount_paid, i.discount_type, i.discount_value,
                   i.payment_terms, i.payment_method,
                   i.customer_reference, i.purchase_order_number,
                   i.bank_details, i.notes, i.footer,
                   i.client_snapshot, i.seller_snapshot,
                   i.billing_profile_id::text
            FROM invoices i
            WHERE i.id = :iid AND i.organization_id = :org_id
        """),
        {"iid": invoice_id, "org_id": str(org_id)},
    )
    inv = inv_result.fetchone()
    if inv is None:
        raise ValueError("Facture introuvable")
    inv = dict(inv._mapping)

    # Lignes
    lines_result = await db.execute(
        text("""
            SELECT reference, description, quantity, unit, unit_price,
                   vat_rate, discount_percent, total_ht, total_vat
            FROM invoice_lines
            WHERE invoice_id = :iid ORDER BY position
        """),
        {"iid": invoice_id},
    )
    lines = [dict(r._mapping) for r in lines_result.fetchall()]

    # Type de document
    if inv["is_credit_note"]:
        doc_type_label = "Avoir"
        doc_number = inv["number"] or inv["proforma_number"] or "-"
    elif proforma or inv["status"] == "draft":
        doc_type_label = "Proforma"
        doc_number = inv["proforma_number"] or "-"
    else:
        doc_type_label = "Facture"
        doc_number = inv["number"] or inv["proforma_number"] or "-"

    if inv["is_situation"]:
        doc_type_label += f" de situation n°{inv['situation_number'] or ''}"

    # Vendeur — snapshot si disponible, sinon org live
    if inv.get("seller_snapshot") and isinstance(inv["seller_snapshot"], dict):
        seller = inv["seller_snapshot"]
    else:
        seller = await _get_org_info(org_id, db)

    # Client — snapshot si disponible, sinon client live
    if inv.get("client_snapshot") and isinstance(inv["client_snapshot"], dict):
        client = inv["client_snapshot"]
    else:
        client = await _get_client_info(inv["client_id"], org_id, db)

    # Logo + colonnes (per doc type pour factures)
    logo_b64, logo_mime = await _get_org_logo(org_id, db)
    doc_type_key = "avoir" if inv["is_credit_note"] else "facture"
    columns, show_logo, show_company_name = await _get_document_columns(org_id, db, doc_type_key)

    # Rounding + formatage des lignes
    rounding = await _get_rounding_config(org_id, db)
    lines = _format_lines(lines, rounding)

    # Ventilation TVA
    vat_breakdown = _compute_vat_breakdown(lines)

    # Remise globale
    discount_label = None
    discount_amount = "0"
    if inv["discount_type"] and inv["discount_type"] != "none" and Decimal(str(inv["discount_value"] or 0)) > 0:
        if inv["discount_type"] == "percent":
            discount_label = f'{inv["discount_value"]}%'
        else:
            discount_label = "fixe"
        discount_amount = str(
            (Decimal(str(inv["subtotal_ht"])) * Decimal(str(inv["discount_value"])) / 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ) if inv["discount_type"] == "percent"
            else Decimal(str(inv["discount_value"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        )

    # Reste à payer
    ttc = Decimal(str(inv["total_ttc"]))
    paid = Decimal(str(inv["amount_paid"] or 0))
    remaining = (ttc - paid).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Profil de facturation associé
    profile_id = inv.get("billing_profile_id")

    # Infos bancaires - depuis la facture, sinon depuis le profil
    bank_details = inv.get("bank_details")
    if isinstance(bank_details, str):
        try:
            bank_details = json.loads(bank_details)
        except Exception:
            bank_details = None
    if not bank_details:
        bank_details = await _get_bank_details_from_profile(org_id, db, profile_id)

    # Style + mentions legales + options pied de page
    style, org_footer, footer_options = await _get_print_config(org_id, db)
    template_name = f"pdf/{style}.html"

    # Footer : priorité au footer du document, sinon footer org
    footer = inv.get("footer") or org_footer

    # Note de règlement depuis le profil de facturation
    payment_note = await _get_payment_note_from_profile(org_id, db, profile_id)

    context = {
        "title": f"{doc_type_label} {doc_number}",
        "doc_type_label": doc_type_label,
        "doc_number": doc_number,
        "issue_date": str(inv["issue_date"]) if inv["issue_date"] else "",
        "due_date": str(inv["due_date"]) if inv["due_date"] else None,
        "customer_reference": inv.get("customer_reference"),
        "purchase_order_number": inv.get("purchase_order_number"),
        "seller": seller,
        "client": client,
        "client_label": "Destinataire",
        "logo_b64": logo_b64 if show_logo else None,
        "logo_mime": logo_mime if show_logo else None,
        "show_company_name": show_company_name,
        "columns": columns,
        "lines": lines,
        "subtotal_ht": str(inv["subtotal_ht"]),
        "total_vat": str(inv["total_vat"]),
        "total_ttc": str(inv["total_ttc"]),
        "amount_paid": str(inv["amount_paid"] or 0),
        "remaining": str(remaining),
        "discount_label": discount_label,
        "discount_amount": discount_amount,
        "vat_breakdown": vat_breakdown,
        "payment_method": inv.get("payment_method"),
        "bank_details": bank_details,
        "notes": inv.get("notes"),
        "footer": footer,
        "payment_note": payment_note,
        "footer_options": footer_options,
    }

    pdf_bytes = _render_pdf(template_name, context)
    filename = _safe_filename(f"{doc_type_label.replace(' ', '_')}_{doc_number.replace('/', '-')}.pdf")

    # Backup automatique vers le stockage configuré (arborescence Kerpta)
    try:
        remote_path = await storage_svc.build_document_path(
            org_id, db,
            doc_type="facture",
            filename=filename,
            client_id=inv["client_id"],
        )
        pdf_url = await storage_svc.upload_document(org_id, pdf_bytes, remote_path, db)
        if pdf_url:
            await db.execute(
                text("UPDATE invoices SET pdf_url = :url, updated_at = now() WHERE id = :iid"),
                {"url": pdf_url, "iid": invoice_id},
            )
            await db.commit()
            _log.info("PDF facture sauvegardé : %s", remote_path)
    except Exception as e:
        _log.warning("Backup PDF facture échoué (non bloquant) : %s", e)

    return pdf_bytes, filename


# ── API publique — Devis ───────────────────────────────────────────────────────


async def generate_quote_pdf(
    org_id: uuid.UUID,
    quote_id: str,
    db: AsyncSession,
) -> tuple[bytes, str]:
    """Génère le PDF d'un devis.

    Returns:
        (pdf_bytes, filename)
    """
    # Récupérer le devis
    q_result = await db.execute(
        text("""
            SELECT q.id::text, q.number, q.client_id::text,
                   c.name AS client_name,
                   q.document_type, q.status, q.issue_date, q.expiry_date,
                   q.subtotal_ht, q.total_vat, q.total_ttc,
                   q.discount_type, q.discount_value,
                   q.notes, q.footer
            FROM quotes q
            LEFT JOIN clients c ON c.id = q.client_id
            WHERE q.id = :qid AND q.organization_id = :org_id
        """),
        {"qid": quote_id, "org_id": str(org_id)},
    )
    q_row = q_result.fetchone()
    if q_row is None:
        raise ValueError("Devis introuvable")
    quote = dict(q_row._mapping)

    # Lignes
    lines_result = await db.execute(
        text("""
            SELECT reference, description, quantity, unit, unit_price,
                   vat_rate, discount_percent, total_ht, total_vat
            FROM quote_lines
            WHERE quote_id = :qid ORDER BY position
        """),
        {"qid": quote_id},
    )
    lines = [dict(r._mapping) for r in lines_result.fetchall()]

    # Type de document
    doc_type_raw = quote.get("document_type", "devis")
    doc_type_map = {
        "devis": "Devis",
        "bpu": "Bordereau de prix",
        "attachement": "Attachement",
    }
    doc_type_label = doc_type_map.get(doc_type_raw, doc_type_raw.capitalize() if doc_type_raw else "Devis")
    doc_number = quote["number"] or "-"

    # Vendeur (org live, les devis ne figent pas les snapshots)
    seller = await _get_org_info(org_id, db)

    # Client
    if quote["client_id"]:
        client = await _get_client_info(quote["client_id"], org_id, db)
    else:
        client = {"name": quote.get("client_name") or "-"}

    # Logo
    logo_b64, logo_mime = await _get_org_logo(org_id, db)

    # Colonnes + options d'en-tête (per document type)
    columns, show_logo, show_company_name = await _get_document_columns(org_id, db, doc_type_raw)

    # Rounding + formatage des lignes
    rounding = await _get_rounding_config(org_id, db)
    lines = _format_lines(lines, rounding)

    # Ventilation TVA
    vat_breakdown = _compute_vat_breakdown(lines)

    # Remise globale
    discount_label = None
    discount_amount = "0"
    if quote.get("discount_type") and quote["discount_type"] != "none" and Decimal(str(quote.get("discount_value", 0) or 0)) > 0:
        if quote["discount_type"] == "percent":
            discount_label = f'{quote["discount_value"]}%'
        else:
            discount_label = "fixe"
        discount_amount = str(
            (Decimal(str(quote["subtotal_ht"])) * Decimal(str(quote["discount_value"])) / 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ) if quote["discount_type"] == "percent"
            else Decimal(str(quote["discount_value"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        )

    # Style + mentions legales + options pied de page
    style, org_footer, footer_options = await _get_print_config(org_id, db)
    template_name = f"pdf/{style}.html"

    # Footer : priorité au footer du document, sinon footer org
    footer = quote.get("footer") or org_footer

    # Note de règlement depuis le profil de facturation
    payment_note = await _get_payment_note_from_profile(org_id, db)

    context = {
        "title": f"{doc_type_label} {doc_number}",
        "doc_type_label": doc_type_label,
        "doc_number": doc_number,
        "issue_date": str(quote["issue_date"]) if quote.get("issue_date") else "",
        "due_date": str(quote["expiry_date"]) if quote.get("expiry_date") else None,
        "customer_reference": None,
        "purchase_order_number": None,
        "seller": seller,
        "client": client,
        "client_label": "Destinataire",
        "logo_b64": logo_b64 if show_logo else None,
        "logo_mime": logo_mime if show_logo else None,
        "show_company_name": show_company_name,
        "columns": columns,
        "lines": lines,
        "subtotal_ht": str(quote["subtotal_ht"]),
        "total_vat": str(quote["total_vat"]),
        "total_ttc": str(quote["total_ttc"]),
        "amount_paid": "0",
        "remaining": str(quote["total_ttc"]),
        "discount_label": discount_label,
        "discount_amount": discount_amount,
        "vat_breakdown": vat_breakdown,
        "payment_method": None,
        "bank_details": None,
        "notes": quote.get("notes"),
        "footer": footer,
        "payment_note": payment_note,
        "footer_options": footer_options,
    }

    pdf_bytes = _render_pdf(template_name, context)
    filename = _safe_filename(f"{doc_type_label.replace(' ', '_')}_{doc_number.replace('/', '-')}.pdf")

    # Backup automatique vers le stockage configuré (arborescence Kerpta)
    try:
        remote_path = await storage_svc.build_document_path(
            org_id, db,
            doc_type="devis",
            filename=filename,
            client_id=quote["client_id"],
        )
        pdf_url = await storage_svc.upload_document(org_id, pdf_bytes, remote_path, db)
        if pdf_url:
            await db.execute(
                text("UPDATE quotes SET pdf_url = :url, updated_at = now() WHERE id = :qid"),
                {"url": pdf_url, "qid": quote_id},
            )
            await db.commit()
            _log.info("PDF devis sauvegardé : %s", remote_path)
    except Exception as e:
        _log.warning("Backup PDF devis échoué (non bloquant) : %s", e)

    return pdf_bytes, filename
