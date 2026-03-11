# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Modèle SQLAlchemy pour le contenu de la page vitrine Kerpta."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PlatformContent(Base):
    """Contenu CMS de la page vitrine publique de l'instance Kerpta.

    Chaque section (hero, features, pricing, opensource, footer) est une ligne.
    Le contenu est un JSONB libre éditable via l'interface admin.
    Initialisé automatiquement au premier démarrage (seed).
    """

    __tablename__ = "platform_content"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    section: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        comment="Identifiant de la section : hero | features | pricing | opensource | footer",
    )
    content: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default="{}",
        comment="Contenu JSON de la section, structure libre par type de section",
    )
    visible: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
