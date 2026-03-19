# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes IA pour les organisations (OCR, categorisation, chat, generation)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.schemas.ai import (
    AiCategorizeRequest,
    AiCategorizeResponse,
    AiChatRequest,
    AiChatResponse,
    AiGenerateRequest,
    AiGenerateResponse,
    AiOcrResponse,
    AiStatusResponse,
)
from app.services import ai as ai_svc

router = APIRouter(prefix="/api/v1/ai", tags=["IA Organisation"])


async def _require_ai_enabled(
    db: AsyncSession,
    org_id: UUID,
) -> None:
    """Verifie que l'IA est active sur la plateforme ET sur l'organisation."""
    # Plateforme
    cfg = await db.execute(text("SELECT ai_enabled FROM platform_config LIMIT 1"))
    row = cfg.fetchone()
    if not row or not row[0]:
        raise HTTPException(503, "Module IA non active sur la plateforme")

    # Organisation
    org = await db.execute(
        text("SELECT module_ai_enabled FROM organizations WHERE id = :oid"),
        {"oid": str(org_id)},
    )
    org_row = org.fetchone()
    if not org_row:
        raise HTTPException(404, "Organisation introuvable")
    if not org_row[0]:
        raise HTTPException(403, "Module IA non active pour cette organisation")


@router.post("/ocr", response_model=AiOcrResponse)
async def ocr_invoice(
    file: UploadFile = File(...),
    x_organization_id: UUID = Header(..., alias="X-Organization-Id"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_ai_enabled(db, x_organization_id)
    image_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"
    result = await ai_svc.ocr(db, image_bytes, x_organization_id, user_id, content_type)
    return AiOcrResponse(**result)


@router.post("/categorize", response_model=AiCategorizeResponse)
async def categorize_entry(
    body: AiCategorizeRequest,
    x_organization_id: UUID = Header(..., alias="X-Organization-Id"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_ai_enabled(db, x_organization_id)
    result = await ai_svc.categorize(
        db, body.label, float(body.amount), x_organization_id, user_id, body.supplier_name
    )
    return AiCategorizeResponse(**result)


@router.post("/chat", response_model=AiChatResponse)
async def chat_message(
    body: AiChatRequest,
    x_organization_id: UUID = Header(..., alias="X-Organization-Id"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_ai_enabled(db, x_organization_id)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    result = await ai_svc.chat(db, messages, x_organization_id, user_id, body.use_thinking)
    return AiChatResponse(**result)


@router.post("/generate", response_model=AiGenerateResponse)
async def generate_text(
    body: AiGenerateRequest,
    x_organization_id: UUID = Header(..., alias="X-Organization-Id"),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _require_ai_enabled(db, x_organization_id)
    result = await ai_svc.generate(db, body.prompt, x_organization_id, user_id, body.context)
    return AiGenerateResponse(**result)


@router.get("/status", response_model=AiStatusResponse)
async def get_ai_status(
    x_organization_id: UUID = Header(..., alias="X-Organization-Id"),
    _user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await ai_svc.get_status(db, x_organization_id)
    return AiStatusResponse(**result)
