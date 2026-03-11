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
import logging
import os
import re
import subprocess
import uuid
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)

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
    """Crée ou met à jour l'entrée singleton platform_config après validation BDD."""
    engine = create_async_engine(db_url, echo=False)
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT id FROM platform_config LIMIT 1")
        )
        row = result.fetchone()
        if row is None:
            await conn.execute(
                text(
                    "INSERT INTO platform_config (id, setup_completed, setup_step, updated_at) "
                    "VALUES (:id, false, 2, NOW())"
                ),
                {"id": str(uuid.uuid4())},
            )
        else:
            # Avance l'étape à 2 minimum (sans rétrograder si déjà plus avancé)
            await conn.execute(
                text(
                    "UPDATE platform_config "
                    "SET setup_step = GREATEST(setup_step, 2), updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {"id": str(row[0])},
            )
    await engine.dispose()


# ── Restart GoTrue ────────────────────────────────────────────────────────────


def restart_auth_service() -> None:
    """Recrée kerpta-auth via l'API Docker Unix socket pour que GoTrue
    recharge les variables GOTRUE_EXTERNAL_* depuis .env.

    Un simple `docker restart` ne suffit pas : docker-compose lit env_file
    uniquement à la création du conteneur. Il faut stop → rm → create → start.
    Échoue silencieusement si le socket Docker n'est pas disponible.
    """
    import http.client
    import json as _json
    import socket as _socket
    import time

    class _UnixConn(http.client.HTTPConnection):
        def connect(self) -> None:
            self.sock = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
            self.sock.settimeout(15)
            self.sock.connect("/var/run/docker.sock")

    def _api(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
        c = _UnixConn("localhost")
        headers: dict[str, str] = {}
        data: bytes | None = None
        if body is not None:
            data = _json.dumps(body).encode()
            headers = {"Content-Type": "application/json", "Content-Length": str(len(data))}
        c.request(method, path, body=data, headers=headers)
        r = c.getresponse()
        raw = r.read()
        try:
            parsed = _json.loads(raw) if raw else {}
        except Exception:  # noqa: BLE001
            parsed = {}
        return r.status, parsed

    try:
        # Nouvelles vars GOTRUE_EXTERNAL_* depuis .env (écrites par save_oauth_config)
        env_updates = {
            k: v for k, v in _read_env().items()
            if k.startswith("GOTRUE_EXTERNAL_")
        }
        _log.info(
            "[restart_auth] vars GOTRUE_EXTERNAL_* à injecter : %s",
            {k: ("***" if "SECRET" in k else v) for k, v in env_updates.items()},
        )

        # 1. Inspecter le conteneur courant pour récupérer toute sa config
        status, info = _api("GET", "/v1.41/containers/kerpta-auth/json")
        _log.info("[restart_auth] inspect kerpta-auth → HTTP %s", status)
        if status != 200:
            _log.error("[restart_auth] conteneur introuvable (HTTP %s) : %s", status, info)
            return

        # Fusionner l'env actuel avec les nouvelles vars
        existing_env: dict[str, str] = {}
        for item in info.get("Config", {}).get("Env", []):
            if "=" in item:
                k, _, v = item.partition("=")
                existing_env[k] = v
        existing_env.update(env_updates)
        new_env_list = [f"{k}={v}" for k, v in existing_env.items()]

        # Log de contrôle : vars GOTRUE_EXTERNAL_* qui seront dans le nouveau conteneur
        final_gotrue = {
            k: ("***" if "SECRET" in k else v)
            for k, v in existing_env.items()
            if k.startswith("GOTRUE_EXTERNAL_")
        }
        _log.info("[restart_auth] env GOTRUE_EXTERNAL_* dans le nouveau conteneur : %s", final_gotrue)

        networks: dict = info.get("NetworkSettings", {}).get("Networks", {})
        _log.info("[restart_auth] réseaux : %s", list(networks.keys()))

        # 2. Arrêter le conteneur
        s, r = _api("POST", "/v1.41/containers/kerpta-auth/stop?t=10")
        _log.info("[restart_auth] stop → HTTP %s", s)
        time.sleep(2)

        # 3. Supprimer le conteneur
        s, r = _api("DELETE", "/v1.41/containers/kerpta-auth")
        _log.info("[restart_auth] delete → HTTP %s", s)

        # 4. Créer un nouveau conteneur avec l'env mis à jour
        cfg = info.get("Config", {})
        host_cfg = info.get("HostConfig", {})
        first_net = next(iter(networks), None)
        networking: dict = {}
        if first_net:
            aliases = networks[first_net].get("Aliases") or []
            networking = {"EndpointsConfig": {first_net: {"Aliases": aliases}}}

        create_body: dict = {
            "Image": cfg.get("Image"),
            "Env": new_env_list,
            "Cmd": cfg.get("Cmd"),
            "Entrypoint": cfg.get("Entrypoint"),
            "Labels": cfg.get("Labels", {}),
            "ExposedPorts": cfg.get("ExposedPorts", {}),
            "HostConfig": host_cfg,
            "NetworkingConfig": networking,
        }
        status, result = _api("POST", "/v1.41/containers/create?name=kerpta-auth", create_body)
        _log.info("[restart_auth] create → HTTP %s : %s", status, result)
        if status not in (200, 201):
            _log.error("[restart_auth] échec création conteneur HTTP %s : %s", status, result)
            return

        container_id: str = result.get("Id", "kerpta-auth")

        # Reconnecter aux réseaux supplémentaires
        for net_name, net_cfg in list(networks.items())[1:]:
            aliases = net_cfg.get("Aliases") or []
            s, r = _api(
                "POST",
                f"/v1.41/networks/{net_name}/connect",
                {"Container": container_id, "EndpointConfig": {"Aliases": aliases}},
            )
            _log.info("[restart_auth] connect réseau %s → HTTP %s", net_name, s)

        # 5. Démarrer le nouveau conteneur
        s, r = _api("POST", f"/v1.41/containers/{container_id}/start")
        _log.info("[restart_auth] start → HTTP %s — terminé", s)

    except Exception as exc:  # noqa: BLE001
        _log.exception("[restart_auth] erreur inattendue : %s", exc)


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


async def wait_for_auth_service(max_attempts: int = 15, delay: float = 2.0) -> bool:
    """Attend que GoTrue soit opérationnel après redémarrage (max ≈ 30 s).

    Ajoute d'abord 3 s de pause pour laisser GoTrue recevoir SIGTERM et
    commencer son arrêt, puis sonde /auth/v1/health toutes les `delay` secondes.

    Returns True si GoTrue répond 200 avant le timeout, False sinon.
    """
    import asyncio

    # Petite pause pour que GoTrue ait le temps de commencer à s'arrêter
    # avant qu'on commence à vérifier s'il est de nouveau disponible.
    await asyncio.sleep(3)

    for _ in range(max_attempts):
        health = await check_auth_service_health("")
        if health["ok"]:
            return True
        await asyncio.sleep(delay)

    return False  # timeout — l'admin page affichera un message d'erreur GoTrue


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
    # Récupère la config existante pour préserver les secrets non re-saisis
    try:
        result = await db.execute(
            text("SELECT id, oauth_config FROM platform_config LIMIT 1")
        )
    except Exception as exc:
        raise RuntimeError(
            "La table platform_config n'existe pas — l'étape 1 (BDD) n'a pas encore été complétée."
        ) from exc
    row = result.fetchone()
    existing_oauth: dict = {}
    if row and row[1]:
        existing_oauth = row[1]

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

        # Si le champ secret est vide, conserver le secret existant en base puis en env
        if not client_secret:
            client_secret = existing_oauth.get(provider, {}).get("client_secret", "")
        if not client_secret:
            client_secret = os.getenv(f"GOTRUE_EXTERNAL_{provider.upper()}_SECRET", "").strip()

        oauth_config[provider] = {
            "enabled": enabled,
            "client_id": client_id,
            "client_secret": client_secret,
        }

        key = provider.upper()
        if enabled and client_id and client_secret:
            # GoTrue env var convention : GOTRUE_EXTERNAL_<PROVIDER>_ENABLED …
            env_updates[f"GOTRUE_EXTERNAL_{key}_ENABLED"] = "true"
            env_updates[f"GOTRUE_EXTERNAL_{key}_CLIENT_ID"] = client_id
            env_updates[f"GOTRUE_EXTERNAL_{key}_SECRET"] = client_secret
            # REDIRECT_URI requis par GoTrue pour initialiser le provider OAuth
            env_updates[f"GOTRUE_EXTERNAL_{key}_REDIRECT_URI"] = (
                f"{auth_url.rstrip('/')}/auth/v1/callback"
            )
        else:
            env_updates[f"GOTRUE_EXTERNAL_{key}_ENABLED"] = "false"

    # Provider OIDC personnalisé
    if custom_oidc and custom_oidc.get("enabled"):
        oidc_secret = custom_oidc.get("client_secret", "").strip()
        if not oidc_secret:
            oidc_secret = existing_oauth.get("custom_oidc", {}).get("client_secret", "")
        oauth_config["custom_oidc"] = {
            "enabled": True,
            "client_id": custom_oidc.get("client_id", ""),
            "client_secret": oidc_secret,
            "issuer_url": custom_oidc.get("issuer_url", ""),
        }
        env_updates["GOTRUE_EXTERNAL_OIDC_ENABLED"] = "true"
        env_updates["GOTRUE_EXTERNAL_OIDC_CLIENT_ID"] = custom_oidc.get("client_id", "")
        env_updates["GOTRUE_EXTERNAL_OIDC_SECRET"] = oidc_secret
        env_updates["GOTRUE_EXTERNAL_OIDC_URL"] = custom_oidc.get("issuer_url", "")

    _write_env(env_updates)

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
