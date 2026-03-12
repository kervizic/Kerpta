# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, TimestampUpdateMixin, UUIDPrimaryKeyMixin


class PlatformConfig(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Configuration globale de l'instance — singleton (1 seule ligne)."""

    __tablename__ = "platform_config"

    setup_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    setup_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    instance_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Ajoutés par la migration 0002
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    auth_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    oauth_config: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="Config OAuth par provider"
    )

    # Ajouté par la migration 0004
    api_keys: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="Clés API externes (INSEE, etc.)"
    )


class PlatformAdminLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Journal d'audit des actions super-admin."""

    __tablename__ = "platform_admin_log"

    admin_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # impersonate/suspend/delete/grant_admin/revoke_admin
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    target_org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)


class OrganizationStorageConfig(Base, UUIDPrimaryKeyMixin, TimestampUpdateMixin):
    """Configuration du stockage externe d'une organisation."""

    __tablename__ = "organization_storage_configs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        unique=True,
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # ftp/sftp/google_drive/onedrive/dropbox/s3
    credentials: Mapped[dict] = mapped_column(
        JSONB, nullable=False
    )  # chiffré AES-256 en production
    base_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_tested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="storage_config")
