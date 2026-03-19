# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class AiCategorizationHistory(Base, UUIDPrimaryKeyMixin):
    """Historique des suggestions de categorisation comptable par l'IA.

    Sert de few-shot examples pour ameliorer les futures suggestions.
    """

    __tablename__ = "ai_categorization_history"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    input_label: Mapped[str] = mapped_column(Text, nullable=False)
    input_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    suggested_account: Mapped[str | None] = mapped_column(String(10), nullable=True)
    final_account: Mapped[str | None] = mapped_column(String(10), nullable=True)
    was_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
