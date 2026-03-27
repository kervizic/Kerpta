# Kerpta - Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

"""Tache Celery - Extraction IA asynchrone d'un document importe.

Telecharge le fichier depuis S3, appelle ocr_vlm, remplit les colonnes
structurees et auto-matche le client.
"""

import logging

from app.tasks.celery_app import celery

_log = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.extract_document.extract_document_task",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def extract_document_task(self, import_id: str, org_id: str, user_id: str):
    """Extraction IA asynchrone d'un document importe."""
    import asyncio
    asyncio.run(_extract_document_async(self, import_id, org_id, user_id))


async def _extract_document_async(task, import_id: str, org_id: str, user_id: str):
    """Implementation async de l'extraction de document."""
    import json
    import uuid

    from sqlalchemy import text

    from app.core.database import AsyncSessionLocal as async_session_factory
    from app.services import ai as ai_svc
    from app.services import storage as storage_svc
    from app.services.document_import import (
        _auto_match_client,
        _populate_structured_fields,
    )

    import_uuid = uuid.UUID(import_id)
    org_uuid = uuid.UUID(org_id)
    user_uuid = uuid.UUID(user_id)

    async with async_session_factory() as db:
        try:
            # 1. Mettre extraction_status = 'extracting'
            await db.execute(
                text("""
                    UPDATE document_imports
                    SET extraction_status = 'extracting'
                    WHERE id = :iid
                """),
                {"iid": import_id},
            )
            await db.commit()

            # 2. Recuperer les infos du document (source_file_url, content_type)
            result = await db.execute(
                text("""
                    SELECT source_file_url, source_filename
                    FROM document_imports
                    WHERE id = :iid AND organization_id = :org_id
                """),
                {"iid": import_id, "org_id": org_id},
            )
            row = result.fetchone()
            if not row:
                raise ValueError(f"Import {import_id} introuvable")

            source_file_url = row[0]
            source_filename = row[1] or "document"

            if not source_file_url:
                raise ValueError(f"Import {import_id} : pas de fichier source sur S3")

            # 3. Telecharger le fichier depuis S3
            _log.info("Telechargement fichier S3 pour import %s", import_id)
            file_bytes = await storage_svc.download_document(source_file_url, db)
            if not file_bytes:
                raise ValueError(f"Import {import_id} : impossible de telecharger depuis S3")

            # Determiner le content_type
            if source_filename.lower().endswith(".pdf") or file_bytes[:5] == b"%PDF-":
                content_type = "application/pdf"
            elif source_filename.lower().endswith(".png"):
                content_type = "image/png"
            else:
                content_type = "image/jpeg"

            # 4. Appeler ocr_vlm
            _log.info("Extraction VLM pour import %s (%d octets)", import_id, len(file_bytes))
            result_data = await ai_svc.ocr_vlm(db, file_bytes, org_uuid, user_uuid, content_type)

            # Extraire les metadonnees
            duration_ms = result_data.pop("duration_ms", None)
            model_used = result_data.pop("model", None)
            result_data.pop("pages_count", None)
            tokens_in = result_data.pop("tokens_in", None)
            tokens_out = result_data.pop("tokens_out", None)
            prompt_sent = result_data.pop("prompt_sent", None)
            result_data.pop("raw_response", None)

            confidence = None
            if result_data.get("meta", {}).get("confiance") is not None:
                try:
                    confidence = float(result_data["meta"]["confiance"])
                except (ValueError, TypeError):
                    pass

            # 5. Mettre a jour l'import avec les resultats
            await db.execute(
                text("""
                    UPDATE document_imports SET
                        extracted_json = CAST(:extracted AS jsonb),
                        confidence = :confidence,
                        model_used = :model,
                        extraction_duration_ms = :duration,
                        tokens_in = :tin,
                        tokens_out = :tout,
                        prompt_sent = :prompt,
                        extraction_status = 'done',
                        status = 'pending'
                    WHERE id = :iid
                """),
                {
                    "iid": import_id,
                    "extracted": json.dumps(result_data),
                    "confidence": confidence,
                    "model": model_used,
                    "duration": duration_ms,
                    "tin": tokens_in,
                    "tout": tokens_out,
                    "prompt": prompt_sent,
                },
            )

            # 6. Remplir les colonnes structurees + lignes
            await _populate_structured_fields(import_uuid, result_data, db)

            # 7. Auto-match client
            await _auto_match_client(org_uuid, import_uuid, result_data, db)

            await db.commit()

            _log.info("Extraction terminee pour import %s (modele=%s, duree=%sms)", import_id, model_used, duration_ms)

        except Exception as exc:
            await db.rollback()
            exc_str = str(exc)
            _log.exception("Erreur extraction import %s : %s", import_id, exc_str)

            # Erreurs retryables : 500, 529 (overloaded)
            status_code = getattr(exc, "status_code", None)
            if status_code in (500, 529):
                # Mettre a jour le message d'erreur avant retry
                async with async_session_factory() as db2:
                    await db2.execute(
                        text("""
                            UPDATE document_imports
                            SET error_message = :msg
                            WHERE id = :iid
                        """),
                        {"iid": import_id, "msg": f"Tentative {task.request.retries + 1}/3 - {exc_str}"},
                    )
                    await db2.commit()
                raise task.retry(exc=exc)

            # Erreur non retryable : marquer en erreur
            async with async_session_factory() as db2:
                await db2.execute(
                    text("""
                        UPDATE document_imports
                        SET extraction_status = 'error',
                            error_message = :msg
                        WHERE id = :iid
                    """),
                    {"iid": import_id, "msg": exc_str},
                )
                await db2.commit()
