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

from app.core.config import settings

celery = Celery(
    "kerpta",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.sirene_sync",   # Synchronisation nocturne du cache SIRENE
        # "app.tasks.email",
        # "app.tasks.pdf",
        # "app.tasks.ocr",
    ],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    # Retry automatique sur les tâches non acquittées
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # ── Celery Beat — tâches planifiées ────────────────────────────────────────
    beat_schedule={
        # Sync SIRENE : chaque nuit à 2h00 (Europe/Paris)
        # Met à jour le statut (active/closed) de toutes les entreprises et établissements
        "sirene-sync-nightly": {
            "task": "sirene.sync_all",
            "schedule": 86400,          # toutes les 24h (en secondes)
            "options": {"expires": 7200},  # expire si pas lancée dans les 2h
        },
    },
)
