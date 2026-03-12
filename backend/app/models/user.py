# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import UniqueConstraint

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Utilisateur — ID identique à l'ID Supabase Auth."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    provider_sub: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
        index=True,
        comment=(
            "Identifiant stable côté provider OAuth. "
            "Format : google:{sub} | azure:{oid} | apple:{sub}. "
            "Permet de retrouver l'utilisateur même après un reset GoTrue."
        ),
    )
    platform_admin_granted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    platform_admin_granted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    invitations_created: Mapped[list["Invitation"]] = relationship(
        foreign_keys="Invitation.created_by", back_populates="creator"
    )


class OrganizationMembership(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Appartenance d'un utilisateur à une organisation avec son rôle."""

    __tablename__ = "organization_memberships"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # owner/accountant/commercial/employee/custom
    custom_permissions: Mapped[list[str] | None] = mapped_column(
        __import__("sqlalchemy.dialects.postgresql", fromlist=["JSONB"]).JSONB,
        nullable=True,
    )
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relations
    user: Mapped["User"] = relationship(foreign_keys=[user_id], back_populates="memberships")
    organization: Mapped["Organization"] = relationship(back_populates="memberships")

    __table_args__ = (
        __import__("sqlalchemy", fromlist=["UniqueConstraint"]).UniqueConstraint(
            "user_id", "organization_id"
        ),
        __import__("sqlalchemy", fromlist=["CheckConstraint"]).CheckConstraint(
            "role IN ('owner', 'accountant', 'commercial', 'employee', 'custom')"
        ),
    )


class Invitation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Invitation à rejoindre une organisation."""

    __tablename__ = "invitations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    token_hash: Mapped[str] = mapped_column(
        __import__("sqlalchemy", fromlist=["CHAR"]).CHAR(64), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    custom_permissions: Mapped[list[str] | None] = mapped_column(
        __import__("sqlalchemy.dialects.postgresql", fromlist=["JSONB"]).JSONB,
        nullable=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending/accepted/expired/revoked

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="invitations")
    creator: Mapped["User"] = relationship(
        foreign_keys=[created_by], back_populates="invitations_created"
    )


class OrganizationJoinRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Demande de rattachement à une organisation existante."""

    __tablename__ = "organization_join_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending/accepted/rejected
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    role_assigned: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # renseigné à l'acceptation
    cooldown_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # après refus : cooldown 30 jours

    # Relations
    organization: Mapped["Organization"] = relationship(back_populates="join_requests")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])

    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_join_request_user_org"),
    )
