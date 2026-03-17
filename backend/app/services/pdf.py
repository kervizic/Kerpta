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

from markupsafe import Markup, escape
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from lxml import etree

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


def _nl2br(value: str) -> Markup:
    """Convertit les sauts de ligne en <br> pour le rendu HTML."""
    if not value:
        return Markup("")
    return Markup(escape(value).replace("\n", Markup("<br>")))


_jinja_env.filters["nl2br"] = _nl2br


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
        "show_footer_logo": config.get("footer_show_logo", False),
        "show_page_number": config.get("footer_show_page_number", True),
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
            SELECT name, siret, vat_number, billing_address,
                   email, company_siren, country_code
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
        "email": row[4],
        "siren": row[5],  # company_siren (9 chiffres)
        "country_code": row[6] or "FR",
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
        # Factures : colonnes uniques pour facture/avoir/proforma
        if document_type in ("facture", "avoir"):
            inv_cols = config.get("invoice_columns")
            if inv_cols:
                return inv_cols, show_logo, show_company_name

        # Devis : chercher dans les types de documents configurés
        doc_types = config.get("quote_document_types", [])
        for dt in doc_types:
            if dt.get("key") == document_type:
                return dt.get("columns", default_cols), show_logo, show_company_name

    return config.get("document_columns", default_cols), show_logo, show_company_name


