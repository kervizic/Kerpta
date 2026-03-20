# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service central IA : OCR, categorisation, chat, generation.

Communique avec LiteLLM via l'API OpenAI-compatible.
Chaque appel est logue dans ai_usage_logs.
"""

import base64
import json
import logging
import os
import time
import uuid

import httpx
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)


async def _get_ai_config(db: AsyncSession) -> dict:
    """Recupere la config IA depuis platform_config."""
    result = await db.execute(
        text("""
            SELECT ai_enabled, ai_litellm_base_url, ai_litellm_master_key,
                   ai_role_vl_model_id, ai_role_instruct_model_id, ai_role_thinking_model_id,
                   ai_features, ai_paddlex_url
            FROM platform_config LIMIT 1
        """)
    )
    row = result.fetchone()
    if not row or not row[0]:
        raise HTTPException(503, "Module IA non active sur la plateforme")
    return {
        "enabled": row[0],
        "litellm_url": row[1] or os.getenv("LITELLM_BASE_URL", "http://litellm:4000"),
        "litellm_key": row[2] or os.getenv("LITELLM_MASTER_KEY", ""),
        "vl_model_id": row[3],
        "instruct_model_id": row[4],
        "thinking_model_id": row[5],
        "features": row[6] or {},
        "paddlex_url": row[7],
    }


async def _resolve_model(db: AsyncSession, model_uuid: uuid.UUID | None) -> dict | None:
    """Resout un model_id UUID vers les infos necessaires pour l'appel LiteLLM."""
    if not model_uuid:
        return None
    result = await db.execute(
        text("""
            SELECT m.id, m.model_id, m.display_name, p.type, p.base_url, p.api_key
            FROM ai_models m
            JOIN ai_providers p ON p.id = m.provider_id
            WHERE m.id = :mid AND m.is_active = true AND p.is_active = true
        """),
        {"mid": str(model_uuid)},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "uuid": row[0],
        "model_id": row[1],
        "display_name": row[2],
        "provider_type": row[3],
        "base_url": row[4],
        "api_key": row[5],
        "litellm_name": f"{row[3]}/{row[1]}",
    }


async def _call_litellm(
    litellm_url: str,
    litellm_key: str,
    model_name: str,
    messages: list[dict],
    max_tokens: int = 4096,
    timeout: float = 120.0,
) -> dict:
    """Appelle LiteLLM en format OpenAI chat completions."""
    url = f"{litellm_url.rstrip('/')}/v1/chat/completions"
    body = {
        "model": model_name,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {litellm_key}"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "LiteLLM non joignable - verifiez la configuration")
    except httpx.TimeoutException:
        raise HTTPException(504, "LiteLLM timeout - le modele met trop de temps a repondre")
    except httpx.HTTPStatusError as exc:
        _log.warning("LiteLLM erreur %s: %s", exc.response.status_code, exc.response.text[:300])
        raise HTTPException(502, f"Erreur LiteLLM : {exc.response.status_code}")


async def _log_usage(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    model_uuid: uuid.UUID | None,
    role: str,
    tokens_in: int,
    tokens_out: int,
    duration_ms: int,
) -> None:
    """Enregistre un log d'usage IA."""
    await db.execute(
        text("""
            INSERT INTO ai_usage_logs (id, organization_id, user_id, model_id, role, tokens_in, tokens_out, duration_ms, created_at)
            VALUES (:id, :org, :user, :model, :role, :tin, :tout, :dur, now())
        """),
        {
            "id": str(uuid.uuid4()),
            "org": str(org_id),
            "user": str(user_id),
            "model": str(model_uuid) if model_uuid else None,
            "role": role,
            "tin": tokens_in,
            "tout": tokens_out,
            "dur": duration_ms,
        },
    )
    await db.commit()


# ── OCR (PaddleX Serving distant) ─────────────────────────────────────────────


def _downscale_pdf(file_bytes: bytes, dpi: int = 120) -> bytes:
    """Convertit chaque page du PDF en image JPEG basse resolution,
    puis reconstruit un PDF leger. Reduit la taille envoyee a PaddleX."""
    import fitz  # PyMuPDF
    from PIL import Image
    import io

    src = fitz.open(stream=file_bytes, filetype="pdf")
    dst = fitz.open()

    for page in src:
        pix = page.get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes("jpeg")))
        img_buf = io.BytesIO()
        img.save(img_buf, format="JPEG", quality=80)
        img_buf.seek(0)

        # Creer une page PDF avec l'image
        img_doc = fitz.open(stream=img_buf.read(), filetype="jpeg")
        rect = fitz.Rect(0, 0, pix.width * 72 / dpi, pix.height * 72 / dpi)
        new_page = dst.new_page(width=rect.width, height=rect.height)
        new_page.insert_image(rect, stream=img_doc.tobytes())
        img_doc.close()

    result = dst.tobytes(deflate=True)
    src.close()
    dst.close()
    return result


