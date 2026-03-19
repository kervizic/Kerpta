# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampUpdateMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.ai_provider import AiProvider


class AiModel(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Modele IA detecte ou ajoute manuellement pour un fournisseur."""

    __tablename__ = "ai_models"

    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    model_id: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="ID cote provider (ex: mistral:7b, gpt-4o)"
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    capabilities: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment='["vision","chat","thinking","embeddings"]'
    )
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relations
    provider: Mapped["AiProvider"] = relationship(back_populates="models")
