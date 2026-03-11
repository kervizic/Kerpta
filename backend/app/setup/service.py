# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service du wizard d'initialisation Kerpta.

Responsabilités :
- Tester la connexion à PostgreSQL (asyncpg)
- Écrire / mettre à jour le fichier .env
- Lancer `alembic upgrade head` en sous-processus
- Persister la config OAuth dans platform_config
- Créer le premier administrateur plateforme
- Vérifier si le setup est déjà terminé (skip logic)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import uuid
from pathlib import Path
from typing import Any

import asyncpg
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

# Chemin du .env — /app/.env dans Docker (parents[2] = /app)
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Chemin de l'exécutable alembic (dans le venv ou dans le PATH Docker)
ALEMBIC_BIN = Path(__file__).resolve().parents[2] / ".venv" / "bin" / "alembic"
if not ALEMBIC_BIN.exists():
    ALEMBIC_BIN = Path("alembic")  # fallback PATH (Docker : alembic installé globalement)


# ── Helpers .env ──────────────────────────────────────────────────────────────


def _read_env() -> dict[str, str]:
    """Lit le fichier .env et retourne un dict clé → valeur."""
    env: dict[str, str] = {}
    if not ENV_FILE.exists():
        return env
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, val = line.partition("=")
            env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def _write_env(updates: dict[str, str]) -> None:
    """Fusionne `updates` dans le fichier .env (crée si absent)."""
    env = _read_env()
    env.update(updates)

    lines: list[str] = []
    for key, val in env.items():
        # Encadre les valeurs contenant des espaces ou caractères spéciaux.
        # Stratégie de quoting :
        #   - guillemets doubles internes  → encadrer en guillemets simples
        #   - guillemets simples internes  → encadrer en guillemets doubles
        #   - les deux types              → guillemets doubles + échappement \\"
        if re.search(r'[\s#"\'\\]', val):
            if '"' in val and "'" not in val:
                val = f"'{val}'"
            elif "'" in val and '"' not in val:
                val = f'"{val}"'
            else:
                escaped = val.replace("\\", "\\\\").replace('"', '\\"')
                val = f'"{escaped}"'
        lines.append(f"{key}={val}")

    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── Étape 1 — Base de données ─────────────────────────────────────────────────


async def test_database_connection(
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
) -> dict[str, Any]:
    """Teste la connexion PostgreSQL via asyncpg (sans SQLAlchemy).

    Returns:
        {"ok": True, "version": "PostgreSQL 18.x ..."}
        {"ok": False, "error": "message d'erreur"}
    """
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
    try:
        conn = await asyncpg.connect(dsn, timeout=5)
        row = await conn.fetchval("SELECT version()")
        await conn.close()
        return {"ok": True, "version": row}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


async def save_database_config(
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
    secret_key: str,
) -> None:
    """Écrit DATABASE_URL et SECRET_KEY dans .env, puis lance alembic upgrade head."""
    db_url = f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{database}"
    _write_env(
        {
            "DATABASE_URL": db_url,
            "SECRET_KEY": secret_key,
        }
    )
    _run_alembic_upgrade()
    await _ensure_platform_config(db_url)


def _run_alembic_upgrade() -> None:
    """Lance `alembic upgrade head` en sous-processus synchrone."""
    backend_dir = Path(__file__).resolve().parents[2]  # /backend
    result = subprocess.run(
        [str(ALEMBIC_BIN), "upgrade", "head"],
        cwd=str(backend_dir),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Alembic upgrade head a échoué :\n{result.stderr}"
        )


async def _ensure_platform_config(db_url: str) -> None:
    """Crée l'entrée singleton platform_config si elle n'existe pas encore."""
    engine = create_async_engine(db_url, echo=False)
    async with engine.begin() as conn:
        # Vérifie si un enregistrement existe déjà
        result = await conn.execute(
            text("SELECT id FROM platform_config LIMIT 1")
        )
        row = result.fetchone()
        if row is None:
            await conn.execute(
                text(
                    "INSERT INTO platform_config (id, setup_completed, setup_step, updated_at) "
                    "VALUES (:id, false, 1, NOW())"
                ),
                {"id": str(uuid.uuid4())},
            )
    await engine.dispose()


# ── Restart GoTrue ────────────────────────────────────────────────────────────


