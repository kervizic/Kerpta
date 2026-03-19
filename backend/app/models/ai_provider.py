# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampUpdateMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.ai_model import AiModel


class AiProvider(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Fournisseur IA connecte par le super-admin."""

    __tablename__ = "ai_providers"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="ollama, vllm, openai, anthropic, mistral, google, openai_compatible",
    )
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_key: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Chiffre AES-256"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_check_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Relations
    models: Mapped[list["AiModel"]] = relationship(
        back_populates="provider", cascade="all, delete-orphan"
    )
