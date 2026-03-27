# Kerpta - Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

"""Service de messagerie integre.

Pipeline anti-spam a 4 couches :
  1. Stalwart (SPF/DKIM/DMARC, filtrage PJ)         - gratuit
  2. Pre-tri Celery (expediteur connu, headers)      - gratuit
  3. Tesseract OCR + scoring mots-cles               - gratuit
  4. Claude Sonnet Vision (extraction structuree)     - ~0.01$/doc

Toutes les requetes filtrent sur organization_id.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
import string
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from email import policy
from email.parser import BytesParser

import httpx
from sqlalchemy import func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

_log = logging.getLogger(__name__)

# ── Mots-cles pour le scoring OCR (couche 3) ────────────────────────────────

_POSITIVE_KEYWORDS: list[tuple[str, int]] = [
    # Francais
    (r"\bfacture\b", 3),
    (r"\bavoir\b", 3),
    (r"\bbon\s+de\s+(commande|livraison)\b", 3),
    (r"\btotal\s*(ht|ttc)?\b", 2),
    (r"\bh\.?t\.?\b", 2),
    (r"\bt\.?t\.?c\.?\b", 2),
    (r"\bt\.?v\.?a\.?\b", 2),
    (r"\bsiret\b", 2),
    (r"\bsiren\b", 2),
    (r"\d{9,14}", 1),  # sequence de chiffres (SIRET/SIREN)
    (r"\bdate\b", 1),
    (r"\becheance\b", 1),
    (r"\breglement\b", 1),
    (r"\d+[.,]\d{2}\s*€", 1),  # montant en euros
    (r"\beur\b", 1),
    # Anglais
    (r"\binvoice\b", 3),
    (r"\bcredit\s*note\b", 3),
    (r"\bpurchase\s*order\b", 3),
    # Notes de frais
    (r"\bticket\b", 2),
    (r"\brecu\b", 2),
    (r"\bcarte\s*bancaire\b", 2),
    (r"\bcb\b", 1),
]

_NEGATIVE_KEYWORDS: list[tuple[str, int]] = [
    (r"\bunsubscribe\b", -5),
    (r"\bnewsletter\b", -5),
    (r"\bclick\s*here\b", -3),
    (r"\bpromotion\b", -3),
    (r"\bmarketing\b", -3),
    (r"\bse\s*desinscrire\b", -5),
    (r"\bpub\b", -2),
]

# Seuils de decision
SCORE_ACCEPT = 5  # >= 5 : document probable, envoyer en couche 4
SCORE_QUARANTINE = 2  # 2-4 : quarantaine "document suspect"
# < 2 : poubelle


def _generate_short_code(length: int = 6) -> str:
    """Genere un code court alphanumerique minuscule."""
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ── Gestion des comptes Stalwart ──────────────────────────────────────────────


async def _stalwart_api(
    method: str,
    path: str,
    payload: dict | None = None,
) -> dict | None:
    """Appel HTTP a l'API admin de Stalwart."""
    url = f"{settings.STALWART_API_URL}{path}"
    headers = {
        "Authorization": f"Bearer {settings.STALWART_ADMIN_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(method, url, headers=headers, json=payload)
        if resp.status_code >= 400:
            _log.error(
                "Stalwart API %s %s -> %s : %s",
                method,
                path,
                resp.status_code,
                resp.text,
            )
            return None
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()


async def setup_org_mail(
    org_id: uuid.UUID,
    siren: str,
    db: AsyncSession,
) -> dict:
    """Provisionne les boites mail pour une organisation.

    Cree les comptes Stalwart + sauvegarde la config en base.
    Retourne la config creee.
    """
    domain = settings.MAIL_DOMAIN

    send_address = f"fact-{siren}@{domain}"
    receive_address = f"{siren}@{domain}"

    # Verifier si deja configure
    result = await db.execute(
        text("SELECT id FROM mail_configs WHERE organization_id = :oid"),
        {"oid": str(org_id)},
    )
    if result.fetchone():
        return {"error": "Configuration mail deja existante", "status": "exists"}

    # Creer les comptes dans Stalwart
    send_account = await _stalwart_api("POST", "/api/account", {
        "name": send_address,
        "type": "individual",
        "email": [send_address],
        "description": f"Kerpta envoi - SIREN {siren}",
    })

    receive_account = await _stalwart_api("POST", "/api/account", {
        "name": receive_address,
        "type": "individual",
        "email": [receive_address],
        "description": f"Kerpta reception - SIREN {siren}",
    })

    # Generer la cle DKIM
    dkim_result = await _stalwart_api("POST", "/api/dkim", {
        "domain": domain,
        "selector": "kerpta",
        "algorithm": "rsa",
    })

    dkim_private = None
    dkim_public = None
    if dkim_result:
        dkim_private = dkim_result.get("privateKey")
        dkim_public = dkim_result.get("publicKey")

    # Sauvegarder en base
    config_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO mail_configs (
                id, organization_id, siren,
                send_address, receive_address,
                dkim_private_key, dkim_public_key, dkim_selector,
                stalwart_send_account_id, stalwart_receive_account_id,
                is_active, created_at, updated_at
            ) VALUES (
                :id, :org_id, :siren,
                :send, :receive,
                :dkim_priv, :dkim_pub, 'kerpta',
                :send_acc, :recv_acc,
                true, NOW(), NOW()
            )
        """),
        {
            "id": str(config_id),
            "org_id": str(org_id),
            "siren": siren,
            "send": send_address,
            "receive": receive_address,
            "dkim_priv": dkim_private,
            "dkim_pub": dkim_public,
            "send_acc": send_account.get("id") if send_account else None,
            "recv_acc": receive_account.get("id") if receive_account else None,
        },
    )
    await db.commit()

    # Alimenter la whitelist avec les domaines des fournisseurs existants
    await _seed_sender_list_from_suppliers(org_id, db)

    return {
        "status": "ok",
        "send_address": send_address,
        "receive_address": receive_address,
        "dns_records": _build_dns_records(domain, dkim_public),
    }


async def _seed_sender_list_from_suppliers(
    org_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Ajoute les domaines email des fournisseurs existants a la whitelist."""
    result = await db.execute(
        text("""
            SELECT id, email FROM suppliers
            WHERE organization_id = :oid AND email IS NOT NULL AND email != ''
        """),
        {"oid": str(org_id)},
    )
    for row in result.fetchall():
        supplier_id, email = row
        domain = email.split("@")[-1].lower() if "@" in email else None
        if not domain:
            continue
        # UPSERT : si le domaine existe deja, on ne fait rien
        await db.execute(
            text("""
                INSERT INTO mail_sender_list (
                    id, organization_id, email_domain, email_address,
                    supplier_id, is_blacklisted, created_at
                ) VALUES (
                    :id, :oid, :domain, :email, :sid, false, NOW()
                )
                ON CONFLICT (organization_id, email_domain) DO NOTHING
            """),
            {
                "id": str(uuid.uuid4()),
                "oid": str(org_id),
                "domain": domain,
                "email": email,
                "sid": str(supplier_id),
            },
        )
    await db.commit()


async def create_employee_mail(
    org_id: uuid.UUID,
    employee_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """Cree une adresse de notes de frais pour un employe."""
    # Recuperer le SIREN de l'org
    result = await db.execute(
        text("SELECT siren FROM mail_configs WHERE organization_id = :oid"),
        {"oid": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return {"error": "Configuration mail non initialisee"}

    siren = row[0]
    domain = settings.MAIL_DOMAIN

    # Generer un code court unique
    for _ in range(10):
        short_code = _generate_short_code()
        check = await db.execute(
            text("""
                SELECT 1 FROM employee_mail_addresses
                WHERE organization_id = :oid AND short_code = :code
            """),
            {"oid": str(org_id), "code": short_code},
        )
        if not check.fetchone():
            break
    else:
        return {"error": "Impossible de generer un code unique"}

    email_address = f"{siren}-{short_code}@{domain}"

    # Creer le compte Stalwart
    stalwart_result = await _stalwart_api("POST", "/api/account", {
        "name": email_address,
        "type": "individual",
        "email": [email_address],
        "description": f"Kerpta NDF - {siren}-{short_code}",
    })

    # Sauvegarder en base
    addr_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO employee_mail_addresses (
                id, organization_id, employee_id,
                short_code, email_address,
                stalwart_account_id, is_active, created_at
            ) VALUES (
                :id, :oid, :eid,
                :code, :email,
                :acc_id, true, NOW()
            )
        """),
        {
            "id": str(addr_id),
            "oid": str(org_id),
            "eid": str(employee_id),
            "code": short_code,
            "email": email_address,
            "acc_id": stalwart_result.get("id") if stalwart_result else None,
        },
    )
    await db.commit()

    return {"email_address": email_address, "short_code": short_code}


# ── Lecture de la config ──────────────────────────────────────────────────────


async def get_mail_config(
    org_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """Retourne la config mail de l'org + adresses employes + DNS requis."""
    result = await db.execute(
        text("""
            SELECT id, siren, send_address, receive_address,
                   is_active, dkim_public_key, dkim_selector,
                   created_at, updated_at
            FROM mail_configs WHERE organization_id = :oid
        """),
        {"oid": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return {
            "configured": False,
            "is_active": False,
            "send_address": None,
            "receive_address": None,
            "employee_addresses": [],
            "dns_records": [],
        }

    (
        config_id, siren, send_addr, recv_addr,
        is_active, dkim_pub, dkim_sel,
        created_at, updated_at,
    ) = row

    # Adresses employes
    emp_result = await db.execute(
        text("""
            SELECT ema.email_address, ema.short_code, ema.is_active,
                   e.first_name, e.last_name
            FROM employee_mail_addresses ema
            JOIN employees e ON e.id = ema.employee_id
            WHERE ema.organization_id = :oid
            ORDER BY e.last_name, e.first_name
        """),
        {"oid": str(org_id)},
    )
    employee_addresses = [
        {
            "email": r[0],
            "short_code": r[1],
            "is_active": r[2],
            "employee_name": f"{r[3]} {r[4]}",
        }
        for r in emp_result.fetchall()
    ]

    domain = settings.MAIL_DOMAIN
    dns_records = _build_dns_records(domain, dkim_pub)

    return {
        "configured": True,
        "is_active": is_active,
        "send_address": send_addr,
        "receive_address": recv_addr,
        "employee_addresses": employee_addresses,
        "dns_records": dns_records,
        "dkim_selector": dkim_sel,
        "created_at": created_at.isoformat() if created_at else None,
    }


def _build_dns_records(domain: str, dkim_public_key: str | None) -> list[dict]:
    """Construit la liste des enregistrements DNS requis."""
    records = [
        {
            "type": "MX",
            "name": domain,
            "value": f"10 {domain}.",
            "description": "Enregistrement MX - dirige les emails vers le serveur",
        },
        {
            "type": "TXT",
            "name": domain,
            "value": f"v=spf1 a:{domain} -all",
            "description": "SPF - autorise uniquement ce serveur a envoyer des emails",
        },
        {
            "type": "TXT",
            "name": f"_dmarc.{domain}",
            "value": "v=DMARC1; p=reject; rua=mailto:dmarc@{domain}; adkim=s; aspf=s",
            "description": "DMARC - politique de rejet strict avec reporting",
        },
    ]

    if dkim_public_key:
        records.append({
            "type": "TXT",
            "name": f"kerpta._domainkey.{domain}",
            "value": f"v=DKIM1; k=rsa; p={dkim_public_key}",
            "description": "DKIM - signature cryptographique des emails sortants",
        })

    # Enregistrement A ou CNAME (le serveur doit pointer vers le VPS)
    records.append({
        "type": "A",
        "name": domain,
        "value": "<IP_DU_VPS>",
        "description": "Enregistrement A - doit pointer vers l'IP du serveur Kerpta",
    })

    return records


# ── Pipeline de traitement entrant ────────────────────────────────────────────


async def process_incoming_email(
    raw_email: bytes,
    target_address: str,
    db: AsyncSession,
) -> dict:
    """Point d'entree du pipeline de traitement des emails entrants.

    Couche 2 (pre-tri) + couche 3 (OCR scoring) + routage.
    La couche 1 (SPF/DKIM) est geree par Stalwart en amont.
    La couche 4 (Claude extraction) est declenchee si score >= SCORE_ACCEPT.
    """
    # Parser l'email
    parser = BytesParser(policy=policy.default)
    msg = parser.parsebytes(raw_email)

    from_addr = msg.get("From", "")
    subject = msg.get("Subject", "")
    # Extraire l'adresse seule du From
    from_email = _extract_email(from_addr)

    # Identifier l'organisation via l'adresse cible
    org_data = await _resolve_org_from_address(target_address, db)
    if not org_data:
        _log.warning("Email recu pour adresse inconnue: %s", target_address)
        return {"status": "rejected", "reason": "unknown_address"}

    org_id = org_data["org_id"]
    address_type = org_data["type"]  # "receive" / "expense"

    # Extraire les pieces jointes
    attachments = _extract_attachments(msg)
    attachment_names = [a["filename"] for a in attachments]

    # Creer l'entree dans mail_queue
    queue_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO mail_queue (
                id, organization_id, direction,
                from_address, to_address, subject,
                status, attachment_count, created_at
            ) VALUES (
                :id, :oid, 'inbound',
                :from, :to, :subject,
                'processing', :att_count, NOW()
            )
        """),
        {
            "id": str(queue_id),
            "oid": str(org_id),
            "from": from_email,
            "to": target_address,
            "subject": subject[:500] if subject else None,
            "att_count": len(attachments),
        },
    )
    await db.commit()

    # ── Couche 2 : Pre-tri ────────────────────────────────────────────────

    # Pas de piece jointe ? Poubelle (sauf si c'est un email texte pour NDF)
    if not attachments and address_type != "expense":
        await _update_queue_status(queue_id, "rejected", db, error="Pas de piece jointe")
        return {"status": "rejected", "reason": "no_attachment"}

    # Verifier la blacklist
    from_domain = from_email.split("@")[-1].lower() if "@" in from_email else ""
    blacklisted = await db.execute(
        text("""
            SELECT 1 FROM mail_sender_list
            WHERE organization_id = :oid
            AND email_domain = :domain
            AND is_blacklisted = true
        """),
        {"oid": str(org_id), "domain": from_domain},
    )
    if blacklisted.fetchone():
        await _update_queue_status(queue_id, "rejected", db, error="Expediteur blackliste")
        return {"status": "rejected", "reason": "blacklisted"}

    # Pour les NDF : verifier que le FROM correspond a l'email de l'employe
    if address_type == "expense":
        employee_check = await _verify_expense_sender(
            org_id, target_address, from_email, db
        )
        if not employee_check:
            await _update_queue_status(queue_id, "rejected", db, error="Expediteur non autorise pour NDF")
            return {"status": "rejected", "reason": "unauthorized_expense_sender"}

    # Expediteur connu ? (domaine dans la whitelist)
    known_sender = await db.execute(
        text("""
            SELECT 1 FROM mail_sender_list
            WHERE organization_id = :oid
            AND email_domain = :domain
            AND is_blacklisted = false
        """),
        {"oid": str(org_id), "domain": from_domain},
    )
    sender_is_known = known_sender.fetchone() is not None

    # Headers suspects
    spam_headers = _check_spam_headers(msg)
    if spam_headers:
        await _update_queue_status(queue_id, "rejected", db, error=f"Headers spam: {spam_headers}")
        return {"status": "rejected", "reason": "spam_headers"}

    # ── Couche 3 : OCR + scoring ──────────────────────────────────────────

    score = 0.0
    for attachment in attachments:
        if attachment["content_type"] in (
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/jpg",
        ):
            ocr_text = await _ocr_attachment(attachment["data"], attachment["content_type"])
            score += _score_text(ocr_text)

    # Mettre a jour le score
    await db.execute(
        text("UPDATE mail_queue SET spam_score = :score WHERE id = :id"),
        {"score": score, "id": str(queue_id)},
    )
    await db.commit()

    # Routing
    if not sender_is_known and score < SCORE_QUARANTINE:
        # Expediteur inconnu + score bas : poubelle
        await _update_queue_status(queue_id, "rejected", db, error="Score trop bas")
        return {"status": "rejected", "reason": "low_score"}

    if not sender_is_known or score < SCORE_ACCEPT:
        # Expediteur inconnu OU score moyen : quarantaine
        reason = "unknown_sender" if not sender_is_known else "low_score"
        await _route_to_quarantine(
            queue_id, org_id, reason, from_email, subject, attachments, db
        )
        return {"status": "quarantined", "reason": reason}

    # Score OK + expediteur connu : couche 4 (extraction IA)
    # Lancer la tache Celery pour l'extraction
    await _update_queue_status(queue_id, "processing", db)
    return {
        "status": "processing",
        "queue_id": str(queue_id),
        "score": score,
        "needs_extraction": True,
    }


async def _resolve_org_from_address(
    address: str,
    db: AsyncSession,
) -> dict | None:
    """Identifie l'organisation et le type d'adresse a partir de l'adresse cible."""
    address = address.lower().strip()

    # Adresse de reception : {SIREN}@{domain}
    result = await db.execute(
        text("SELECT organization_id FROM mail_configs WHERE receive_address = :addr"),
        {"addr": address},
    )
    row = result.fetchone()
    if row:
        return {"org_id": uuid.UUID(str(row[0])), "type": "receive"}

    # Adresse NDF : {SIREN}-{short_code}@{domain}
    result = await db.execute(
        text("""
            SELECT organization_id FROM employee_mail_addresses
            WHERE email_address = :addr AND is_active = true
        """),
        {"addr": address},
    )
    row = result.fetchone()
    if row:
        return {"org_id": uuid.UUID(str(row[0])), "type": "expense"}

    return None


async def _verify_expense_sender(
    org_id: uuid.UUID,
    target_address: str,
    from_email: str,
    db: AsyncSession,
) -> bool:
    """Verifie que l'expediteur est bien l'employe associe a l'adresse NDF."""
    result = await db.execute(
        text("""
            SELECT e.email FROM employee_mail_addresses ema
            JOIN employees e ON e.id = ema.employee_id
            WHERE ema.email_address = :addr
            AND ema.organization_id = :oid
        """),
        {"addr": target_address.lower(), "oid": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return False
    employee_email = (row[0] or "").lower()
    return employee_email == from_email.lower()


def _extract_email(from_header: str) -> str:
    """Extrait l'adresse email pure d'un header From."""
    match = re.search(r"<([^>]+)>", from_header)
    if match:
        return match.group(1).lower()
    # Pas de chevrons, c'est directement l'adresse
    return from_header.strip().lower()


def _extract_attachments(msg) -> list[dict]:
    """Extrait les pieces jointes d'un email parse."""
    attachments = []
    for part in msg.walk():
        content_disposition = str(part.get("Content-Disposition", ""))
        if "attachment" in content_disposition or "inline" in content_disposition:
            content_type = part.get_content_type()
            filename = part.get_filename() or "unknown"
            data = part.get_payload(decode=True)
            if data and content_type in (
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/jpg",
                "application/octet-stream",
            ):
                attachments.append({
                    "filename": filename,
                    "content_type": content_type,
                    "data": data,
                    "size": len(data),
                })
    return attachments


def _check_spam_headers(msg) -> str | None:
    """Verifie les headers suspects dans un email."""
    suspicious = []

    # X-Spam headers
    for header in ("X-Spam-Status", "X-Spam-Flag"):
        value = msg.get(header, "")
        if value and ("yes" in value.lower() or "true" in value.lower()):
            suspicious.append(f"{header}: {value}")

    # Precedence: bulk
    precedence = msg.get("Precedence", "").lower()
    if precedence in ("bulk", "junk"):
        suspicious.append(f"Precedence: {precedence}")

    # List-Unsubscribe (newsletter)
    if msg.get("List-Unsubscribe"):
        suspicious.append("List-Unsubscribe present")

    return "; ".join(suspicious) if suspicious else None


async def _ocr_attachment(data: bytes, content_type: str) -> str:
    """Extrait le texte d'une piece jointe via Tesseract OCR.

    Pour les PDF, convertit chaque page en image puis OCR.
    Retourne le texte brut concatene.
    """
    try:
        if content_type == "application/pdf":
            return await _ocr_pdf(data)
        else:
            return await _ocr_image(data)
    except Exception as exc:
        _log.warning("Erreur OCR : %s", exc)
        return ""


async def _ocr_pdf(data: bytes) -> str:
    """OCR d'un PDF via pdf2image + Tesseract."""
    try:
        import io

        from pdf2image import convert_from_bytes
        import pytesseract

        images = convert_from_bytes(data, first_page=1, last_page=3)  # max 3 pages
        texts = []
        for img in images:
            text_content = pytesseract.image_to_string(img, lang="fra+eng")
            texts.append(text_content)
        return "\n".join(texts)
    except ImportError:
        _log.warning("pdf2image ou pytesseract non installe - OCR PDF desactive")
        return ""
    except Exception as exc:
        _log.warning("Erreur OCR PDF : %s", exc)
        return ""


async def _ocr_image(data: bytes) -> str:
    """OCR d'une image via Tesseract."""
    try:
        import io

        from PIL import Image
        import pytesseract

        img = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(img, lang="fra+eng")
    except ImportError:
        _log.warning("pytesseract non installe - OCR image desactive")
        return ""
    except Exception as exc:
        _log.warning("Erreur OCR image : %s", exc)
        return ""


def _score_text(text_content: str) -> float:
    """Calcule un score de pertinence a partir du texte OCR."""
    if not text_content:
        return 0.0

    text_lower = text_content.lower()
    score = 0.0

    for pattern, points in _POSITIVE_KEYWORDS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            score += points  # On ne compte qu'une fois par mot-cle

    for pattern, points in _NEGATIVE_KEYWORDS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            score += points  # points negatifs

    return score


async def _route_to_quarantine(
    queue_id: uuid.UUID,
    org_id: uuid.UUID,
    reason: str,
    from_address: str,
    subject: str | None,
    attachments: list[dict],
    db: AsyncSession,
) -> None:
    """Place un email en quarantaine."""
    await _update_queue_status(queue_id, "quarantined", db)

    quarantine_id = uuid.uuid4()
    attachment_names = json.dumps([a["filename"] for a in attachments])

    await db.execute(
        text("""
            INSERT INTO mail_quarantine (
                id, organization_id, mail_queue_id,
                reason, from_address, subject,
                attachment_names, created_at
            ) VALUES (
                :id, :oid, :qid,
                :reason, :from, :subject,
                CAST(:att_names AS jsonb), NOW()
            )
        """),
        {
            "id": str(quarantine_id),
            "oid": str(org_id),
            "qid": str(queue_id),
            "reason": reason,
            "from": from_address,
            "subject": subject[:500] if subject else None,
            "att_names": attachment_names,
        },
    )
    await db.commit()


async def _update_queue_status(
    queue_id: uuid.UUID,
    status: str,
    db: AsyncSession,
    error: str | None = None,
) -> None:
    """Met a jour le statut d'un email dans la queue."""
    params: dict = {"id": str(queue_id), "status": status}
    error_clause = ""
    processed_clause = ""

    if error:
        error_clause = ", error_message = :error"
        params["error"] = error

    if status in ("delivered", "failed", "rejected"):
        processed_clause = ", processed_at = NOW()"

    await db.execute(
        text(f"""
            UPDATE mail_queue
            SET status = :status{error_clause}{processed_clause}
            WHERE id = :id
        """),
        params,
    )
    await db.commit()


# ── Quarantaine : actions ─────────────────────────────────────────────────────


async def approve_quarantined(
    quarantine_id: uuid.UUID,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """Approuve un email en quarantaine - relance le traitement."""
    result = await db.execute(
        text("""
            SELECT mq.id, mq.from_address, mq.to_address
            FROM mail_quarantine mqa
            JOIN mail_queue mq ON mq.id = mqa.mail_queue_id
            WHERE mqa.id = :qid AND mqa.organization_id = :oid AND mqa.action IS NULL
        """),
        {"qid": str(quarantine_id), "oid": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return {"error": "Email non trouve ou deja traite"}

    queue_id = row[0]
    from_addr = row[1]

    # Marquer comme approuve
    await db.execute(
        text("""
            UPDATE mail_quarantine
            SET action = 'approved', action_by = :uid, action_at = NOW()
            WHERE id = :qid
        """),
        {"uid": str(user_id), "qid": str(quarantine_id)},
    )

    # Ajouter le domaine de l'expediteur en whitelist
    from_domain = from_addr.split("@")[-1].lower() if "@" in from_addr else ""
    if from_domain:
        await db.execute(
            text("""
                INSERT INTO mail_sender_list (
                    id, organization_id, email_domain, email_address,
                    is_blacklisted, created_at
                ) VALUES (
                    :id, :oid, :domain, :email, false, NOW()
                )
                ON CONFLICT (organization_id, email_domain) DO NOTHING
            """),
            {
                "id": str(uuid.uuid4()),
                "oid": str(org_id),
                "domain": from_domain,
                "email": from_addr,
            },
        )

    # Remettre en file d'attente pour traitement couche 4
    await _update_queue_status(uuid.UUID(str(queue_id)), "pending", db)
    await db.commit()

    return {"status": "approved", "queue_id": str(queue_id)}


async def reject_quarantined(
    quarantine_id: uuid.UUID,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    blacklist_sender: bool,
    db: AsyncSession,
) -> dict:
    """Rejette un email en quarantaine."""
    result = await db.execute(
        text("""
            SELECT mq.id, mq.from_address
            FROM mail_quarantine mqa
            JOIN mail_queue mq ON mq.id = mqa.mail_queue_id
            WHERE mqa.id = :qid AND mqa.organization_id = :oid AND mqa.action IS NULL
        """),
        {"qid": str(quarantine_id), "oid": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return {"error": "Email non trouve ou deja traite"}

    queue_id = row[0]
    from_addr = row[1]

    # Marquer comme rejete
    await db.execute(
        text("""
            UPDATE mail_quarantine
            SET action = 'rejected', action_by = :uid, action_at = NOW(),
                blacklist_sender = :bl
            WHERE id = :qid
        """),
        {"uid": str(user_id), "qid": str(quarantine_id), "bl": blacklist_sender},
    )

    # Blacklister si demande
    if blacklist_sender:
        from_domain = from_addr.split("@")[-1].lower() if "@" in from_addr else ""
        if from_domain:
            await db.execute(
                text("""
                    INSERT INTO mail_sender_list (
                        id, organization_id, email_domain, email_address,
                        is_blacklisted, created_at
                    ) VALUES (
                        :id, :oid, :domain, :email, true, NOW()
                    )
                    ON CONFLICT (organization_id, email_domain)
                    DO UPDATE SET is_blacklisted = true
                """),
                {
                    "id": str(uuid.uuid4()),
                    "oid": str(org_id),
                    "domain": from_domain,
                    "email": from_addr,
                },
            )

    await _update_queue_status(uuid.UUID(str(queue_id)), "rejected", db)
    await db.commit()

    return {"status": "rejected"}


# ── Quarantaine : lecture ─────────────────────────────────────────────────────


async def list_quarantine(
    org_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Liste les emails en quarantaine (en attente d'action)."""
    offset = (page - 1) * page_size

    # Total
    count_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM mail_quarantine
            WHERE organization_id = :oid AND action IS NULL
        """),
        {"oid": str(org_id)},
    )
    total = count_result.scalar() or 0

    # Items
    result = await db.execute(
        text("""
            SELECT id, mail_queue_id, reason, from_address, subject,
                   preview_text, attachment_names, action, created_at
            FROM mail_quarantine
            WHERE organization_id = :oid AND action IS NULL
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"oid": str(org_id), "limit": page_size, "offset": offset},
    )
    items = []
    for row in result.fetchall():
        items.append({
            "id": str(row[0]),
            "mail_queue_id": str(row[1]),
            "reason": row[2],
            "from_address": row[3],
            "subject": row[4],
            "preview_text": row[5],
            "attachment_names": row[6],
            "action": row[7],
            "created_at": row[8].isoformat() if row[8] else None,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── Envoi de documents ────────────────────────────────────────────────────────


async def send_document_email(
    org_id: uuid.UUID,
    document_type: str,
    document_id: uuid.UUID,
    recipient_email: str,
    db: AsyncSession,
) -> dict:
    """Met en queue l'envoi d'un document (facture/devis) par email.

    Le vrai envoi est fait par la tache Celery send_document_email_task.
    """
    # Verifier la config mail
    result = await db.execute(
        text("""
            SELECT send_address, is_active FROM mail_configs
            WHERE organization_id = :oid
        """),
        {"oid": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[1]:
        return {"error": "Configuration mail non active"}

    send_address = row[0]

    # Creer l'entree dans la queue
    queue_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO mail_queue (
                id, organization_id, direction,
                from_address, to_address, subject,
                status, document_type, document_id,
                attachment_count, created_at
            ) VALUES (
                :id, :oid, 'outbound',
                :from, :to, :subject,
                'pending', :doc_type, :doc_id,
                1, NOW()
            )
        """),
        {
            "id": str(queue_id),
            "oid": str(org_id),
            "from": send_address,
            "to": recipient_email,
            "subject": f"Document {document_type}",
            "doc_type": document_type,
            "doc_id": str(document_id),
        },
    )
    await db.commit()

    return {"queue_id": str(queue_id), "status": "pending"}


# ── Historique ────────────────────────────────────────────────────────────────


async def list_mail_queue(
    org_id: uuid.UUID,
    db: AsyncSession,
    direction: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Liste l'historique des emails."""
    offset = (page - 1) * page_size
    where = "WHERE organization_id = :oid"
    params: dict = {"oid": str(org_id), "limit": page_size, "offset": offset}

    if direction:
        where += " AND direction = :dir"
        params["dir"] = direction

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM mail_queue {where}"),
        params,
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        text(f"""
            SELECT id, direction, from_address, to_address, subject,
                   status, document_type, attachment_count, spam_score,
                   created_at, processed_at
            FROM mail_queue {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = []
    for row in result.fetchall():
        items.append({
            "id": str(row[0]),
            "direction": row[1],
            "from_address": row[2],
            "to_address": row[3],
            "subject": row[4],
            "status": row[5],
            "document_type": row[6],
            "attachment_count": row[7],
            "spam_score": float(row[8]) if row[8] else None,
            "created_at": row[9].isoformat() if row[9] else None,
            "processed_at": row[10].isoformat() if row[10] else None,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}