def restart_auth_service() -> None:
    """Redémarre kerpta-auth via l'API Docker Unix socket (sans docker CLI).

    Appellé dans un thread daemon après save_oauth_config pour que GoTrue
    recharge ses variables d'environnement OAuth (GOTRUE_EXTERNAL_*).
    Échoue silencieusement si le socket Docker n'est pas disponible.
    """
    import http.client
    import socket as _socket

    class _UnixConn(http.client.HTTPConnection):
        def connect(self) -> None:
            self.sock = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
            self.sock.settimeout(5)
            self.sock.connect("/var/run/docker.sock")

    try:
        conn = _UnixConn("localhost")
        # t=10 : GoTrue a 10 s pour s'arrêter proprement avant SIGKILL
        conn.request("POST", "/v1.41/containers/kerpta-auth/restart?t=10")
        resp = conn.getresponse()
        resp.read()  # consomme le body pour libérer la connexion
        conn.close()
    except Exception:  # noqa: BLE001
        pass  # non-fatal : le wizard continue, l'admin page gère le timeout


async def check_auth_service_health(auth_url: str) -> dict[str, Any]:
    """Vérifie que GoTrue est accessible (GET /auth/v1/health).

    Utilise d'abord GOTRUE_INTERNAL_URL (réseau Docker interne) pour éviter
    les problèmes de hairpin NAT sur VPS, puis tombe en fallback sur auth_url.

    Returns:
        {"ok": True}  si GoTrue répond 200
        {"ok": False, "reason": "..."} sinon
    """
    import httpx

    # Préférer l'URL interne Docker (http://supabase-auth:9999) si disponible.
    # L'URL externe (https://auth.kerpta.fr) n'est souvent pas routable depuis
    # l'intérieur du réseau Docker sur un VPS (pas de hairpin NAT).
    internal_url = os.getenv("GOTRUE_INTERNAL_URL", "").strip()
    urls_to_try = [u for u in [internal_url, auth_url.strip()] if u]

    if not urls_to_try:
        return {"ok": False, "reason": "auth_url non configuré"}

    last_error = "aucune URL disponible"
    async with httpx.AsyncClient(timeout=3.0) as client:
        for url in urls_to_try:
            try:
                r = await client.get(f"{url.rstrip('/')}/auth/v1/health")
                if r.status_code == 200:
                    return {"ok": True}
                last_error = f"HTTP {r.status_code} sur {url}"
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)

    return {"ok": False, "reason": last_error}


# ── Étape 2 — OAuth ───────────────────────────────────────────────────────────


KNOWN_PROVIDERS = [
    "google",
    "microsoft",
    "apple",
    "github",
    "linkedin",
    "facebook",
    "twitter",   # X (Twitter)
    "discord",
    "salesforce",
]