def _downscale_image(file_bytes: bytes, max_side: int = 1754) -> bytes:
    """Redimensionne une image si elle depasse max_side pixels."""
    from PIL import Image
    import io

    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    img = Image.open(io.BytesIO(file_bytes))
    if max(img.size) <= max_side:
        return file_bytes
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _merge_paddlex_results(results: list[dict]) -> dict:
    """Fusionne les resultats PaddleX de plusieurs pages en un seul resultat."""
    if len(results) == 1:
        return results[0]

    merged: dict = {"layoutParsingResults": []}
    for i, r in enumerate(results):
        for item in r.get("layoutParsingResults", []):
            # Ajouter le numero de page a chaque resultat
            item["page_index"] = i
            merged["layoutParsingResults"].append(item)

    # Conserver dataInfo du premier resultat
    if results[0].get("dataInfo"):
        merged["dataInfo"] = results[0]["dataInfo"]

    return merged


async def _call_paddlex(base_url: str, file_bytes: bytes, file_type: int) -> dict:
    """Appelle PaddleX Serving (distant) pour l'OCR.

    Le serveur PaddleX tourne sur la machine Windows et gere :
    - Layout detection (PP-DocLayoutV3)
    - VLM (PaddleOCR-VL)
    - PDF multi-pages nativement

    Args:
        base_url: URL du serveur PaddleX (ex: http://100.67.242.46:12321)
        file_bytes: contenu du fichier (image ou PDF)
        file_type: 0 = PDF, 1 = image
    """
    b64 = base64.b64encode(file_bytes).decode("ascii")
    payload = {"file": b64, "fileType": file_type, "visualize": False}

    url = f"{base_url.rstrip('/')}/layout-parsing"

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "PaddleX Serving non joignable - verifiez le serveur OCR")
    except httpx.TimeoutException:
        raise HTTPException(504, "PaddleX Serving timeout - le document est peut-etre trop gros")
    except httpx.HTTPStatusError as exc:
        _log.warning("PaddleX erreur %s: %s", exc.response.status_code, exc.response.text[:300])
        raise HTTPException(502, f"Erreur PaddleX : {exc.response.status_code}")

    if data.get("errorCode", 0) != 0:
        raise HTTPException(502, f"Erreur PaddleX : {data.get('errorMsg', 'inconnue')}")

    return data.get("result", {})


async def ocr(
    db: AsyncSession,
    file_bytes: bytes,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    content_type: str = "image/jpeg",
) -> dict:
    """Extrait le contenu d'un document via PaddleX Serving (distant).

    Le serveur PaddleX (sur machine Windows) gere layout detection + VLM.
    Supporte PDF multi-pages et images nativement.
    L'URL est configuree dans General > URL PaddleX sur la page config IA.
    """
    config = await _get_ai_config(db)

    paddlex_url = config.get("paddlex_url")
    if not paddlex_url:
        raise HTTPException(503, "URL du serveur PaddleX non configuree (Reglages IA > General)")

    is_pdf = content_type == "application/pdf" or file_bytes[:5] == b"%PDF-"

    start = time.monotonic()

    if is_pdf:
        # Envoyer page par page en image 120 DPI
        import fitz  # PyMuPDF
        from PIL import Image
        import io

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        all_results: list[dict] = []

        for page in doc:
            pix = page.get_pixmap(dpi=120)
            img_buf = io.BytesIO(pix.tobytes("jpeg"))
            img_bytes = img_buf.getvalue()

            page_result = await _call_paddlex(paddlex_url, img_bytes, 1)
            all_results.append(page_result)

        doc.close()

        # Fusionner les resultats de chaque page
        result = _merge_paddlex_results(all_results)
    else:
        file_bytes = _downscale_image(file_bytes, max_side=1500)
        result = await _call_paddlex(paddlex_url, file_bytes, 1)

    duration = int((time.monotonic() - start) * 1000)
    await _log_usage(db, org_id, user_id, None, "vl", 0, 0, duration)

    return result