def _compute_vat_breakdown(lines: list[dict]) -> list[dict]:
    """Calcule la ventilation TVA par taux (montant TVA + base HT)."""
    vat_amounts: dict[str, Decimal] = {}
    vat_bases: dict[str, Decimal] = {}
    for line in lines:
        rate = str(line.get("vat_rate", "0"))
        amount = Decimal(str(line.get("total_vat", "0")))
        base = Decimal(str(line.get("total_ht", "0")))
        vat_amounts[rate] = vat_amounts.get(rate, Decimal("0")) + amount
        vat_bases[rate] = vat_bases.get(rate, Decimal("0")) + base
    return [
        {
            "rate": rate,
            "amount": str(vat_amounts[rate].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "base": str(vat_bases[rate].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        }
        for rate in sorted(vat_amounts.keys(), key=lambda x: -Decimal(x))
        if vat_amounts[rate] != 0
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


# ── XML CII (Cross-Industry Invoice) — Factur-X + documents ──────────────────

# Namespaces CII
_NS = {
    "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}

# Mapping type de document Kerpta -> code UNTDID 1001
_DOCUMENT_TYPE_CODE = {
    "facture": "380",       # Facture commerciale
    "avoir": "381",         # Avoir / note de credit
    "proforma": "325",      # Facture proforma
    "devis": "310",         # Devis / offre
    "bpu": "310",           # Bordereau de prix (= offre)
    "attachement": "310",   # Attachement (= offre)
}

# Mapping mode de reglement -> code UNTDID 4461
_PAYMENT_MEANS_CODE = {
    "virement": "30",
    "cheque": "20",
    "chèque": "20",
    "carte": "48",
    "carte bancaire": "48",
    "prelevement": "49",
    "prélèvement": "49",
    "especes": "10",
    "espèces": "10",
}

# Mapping unites francaises -> codes UN/ECE Rec 20 pour Factur-X
_UNIT_CODE_MAP = {
    # Unites sans dimension
    "u": "C62", "unite": "C62", "unité": "C62", "pce": "C62", "piece": "C62",
    "pièce": "C62", "pc": "C62", "pcs": "C62", "lot": "C62",
    # Temps
    "h": "HUR", "heure": "HUR", "heures": "HUR", "hr": "HUR",
    "j": "DAY", "jour": "DAY", "jours": "DAY", "journee": "DAY", "journée": "DAY",
    "mois": "MON", "an": "ANN", "annee": "ANN", "année": "ANN",
    "min": "MIN", "minute": "MIN", "minutes": "MIN",
    # Longueur
    "m": "MTR", "metre": "MTR", "mètre": "MTR", "ml": "MTR",
    "km": "KMT", "cm": "CMT", "mm": "MMT",
    # Surface
    "m2": "MTK", "m²": "MTK",
    # Volume
    "m3": "MTQ", "m³": "MTQ", "l": "LTR", "litre": "LTR",
    # Poids
    "kg": "KGM", "t": "TNE", "tonne": "TNE", "g": "GRM",
    # Forfait
    "forfait": "C62", "ft": "C62", "ens": "C62", "ensemble": "C62",
}


def _unit_to_unece(unit: str | None) -> str:
    """Convertit une unite libre en code UN/ECE Rec 20 pour Factur-X."""
    if not unit:
        return "C62"
    unit_clean = unit.strip().lower()
    # Si c'est deja un code UN/ECE (2-3 lettres majuscules), le garder
    if unit.strip().isupper() and 2 <= len(unit.strip()) <= 3:
        return unit.strip()
    return _UNIT_CODE_MAP.get(unit_clean, "C62")


def _dec(value, default: str = "0.00") -> str:
    """Normalise une valeur en string decimale pour le XML CII.

    Garantit le format "123.45" (point decimal, pas de separateur de milliers,
    pas de symbole monétaire).
    """
    if value is None:
        return default
    try:
        return str(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except Exception:
        return default


def _el(parent: etree._Element, tag: str, text: str | None = None, **attrs) -> etree._Element:
    """Crée un sous-élément avec namespace résolu."""
    prefix, local = tag.split(":", 1)
    ns = _NS[prefix]
    elem = etree.SubElement(parent, f"{{{ns}}}{local}")
    if text is not None:
        elem.text = str(text)
    for attr_name, attr_val in attrs.items():
        elem.set(attr_name, str(attr_val))
    return elem


def _build_document_xml(
    doc_data: dict,
    seller: dict,
    client: dict,
    lines: list,
    vat_breakdown: list,
    *,
    type_code: str = "380",
) -> bytes:
    """Construit le XML CII (structure Factur-X EN 16931) pour tout document.

    Utilise la meme structure XML pour tous les types de documents (factures,
    avoirs, proformas, devis) afin de permettre un parsing uniforme.

    Args:
        doc_data: dictionnaire du document (issue_date, due_date, number, totaux, etc.)
        seller: infos vendeur
        client: infos client
        lines: lignes du document formatees
        vat_breakdown: ventilation TVA
        type_code: code UNTDID 1001 (380=facture, 381=avoir, 325=proforma, 310=devis)

    Returns:
        XML CII en bytes UTF-8
    """
    root = etree.Element(
        f"{{{_NS['rsm']}}}CrossIndustryInvoice",
        nsmap=_NS,
    )

    # ── ExchangedDocumentContext ──
    ctx = _el(root, "rsm:ExchangedDocumentContext")
    guide = _el(ctx, "ram:GuidelineSpecifiedDocumentContextParameter")
    _el(guide, "ram:ID", "urn:cen.eu:en16931:2017")

    # ── ExchangedDocument ──
    doc = _el(root, "rsm:ExchangedDocument")
    doc_number = doc_data.get("number") or doc_data.get("proforma_number") or "-"
    _el(doc, "ram:ID", doc_number)

    _el(doc, "ram:TypeCode", type_code)

    issue_date = doc_data.get("issue_date")
    if issue_date:
        issue_dt = _el(doc, "ram:IssueDateTime")
        _el(issue_dt, "udt:DateTimeString", str(issue_date).replace("-", ""), format="102")

    # Notes obligatoires FR CTC (BR-FR-05) - penalites, recouvrement, escompte
    _fr_notes = doc_data.get("legal_notes") or {}
    # PMD - penalites de retard
    note_pmd = _el(doc, "ram:IncludedNote")
    _el(note_pmd, "ram:Content", _fr_notes.get("pmd") or
        "En cas de retard de paiement, une penalite de 3 fois le taux d'interet legal sera appliquee.")
    _el(note_pmd, "ram:SubjectCode", "PMD")
    # PMT - frais de recouvrement
    note_pmt = _el(doc, "ram:IncludedNote")
    _el(note_pmt, "ram:Content", _fr_notes.get("pmt") or
        "Indemnite forfaitaire pour frais de recouvrement : 40 euros.")
    _el(note_pmt, "ram:SubjectCode", "PMT")
    # AAB - escompte
    note_aab = _el(doc, "ram:IncludedNote")
    _el(note_aab, "ram:Content", _fr_notes.get("aab") or
        "Pas d'escompte pour paiement anticipe.")
    _el(note_aab, "ram:SubjectCode", "AAB")

    # ── SupplyChainTradeTransaction ──
    txn = _el(root, "rsm:SupplyChainTradeTransaction")

    # --- Lignes ---
    for i, line in enumerate(lines, 1):
        item = _el(txn, "ram:IncludedSupplyChainTradeLineItem")

        line_doc = _el(item, "ram:AssociatedDocumentLineDocument")
        _el(line_doc, "ram:LineID", str(i))

        product = _el(item, "ram:SpecifiedTradeProduct")
        if line.get("reference"):
            _el(product, "ram:SellerAssignedID", line["reference"])
        # Extraire le nom sans la description multi-ligne pour le XML
        raw_desc = line.get("description") or "Article"
        _el(product, "ram:Name", raw_desc.split("\n")[0])

        line_agreement = _el(item, "ram:SpecifiedLineTradeAgreement")
        net_price = _el(line_agreement, "ram:NetPriceProductTradePrice")
        _el(net_price, "ram:ChargeAmount", _dec(line.get("unit_price")))

        line_delivery = _el(item, "ram:SpecifiedLineTradeDelivery")
        _el(line_delivery, "ram:BilledQuantity", _dec(line.get("quantity"), "1"),
            unitCode=_unit_to_unece(line.get("unit")))

        line_settlement = _el(item, "ram:SpecifiedLineTradeSettlement")
        line_tax = _el(line_settlement, "ram:ApplicableTradeTax")
        _el(line_tax, "ram:TypeCode", "VAT")
        _el(line_tax, "ram:CategoryCode", "S")
        _el(line_tax, "ram:RateApplicablePercent", _dec(line.get("vat_rate"), "0"))

        line_summation = _el(line_settlement, "ram:SpecifiedTradeSettlementLineMonetarySummation")
        _el(line_summation, "ram:LineTotalAmount", _dec(line.get("total_ht")))

    # --- HeaderTradeAgreement (vendeur / acheteur) ---
    agreement = _el(txn, "ram:ApplicableHeaderTradeAgreement")

    # Reference acheteur (doit etre AVANT SellerTradeParty dans le XSD)
    if doc_data.get("customer_reference"):
        _el(agreement, "ram:BuyerReference", doc_data["customer_reference"])

    # Vendeur
    seller_party = _el(agreement, "ram:SellerTradeParty")
    _el(seller_party, "ram:Name", seller.get("name") or "")
    # BT-30 : SIREN (9 chiffres) - BR-FR-10
    seller_siren = seller.get("siren") or ""
    if seller_siren:
        seller_id = _el(seller_party, "ram:SpecifiedLegalOrganization")
        _el(seller_id, "ram:ID", seller_siren, schemeID="0002")
    seller_addr = seller.get("address") or {}
    # PostalTradeAddress obligatoire avec au minimum CountryID
    postal = _el(seller_party, "ram:PostalTradeAddress")
    if seller_addr.get("code_postal"):
        _el(postal, "ram:PostcodeCode", seller_addr["code_postal"])
    if seller_addr.get("voie"):
        _el(postal, "ram:LineOne", seller_addr["voie"])
    if seller_addr.get("commune"):
        _el(postal, "ram:CityName", seller_addr["commune"])
    _el(postal, "ram:CountryID", "FR")
    # BT-34 : adresse electronique du vendeur (BR-FR-13)
    # Priorite : email, sinon SIREN comme identifiant electronique
    seller_email = seller.get("email") or ""
    seller_endpoint = _el(seller_party, "ram:URIUniversalCommunication")
    if seller_email:
        _el(seller_endpoint, "ram:URIID", seller_email, schemeID="EM")
    elif seller_siren:
        _el(seller_endpoint, "ram:URIID", seller_siren, schemeID="0002")
    if seller.get("vat_number"):
        seller_tax = _el(seller_party, "ram:SpecifiedTaxRegistration")
        _el(seller_tax, "ram:ID", seller["vat_number"], schemeID="VA")

    # Acheteur
    buyer_party = _el(agreement, "ram:BuyerTradeParty")
    _el(buyer_party, "ram:Name", client.get("name") or "")
    # BT-47 : SIREN acheteur (si disponible - pas obligatoire pour particuliers/etrangers)
    buyer_siren = client.get("siren") or ""
    if buyer_siren:
        buyer_id = _el(buyer_party, "ram:SpecifiedLegalOrganization")
        _el(buyer_id, "ram:ID", buyer_siren, schemeID="0002")
    client_addr = client.get("address") or {}
    # PostalTradeAddress obligatoire avec au minimum CountryID
    postal = _el(buyer_party, "ram:PostalTradeAddress")
    if client_addr.get("code_postal"):
        _el(postal, "ram:PostcodeCode", client_addr["code_postal"])
    if client_addr.get("voie"):
        _el(postal, "ram:LineOne", client_addr["voie"])
    if client_addr.get("commune"):
        _el(postal, "ram:CityName", client_addr["commune"])
    # Utiliser country_code du client (ISO 3166-1 alpha-2), pas le champ texte "pays"
    _el(postal, "ram:CountryID", client.get("country_code") or "FR")
    # BT-49 : adresse electronique de l'acheteur (BR-FR-12 - OBLIGATOIRE en FR CTC)
    # Cascade : email > SIREN > SIRET > n° TVA intracom > nom du client
    buyer_email = client.get("email") or ""
    buyer_endpoint = _el(buyer_party, "ram:URIUniversalCommunication")
    if buyer_email:
        _el(buyer_endpoint, "ram:URIID", buyer_email, schemeID="EM")
    elif buyer_siren:
        _el(buyer_endpoint, "ram:URIID", buyer_siren, schemeID="0002")
    elif client.get("siret"):
        _el(buyer_endpoint, "ram:URIID", client["siret"], schemeID="0002")
    elif client.get("vat_number"):
        _el(buyer_endpoint, "ram:URIID", client["vat_number"], schemeID="9906")
    else:
        # Particulier sans email ni identifiant : nom comme dernier recours
        _el(buyer_endpoint, "ram:URIID", client.get("name") or "INCONNU", schemeID="EM")
    if client.get("vat_number"):
        buyer_tax = _el(buyer_party, "ram:SpecifiedTaxRegistration")
        _el(buyer_tax, "ram:ID", client["vat_number"], schemeID="VA")

    # --- HeaderTradeDelivery (ne doit pas etre vide - PEPPOL-EN16931-R008) ---
    delivery = _el(txn, "ram:ApplicableHeaderTradeDelivery")
    # Date de livraison effective si disponible, sinon date d'emission comme fallback
    # En Factur-X, l'element ActualDeliverySupplyChainEvent est obligatoire
    # pour eviter PEPPOL-EN16931-R008 (element vide)
    delivery_date = doc_data.get("delivery_date") or issue_date
    if delivery_date:
        del_event = _el(delivery, "ram:ActualDeliverySupplyChainEvent")
        del_occ = _el(del_event, "ram:OccurrenceDateTime")
        _el(del_occ, "udt:DateTimeString", str(delivery_date).replace("-", ""), format="102")
    else:
        # Dernier recours : ShipToTradeParty vide est accepte par le XSD
        # pour eviter un element delivery totalement vide
        _el(delivery, "ram:ShipToTradeParty")

    # --- HeaderTradeSettlement ---
    settlement = _el(txn, "ram:ApplicableHeaderTradeSettlement")
    _el(settlement, "ram:InvoiceCurrencyCode", "EUR")

    # Moyen de paiement (seulement si on a un IBAN - BR-CO-27)
    payment_method = doc_data.get("payment_method") or ""
    bank = doc_data.get("bank_details")
    if isinstance(bank, str):
        try:
            bank = json.loads(bank)
        except Exception:
            bank = None
    if payment_method and bank and bank.get("iban"):
        means = _el(settlement, "ram:SpecifiedTradeSettlementPaymentMeans")
        means_code = _PAYMENT_MEANS_CODE.get(payment_method.lower().strip(), "30")
        _el(means, "ram:TypeCode", means_code)
        payee_account = _el(means, "ram:PayeePartyCreditorFinancialAccount")
        _el(payee_account, "ram:IBANID", bank["iban"])
        if bank.get("bic"):
            payee_institution = _el(means, "ram:PayeeSpecifiedCreditorFinancialInstitution")
            _el(payee_institution, "ram:BICID", bank["bic"])

    # Ventilation TVA (AVANT SpecifiedTradePaymentTerms dans le XSD)
    for vat_line in vat_breakdown:
        tax = _el(settlement, "ram:ApplicableTradeTax")
        _el(tax, "ram:CalculatedAmount", _dec(vat_line["amount"]))
        _el(tax, "ram:TypeCode", "VAT")
        _el(tax, "ram:BasisAmount", _dec(vat_line.get("base")))
        _el(tax, "ram:CategoryCode", "S")
        _el(tax, "ram:RateApplicablePercent", _dec(vat_line["rate"], "0"))

    # Conditions de paiement (APRES ApplicableTradeTax dans le XSD)
    if doc_data.get("due_date"):
        terms = _el(settlement, "ram:SpecifiedTradePaymentTerms")
        due_dt = _el(terms, "ram:DueDateDateTime")
        _el(due_dt, "udt:DateTimeString", str(doc_data["due_date"]).replace("-", ""), format="102")

    # Totaux
    summation = _el(settlement, "ram:SpecifiedTradeSettlementHeaderMonetarySummation")
    _el(summation, "ram:LineTotalAmount", _dec(doc_data.get("subtotal_ht")))
    _el(summation, "ram:TaxBasisTotalAmount", _dec(doc_data.get("subtotal_ht")))
    tax_total = _el(summation, "ram:TaxTotalAmount", _dec(doc_data.get("total_vat")))
    tax_total.set("currencyID", "EUR")
    _el(summation, "ram:GrandTotalAmount", _dec(doc_data.get("total_ttc")))
    _el(summation, "ram:DuePayableAmount", _dec(
        Decimal(str(doc_data.get("total_ttc") or 0)) - Decimal(str(doc_data.get("amount_paid") or 0))
    ))

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)


def _embed_facturx(pdf_bytes: bytes, xml_bytes: bytes, *, level: str = "en16931") -> bytes:
    """Embarque le XML Factur-X dans le PDF pour produire un PDF/A-3.

    Utilise la lib factur-x (generate_from_binary).
    check_xsd=False car on controle la generation XML et les validateurs
    externes (superepdp, Chorus Pro) feront la verification de conformite.
    """
    try:
        from facturx import generate_from_binary
        facturx_pdf = generate_from_binary(
            pdf_bytes,
            xml_bytes,
            flavor="factur-x",
            level=level,
            check_xsd=False,
        )
        _log.info("Factur-X XML embarque dans le PDF (level=%s, %d octets)", level, len(facturx_pdf))
        return facturx_pdf
    except Exception as exc:
        _log.error(
            "Impossible d'embarquer le XML Factur-X : %s\nXML (500 premiers octets) : %s",
            exc,
            xml_bytes[:500].decode("utf-8", errors="replace"),
        )
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
        # Completer les champs Factur-X manquants dans les anciens snapshots
        if "siren" not in client or "email" not in client:
            live_client = await _get_client_info(inv["client_id"], org_id, db)
            client.setdefault("siren", live_client.get("siren"))
            client.setdefault("email", live_client.get("email"))
            client.setdefault("country_code", live_client.get("country_code", "FR"))
            client.setdefault("siret", live_client.get("siret"))
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
        "issue_date": inv["issue_date"].strftime("%d/%m/%Y") if inv["issue_date"] else "",
        "due_date": inv["due_date"].strftime("%d/%m/%Y") if inv["due_date"] else None,
        "customer_reference": inv.get("customer_reference"),
        "purchase_order_number": inv.get("purchase_order_number"),
        "seller": seller,
        "client": client,
        "client_label": "Destinataire",
        "logo_b64": logo_b64,
        "logo_mime": logo_mime,
        "show_header_logo": show_logo,
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
        "payment_terms_label": "Comptant" if inv.get("payment_terms") == 0 else (f"{inv['payment_terms']} jours net" if inv.get("payment_terms") else None),
        "payment_method": inv.get("payment_method"),
        "bank_details": bank_details,
        "notes": inv.get("notes"),
        "footer": footer,
        "payment_note": payment_note,
        "footer_options": footer_options,
    }

    pdf_bytes = _render_pdf(template_name, context)

    # XML CII embarque dans tous les PDF (structure uniforme pour parsing Doctext)
    # - Factures/avoirs valides : Factur-X officiel (PDF/A-3, profil en16931)
    # - Proformas/brouillons : meme structure XML, TypeCode 325
    try:
        if inv["is_credit_note"]:
            xml_type_code = "381"  # avoir
        elif proforma or inv["status"] == "draft":
            xml_type_code = "325"  # proforma
        else:
            xml_type_code = "380"  # facture
        xml_bytes = _build_document_xml(
            inv, seller, client, lines, vat_breakdown,
            type_code=xml_type_code,
        )
        pdf_bytes = _embed_facturx(pdf_bytes, xml_bytes)
    except Exception:
        _log.warning("Erreur generation XML CII, PDF brut retourne", exc_info=True)

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
        "issue_date": quote["issue_date"].strftime("%d/%m/%Y") if quote.get("issue_date") else "",
        "due_date": quote["expiry_date"].strftime("%d/%m/%Y") if quote.get("expiry_date") else None,
        "customer_reference": None,
        "purchase_order_number": None,
        "seller": seller,
        "client": client,
        "client_label": "Destinataire",
        "logo_b64": logo_b64,
        "logo_mime": logo_mime,
        "show_header_logo": show_logo,
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
        "payment_terms_label": None,
        "payment_method": None,
        "bank_details": None,
        "notes": quote.get("notes"),
        "footer": footer,
        "payment_note": payment_note,
        "footer_options": footer_options,
    }

    pdf_bytes = _render_pdf(template_name, context)

    # XML CII embarque (meme structure que Factur-X pour parsing uniforme Doctext)
    try:
        xml_type_code = _DOCUMENT_TYPE_CODE.get(doc_type_raw, "310")
        # Construire un dict compatible avec _build_document_xml
        quote_as_doc = {
            "number": quote["number"],
            "issue_date": quote.get("issue_date"),
            "due_date": quote.get("expiry_date"),
            "subtotal_ht": quote["subtotal_ht"],
            "total_vat": quote["total_vat"],
            "total_ttc": quote["total_ttc"],
            "amount_paid": 0,
        }
        xml_bytes = _build_document_xml(
            quote_as_doc, seller, client, lines, vat_breakdown,
            type_code=xml_type_code,
        )
        pdf_bytes = _embed_facturx(pdf_bytes, xml_bytes)
    except Exception:
        _log.warning("Erreur generation XML CII devis, PDF brut retourne", exc_info=True)

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