async def save_oauth_config(
    db: AsyncSession,
    base_url: str,
    auth_url: str,
    providers: dict[str, dict[str, Any]],
    custom_oidc: dict[str, Any] | None = None,
) -> None:
    """Persiste la configuration OAuth dans platform_config et met à jour .env.

    Args:
        db: Session SQLAlchemy async.
        base_url: URL publique de l'application (ex. https://kerpta.fr).
        auth_url: URL de l'instance Supabase Auth (ex. https://auth.kerpta.fr).
        providers: Dict provider → {enabled, client_id, client_secret}.
        custom_oidc: Config OIDC propriétaire optionnelle
                     {enabled, client_id, client_secret, issuer_url}.
    """
    oauth_config: dict[str, Any] = {}

    env_updates: dict[str, str] = {
        "APP_BASE_URL": base_url.rstrip("/"),
        "AUTH_BASE_URL": auth_url.rstrip("/"),
        "SUPABASE_URL": auth_url.rstrip("/"),
    }

    for provider, cfg in providers.items():
        if provider not in KNOWN_PROVIDERS:
            continue
        enabled = bool(cfg.get("enabled", False))
        client_id = cfg.get("client_id", "").strip()
        client_secret = cfg.get("client_secret", "").strip()

        oauth_config[provider] = {
            "enabled": enabled,
            "client_id": client_id,
            "client_secret": client_secret,
        }

        if enabled and client_id and client_secret:
            key = provider.upper()
            # GoTrue env var convention : GOTRUE_EXTERNAL_<PROVIDER>_ENABLED …
            env_updates[f"GOTRUE_EXTERNAL_{key}_ENABLED"] = "true"
            env_updates[f"GOTRUE_EXTERNAL_{key}_CLIENT_ID"] = client_id
            env_updates[f"GOTRUE_EXTERNAL_{key}_SECRET"] = client_secret
        else:
            key = provider.upper()
            env_updates[f"GOTRUE_EXTERNAL_{key}_ENABLED"] = "false"

    # Provider OIDC personnalisé
    if custom_oidc and custom_oidc.get("enabled"):
        oauth_config["custom_oidc"] = {
            "enabled": True,
            "client_id": custom_oidc.get("client_id", ""),
            "client_secret": custom_oidc.get("client_secret", ""),
            "issuer_url": custom_oidc.get("issuer_url", ""),
        }
        env_updates["GOTRUE_EXTERNAL_OIDC_ENABLED"] = "true"
        env_updates["GOTRUE_EXTERNAL_OIDC_CLIENT_ID"] = custom_oidc.get("client_id", "")
        env_updates["GOTRUE_EXTERNAL_OIDC_SECRET"] = custom_oidc.get("client_secret", "")
        env_updates["GOTRUE_EXTERNAL_OIDC_URL"] = custom_oidc.get("issuer_url", "")

    _write_env(env_updates)

    # Mise à jour de platform_config
    try:
        result = await db.execute(text("SELECT id FROM platform_config LIMIT 1"))
    except Exception as exc:
        raise RuntimeError(
            "La table platform_config n'existe pas — l'étape 1 (BDD) n'a pas encore été complétée."
        ) from exc
    row = result.fetchone()
    if row:
        await db.execute(
            text(
                "UPDATE platform_config "
                "SET oauth_config = CAST(:cfg AS jsonb), base_url = :base, auth_url = :auth, "
                "    setup_step = 3, updated_at = NOW() "
                "WHERE id = :id"
            ),
            {
                "cfg": json.dumps(oauth_config),
                "base": base_url.rstrip("/"),
                "auth": auth_url.rstrip("/"),
                "id": str(row[0]),
            },
        )
    await db.commit()


# ── Étape 3 — Premier administrateur ─────────────────────────────────────────


async def finalize_setup(
    db: AsyncSession,
    supabase_user_id: str,
    email: str,
    full_name: str | None = None,
    avatar_url: str | None = None,
) -> None:
    """Crée le premier admin plateforme et marque le setup comme terminé.

    Le token JWT Supabase est validé en amont par le router ; ici on persiste
    l'utilisateur dans notre table `users` et on marque setup_completed = true.
    """
    # Insère ou met à jour l'utilisateur
    await db.execute(
        text(
            """
            INSERT INTO users (id, email, full_name, avatar_url, is_platform_admin, created_at, updated_at)
            VALUES (:id, :email, :name, :avatar, true, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE
              SET is_platform_admin = true,
                  email = EXCLUDED.email,
                  full_name = EXCLUDED.full_name,
                  updated_at = NOW()
            """
        ),
        {
            "id": supabase_user_id,
            "email": email,
            "name": full_name,
            "avatar": avatar_url,
        },
    )

    # Marque le setup comme terminé
    await db.execute(
        text(
            "UPDATE platform_config "
            "SET setup_completed = true, setup_step = 3, updated_at = NOW()"
        )
    )
    await db.commit()


# ── Vérification du statut ────────────────────────────────────────────────────


async def get_setup_status(db: AsyncSession) -> dict[str, Any]:
    """Retourne le statut courant du setup.

    Returns:
        {
            "setup_completed": bool,
            "setup_step": int,          # 1, 2 ou 3
            "has_admin": bool,
            "db_reachable": bool,
        }
    """
    try:
        result = await db.execute(
            text("SELECT setup_completed, setup_step FROM platform_config LIMIT 1")
        )
        row = result.fetchone()
        if row is None:
            return {
                "setup_completed": False,
                "setup_step": 1,
                "has_admin": False,
                "db_reachable": True,
            }

        # Vérifie s'il existe au moins un admin plateforme
        admin_result = await db.execute(
            text("SELECT 1 FROM users WHERE is_platform_admin = true LIMIT 1")
        )
        has_admin = admin_result.fetchone() is not None

        return {
            "setup_completed": bool(row[0]),
            "setup_step": int(row[1]),
            "has_admin": has_admin,
            "db_reachable": True,
        }
    except Exception:  # noqa: BLE001
        return {
            "setup_completed": False,
            "setup_step": 1,
            "has_admin": False,
            "db_reachable": False,
        }
