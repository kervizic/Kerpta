# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "Kerpta"
    APP_ENV: Literal["development", "production", "test"] = "development"
    SECRET_KEY: str
    DEBUG: bool = False

    # Base de données
    DATABASE_URL: str = ""

    # Supabase Auth
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_URL: str = ""

    # Chiffrement storage
    STORAGE_ENCRYPTION_KEY: str = ""

    # Email (Resend)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@kerpta.fr"

    # OCR (Mindee) — optionnel
    MINDEE_API_KEY: str = ""

    # DocuSeal — optionnel
    DOCUSEAL_API_KEY: str = ""
    DOCUSEAL_API_URL: str = "http://docuseal:3000"
    DOCUSEAL_SECRET_KEY: str = ""
    DOCUSEAL_WEBHOOK_SECRET: str = ""

    # Redis / Celery
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        # Convertit postgres:// en postgresql+asyncpg://
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v


settings = Settings()
