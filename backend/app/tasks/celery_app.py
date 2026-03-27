# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Configuration de l'application Celery.

L'instance `celery` est importée par :
  - docker-compose : celery -A app.tasks.celery_app worker
  - Le code applicatif : from app.tasks.celery_app import celery
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery = Celery(
    "kerpta",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        # "app.tasks.email",
        # "app.tasks.pdf",
        # "app.tasks.ocr",
        "app.tasks.recurring_invoices",
        "app.tasks.extract_document",
    ],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    # Retry automatique sur les taches non acquittees
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # ── Celery Beat - taches planifiees ────────────────────────────────────────
    beat_schedule={
        "generate-recurring-invoices": {
            "task": "app.tasks.recurring_invoices.generate_recurring_invoices",
            "schedule": crontab(hour=6, minute=0),  # Tous les jours a 6h du matin
        },
    },
)