# ── OCR VLM (modele Vision-Language via LiteLLM) ─────────────────────────────

_VLM_EXTRACTION_PROMPT = """Tu es un extracteur de donnees comptables universel. Retourne UNIQUEMENT un JSON valide, sans markdown, sans texte avant ou apres.
REGLES STRICTES :
Valeur non trouvee = null
Montants = float 2 decimales - TOUJOURS lire la valeur dans le document, ne jamais recalculer
Dates = YYYY-MM-DD
Chaque produit/service = une entree dans "lignes", meme si fusionne visuellement dans le document
Les lignes TOTAL, SOUS-TOTAL, CUMUL ne sont PAS des lignes
Identifiant fiscal : mettre la valeur trouvee dans le champ correspondant - SIREN (9 chiffres) dans "siren", SIRET (14 chiffres) dans "siret", les deux si les deux sont presents
"designation" = libelle court tel qu'ecrit dans le document - "description" = texte long ou complementaire si present
"confiance" globale et par ligne = certitude entre 0 et 1 - baisser si fusion de lignes suspectee, OCR douteux ou donnees reconstituees
{
  "meta": {
    "type_document": "facture|avoir|releve|devis|bon_livraison|bon_commande|pro_forma|acompte",
    "devise": null,
    "langue": null,
    "confiance": null,
    "pages": null
  },
  "parties": {
    "emetteur": {
      "designation": null,
      "adresse": {"rue": null, "code_postal": null, "ville": null, "pays": null},
      "identifiants": {"siret": null, "siren": null, "tva": null}
    },
    "destinataire": {
      "designation": null,
      "adresse": {"rue": null, "code_postal": null, "ville": null, "pays": null},
      "identifiants": {"client": null, "tva": null}
    }
  },
  "document": {
    "numero": null,
    "date_emission": null,
    "date_echeance": null,
    "numero_commande": null,
    "reference": null
  },
  "lignes": [
    {
      "confiance": null,
      "reference": null,
      "designation": null,
      "description": null,
      "quantite": null,
      "unite": null,
      "prix_unitaire_ht": null,
      "montant_ht": null,
      "taux_tva": null,
      "montant_tva": null,
      "montant_ttc": null
    }
  ],
  "totaux": {
    "total_ht": null,
    "total_tva": null,
    "total_ttc": null,
    "ventilation_tva": [{"taux": null, "base_ht": null, "montant": null}]
  },
  "paiement": {
    "mode": null,
    "echeance": null,
    "montant_preleve": null,
    "iban": null
  }
}"""


def _pdf_pages_to_b64(file_bytes: bytes) -> list[str]:
    """Convertit chaque page d'un PDF en image JPEG base64 via PyMuPDF."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages_b64 = []
    for page in doc:
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("jpeg")
        pages_b64.append(base64.b64encode(img_bytes).decode("ascii"))
    doc.close()
    return pages_b64


def _image_to_jpeg_b64(file_bytes: bytes, content_type: str) -> str:
    """Convertit n'importe quelle image (HEIC, PNG, etc.) en JPEG base64 via Pillow."""
    from PIL import Image
    import io

    # Enregistrer le support HEIC/HEIF (photos iPhone)
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    img = Image.open(io.BytesIO(file_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    # Redimensionner si trop grand (max 1500px de cote)
    max_side = 1500
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side))
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("ascii")


