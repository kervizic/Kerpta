# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Any, Literal


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
    # Valeur par défaut utilisée jusqu'à ce que le wizard écrive la vraie clé dans .env
    SECRET_KEY: str = "setup-pending-change-me"
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

    # CORS — type Any pour contourner le json.loads() automatique de pydantic_settings
    # sur les types complexes (list). Le validator gère tous les formats possibles :
    # JSON array, crochets sans guillemets, virgules.
    CORS_ORIGINS: Any = ["http://localhost:5173"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                try:
                    # JSON valide : ["http://..."]
                    result = json.loads(v)
                    if isinstance(result, list):
                        return result
                except json.JSONDecodeError:
                    # Crochets sans guillemets : [http://a.com,https://b.com]
                    v = v.strip("[]")
            if not v or v in ("-",):
                return []
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return []

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
