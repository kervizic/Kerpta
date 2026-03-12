# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Modèles SQLAlchemy pour le cache SIRENE local.

Ces tables sont alimentées par le job Celery Beat quotidien (2h du matin).

Principe :
  - companies   : une ligne par SIREN — données légales de l'entreprise
  - establishments : une ligne par SIRET — données de chaque établissement avec statut

Le statut (active/closed) permet de bloquer l'usage d'un établissement fermé
pour la facturation (billing_siret) et dans les adresses clients/fournisseurs.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CHAR, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Company(Base, TimestampMixin):
    """Cache d'une entreprise française (SIREN) depuis l'API SIRENE / recherche-entreprises.

    status :
      'active'  — etat_administratif == "A" dans l'API INSEE
      'closed'  — etat_administratif == "F" (cessée / radiée)
    """

    __tablename__ = "companies"

    siren: Mapped[str] = mapped_column(CHAR(9), primary_key=True, nullable=False)
    denomination: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sigle: Mapped[str | None] = mapped_column(String(100), nullable=True)
    legal_form_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    legal_form: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ape_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    rcs_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capital: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    creation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    closure_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # active | closed — mis à jour chaque nuit par le job SIRENE
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relations
    establishments: Mapped[list["Establishment"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_companies_status", "status"),
    )


class Establishment(Base, TimestampMixin):
    """Cache d'un établissement (SIRET) depuis l'API SIRENE.

    status :
      'active'  — etat_administratif == "A"
      'closed'  — etat_administratif == "F"

    Règle métier :
      Un établissement 'closed' ne peut PAS être sélectionné comme billing_siret
      pour une organisation, ni comme adresse de facturation pour un client.
      Les documents existants pointant vers un établissement fermé restent valides
      (données historiques préservées) mais sont signalés en avertissement.
    """

    __tablename__ = "establishments"

    siret: Mapped[str] = mapped_column(CHAR(14), primary_key=True, nullable=False)
    siren: Mapped[str] = mapped_column(
        CHAR(9), ForeignKey("companies.siren", ondelete="CASCADE"), nullable=False
    )
    nic: Mapped[str | None] = mapped_column(CHAR(5), nullable=True)
    is_siege: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # active | closed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # Adresse JSONB : {voie, complement, code_postal, commune, pays}
    address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    activite_principale: Mapped[str | None] = mapped_column(String(10), nullable=True)
    closure_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relations
    company: Mapped["Company"] = relationship(back_populates="establishments")

    __table_args__ = (
        Index("idx_establishments_siren", "siren"),
        Index("idx_establishments_status", "status"),
    )