async def ocr_vlm(
    db: AsyncSession,
    file_bytes: bytes,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    content_type: str = "image/jpeg",
) -> dict:
    """OCR via le modele VL (Vision-Language) configure dans LiteLLM.

    Envoie les pages du document comme images au modele vision.
    Supporte PDF multi-pages, JPEG, PNG, HEIC et autres formats image.
    """
    config = await _get_ai_config(db)
    model = await _resolve_model(db, config["vl_model_id"])
    if not model:
        raise HTTPException(503, "Aucun modele VL configure (Reglages IA > Roles > Vision)")

    is_pdf = content_type == "application/pdf" or file_bytes[:5] == b"%PDF-"

    # Convertir en images base64 (150 DPI)
    if is_pdf:
        images_b64 = _pdf_pages_to_b64(file_bytes)
    else:
        images_b64 = [_image_to_jpeg_b64(file_bytes, content_type)]

    # Envoyer page par page pour eviter de surcharger le modele
    start = time.monotonic()
    total_tokens_in = 0
    total_tokens_out = 0
    all_pages_results = []
    last_text = ""

    for i, img_b64 in enumerate(images_b64):
        page_prompt = _VLM_EXTRACTION_PROMPT if i == 0 else (
            "Meme consignes. Extrais les donnees de cette page supplementaire. "
            "Retourne UNIQUEMENT le JSON."
        )
        content: list[dict] = [
            {"type": "text", "text": page_prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
        ]
        messages = [{"role": "user", "content": content}]

        resp = await _call_litellm(
            config["litellm_url"], config["litellm_key"],
            model["litellm_name"], messages, max_tokens=4096, timeout=300.0,
        )

        usage = resp.get("usage", {})
        total_tokens_in += usage.get("prompt_tokens", 0)
        total_tokens_out += usage.get("completion_tokens", 0)

        last_text = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = _parse_vlm_json(last_text)
        if parsed:
            all_pages_results.append(parsed)

    duration = int((time.monotonic() - start) * 1000)
    await _log_usage(
        db, org_id, user_id, model["uuid"], "vl",
        total_tokens_in, total_tokens_out, duration,
    )

    meta = {
        "duration_ms": duration,
        "pages_count": len(images_b64),
        "tokens_in": total_tokens_in,
        "tokens_out": total_tokens_out,
        "model": model["litellm_name"],
    }

    if not all_pages_results:
        return {"raw_text": last_text, **meta}

    result = all_pages_results[0]
    # Fusionner les lignes des pages suivantes
    for page_result in all_pages_results[1:]:
        if "lignes" in page_result and page_result["lignes"]:
            result.setdefault("lignes", [])
            result["lignes"].extend(page_result["lignes"])
    result.update(meta)
    return result


def _parse_vlm_json(text: str) -> dict | None:
    """Parse le JSON retourne par le VLM, en nettoyant les blocs markdown."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


# ── Categorisation comptable (role Instruct) ──────────────────────────────────


async def categorize(
    db: AsyncSession,
    label: str,
    amount: float,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    supplier_name: str | None = None,
) -> dict:
    """Suggere un compte PCG pour une ecriture comptable."""
    config = await _get_ai_config(db)
    model = await _resolve_model(db, config["instruct_model_id"])
    if not model:
        raise HTTPException(503, "Aucun modele Instruct configure pour la categorisation")

    # Recuperer les few-shot examples de cette org
    examples_result = await db.execute(
        text("""
            SELECT input_label, input_amount, final_account
            FROM ai_categorization_history
            WHERE organization_id = :org AND final_account IS NOT NULL
            ORDER BY created_at DESC LIMIT 5
        """),
        {"org": str(org_id)},
    )
    examples = examples_result.fetchall()
    examples_text = ""
    if examples:
        lines = [f"- '{r[0]}' ({r[1]} EUR) -> compte {r[2]}" for r in examples]
        examples_text = "\n\nExemples precedents pour cette organisation :\n" + "\n".join(lines)

    messages = [
        {
            "role": "system",
            "content": (
                "Tu es un expert-comptable francais. "
                "On te donne le libelle et le montant d'une ecriture comptable. "
                "Propose le compte PCG (Plan Comptable General) le plus adapte. "
                "Reponds en JSON strict : {\"suggested_account\": \"XXXXX\", \"account_label\": \"...\", "
                "\"confidence\": 0.0-1.0, \"alternatives\": [{\"account\": \"XXXXX\", \"label\": \"...\"}]}"
                + examples_text
            ),
        },
        {
            "role": "user",
            "content": f"Libelle : {label}\nMontant : {amount} EUR"
            + (f"\nFournisseur : {supplier_name}" if supplier_name else ""),
        },
    ]

    start = time.monotonic()
    resp = await _call_litellm(config["litellm_url"], config["litellm_key"], model["litellm_name"], messages, max_tokens=512)
    duration = int((time.monotonic() - start) * 1000)

    usage = resp.get("usage", {})
    await _log_usage(db, org_id, user_id, model["uuid"], "instruct", usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), duration)

    content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"suggested_account": "", "account_label": content[:100], "confidence": 0.0}


# ── Chat (Instruct ou Thinking) ───────────────────────────────────────────────


async def chat(
    db: AsyncSession,
    messages: list[dict],
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    use_thinking: bool = False,
) -> dict:
    """Chat contextuel - utilise Instruct par defaut, Thinking si demande."""
    config = await _get_ai_config(db)
    role = "thinking" if use_thinking else "instruct"
    model_id = config["thinking_model_id"] if use_thinking else config["instruct_model_id"]
    # Fallback : si thinking demande mais pas configure, utilise instruct
    if not model_id and use_thinking:
        model_id = config["instruct_model_id"]
        role = "instruct"

    model = await _resolve_model(db, model_id)
    if not model:
        raise HTTPException(503, f"Aucun modele {role} configure pour le chat")

    system_msg = {
        "role": "system",
        "content": (
            "Tu es l'assistant comptable Kerpta. Tu aides les utilisateurs avec leur comptabilite, "
            "facturation et gestion d'entreprise. Reponds en francais, de maniere concise et professionnelle. "
            "Si tu ne connais pas la reponse, dis-le clairement."
        ),
    }
    full_messages = [system_msg] + messages

    start = time.monotonic()
    resp = await _call_litellm(config["litellm_url"], config["litellm_key"], model["litellm_name"], full_messages)
    duration = int((time.monotonic() - start) * 1000)

    usage = resp.get("usage", {})
    tokens_in = usage.get("prompt_tokens", 0)
    tokens_out = usage.get("completion_tokens", 0)

    await _log_usage(db, org_id, user_id, model["uuid"], role, tokens_in, tokens_out, duration)

    content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
    return {
        "content": content,
        "role_used": role,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
    }


# ── Generation de texte (role Instruct) ───────────────────────────────────────


async def generate(
    db: AsyncSession,
    prompt: str,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    context: str | None = None,
) -> dict:
    """Genere du texte (PV, mails de relance, descriptions)."""
    config = await _get_ai_config(db)
    model = await _resolve_model(db, config["instruct_model_id"])
    if not model:
        raise HTTPException(503, "Aucun modele Instruct configure pour la generation")

    messages = [
        {
            "role": "system",
            "content": (
                "Tu es un assistant de redaction professionnelle pour une entreprise francaise. "
                "Genere le texte demande de maniere formelle et professionnelle. Reponds en francais."
            ),
        },
    ]
    if context:
        messages.append({"role": "user", "content": f"Contexte : {context}"})
    messages.append({"role": "user", "content": prompt})

    start = time.monotonic()
    resp = await _call_litellm(config["litellm_url"], config["litellm_key"], model["litellm_name"], messages)
    duration = int((time.monotonic() - start) * 1000)

    usage = resp.get("usage", {})
    tokens_in = usage.get("prompt_tokens", 0)
    tokens_out = usage.get("completion_tokens", 0)

    await _log_usage(db, org_id, user_id, model["uuid"], "instruct", tokens_in, tokens_out, duration)

    content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
    return {
        "content": content,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
    }


# ── Status ────────────────────────────────────────────────────────────────────


async def get_status(db: AsyncSession, org_id: uuid.UUID) -> dict:
    """Retourne le statut IA pour une organisation."""
    # Verifier ai_enabled sur la plateforme
    cfg_result = await db.execute(
        text("SELECT ai_enabled, ai_role_vl_model_id, ai_role_instruct_model_id, ai_role_thinking_model_id, ai_features FROM platform_config LIMIT 1")
    )
    cfg = cfg_result.fetchone()
    ai_enabled = bool(cfg and cfg[0])

    # Verifier module_ai_enabled sur l'org
    org_result = await db.execute(
        text("SELECT module_ai_enabled FROM organizations WHERE id = :oid"),
        {"oid": str(org_id)},
    )
    org_row = org_result.fetchone()
    module_enabled = bool(org_row and org_row[0])

    roles = []
    if cfg and cfg[1]:
        roles.append("vl")
    if cfg and cfg[2]:
        roles.append("instruct")
    if cfg and cfg[3]:
        roles.append("thinking")

    features = (cfg[4] if cfg else None) or {}

    return {
        "ai_enabled": ai_enabled,
        "module_ai_enabled": module_enabled,
        "available_roles": roles,
        "features": features,
    }
