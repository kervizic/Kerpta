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
    file_type = 0 if is_pdf else 1

    start = time.monotonic()

    result = await _call_paddlex(paddlex_url, file_bytes, file_type)

    duration = int((time.monotonic() - start) * 1000)
    await _log_usage(db, org_id, user_id, None, "vl", 0, 0, duration)

    return result


# ── OCR VLM (modele Vision-Language via LiteLLM) ─────────────────────────────

_VLM_EXTRACTION_PROMPT = """Lis ce document et retranscris EXACTEMENT tout le texte visible, tel quel.

Regles strictes :
- Retranscris chaque mot, chiffre, symbole exactement comme il apparait
- Ne corrige RIEN (pas d'orthographe, pas de format de date, pas de calcul)
- N'invente RIEN, n'extrapole RIEN, ne regroupe RIEN, ne calcule RIEN
- Conserve la mise en page originale (sauts de ligne, alignements, tableaux)
- Pour les tableaux, utilise le format Markdown (|col1|col2|...)
- Si une zone est illisible, indique [illisible]
- S'il y a plusieurs pages, separe-les par --- PAGE X ---

Reponds UNIQUEMENT avec le texte brut du document, sans commentaire."""


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

    # Convertir en images base64
    if is_pdf:
        images_b64 = _pdf_pages_to_b64(file_bytes)
    else:
        images_b64 = [_image_to_jpeg_b64(file_bytes, content_type)]

    # Traiter page par page pour ne pas surcharger le modele
    all_texts: list[str] = []
    total_tokens_in = 0
    total_tokens_out = 0
    start = time.monotonic()

    for i, img_b64 in enumerate(images_b64):
        page_prompt = _VLM_EXTRACTION_PROMPT
        if len(images_b64) > 1:
            page_prompt = f"--- PAGE {i + 1}/{len(images_b64)} ---\n\n{_VLM_EXTRACTION_PROMPT}"

        messages = [{"role": "user", "content": [
            {"type": "text", "text": page_prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
        ]}]

        resp = await _call_litellm(
            config["litellm_url"], config["litellm_key"],
            model["litellm_name"], messages, max_tokens=4096, timeout=300.0,
        )

        usage = resp.get("usage", {})
        total_tokens_in += usage.get("prompt_tokens", 0)
        total_tokens_out += usage.get("completion_tokens", 0)

        page_text = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        all_texts.append(page_text.strip())

    duration = int((time.monotonic() - start) * 1000)

    await _log_usage(
        db, org_id, user_id, model["uuid"], "vl",
        total_tokens_in, total_tokens_out, duration,
    )

    # Concatener toutes les pages
    full_text = "\n\n".join(all_texts)

    return {
        "raw_text": full_text,
        "duration_ms": duration,
        "pages_count": len(images_b64),
        "tokens_in": total_tokens_in,
        "tokens_out": total_tokens_out,
        "model": model["litellm_name"],
    }


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
