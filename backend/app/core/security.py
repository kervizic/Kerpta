# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

bearer_scheme = HTTPBearer()


def decode_supabase_jwt(token: str) -> dict:
    """Décode et valide un JWT Supabase Auth."""
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expiré",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
        )


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UUID:
    """Retourne l'UUID de l'utilisateur depuis le JWT Supabase."""
    payload = decode_supabase_jwt(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sans sujet",
        )
    return UUID(sub)


async def require_platform_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    """Vérifie que l'utilisateur courant est administrateur de la plateforme.

    Bootstrap automatique : si aucun admin n'existe encore (installation fraîche),
    le premier utilisateur authentifié est enregistré comme super-admin.
    Ce mécanisme est inactif dès qu'un admin est en base.
    """
    payload = decode_supabase_jwt(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sans sujet")
    user_id = UUID(sub)

    result = await db.execute(
        text("SELECT is_platform_admin FROM users WHERE id = :id"),
        {"id": user_id},
    )
    row = result.fetchone()

    # L'utilisateur existe déjà en base et est admin → OK direct
    if row is not None and row[0]:
        return user_id

    # L'utilisateur n'est pas admin (pas en base OU is_platform_admin=false)
    # → bootstrap si et seulement si aucun admin n'existe encore
    admin_count_result = await db.execute(
        text("SELECT COUNT(*) FROM users WHERE is_platform_admin = true")
    )
    if (admin_count_result.scalar() or 0) > 0:
        # Un admin existe déjà → cet utilisateur n'est pas autorisé
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs plateforme",
        )

    # Aucun admin en base → premier utilisateur = super-admin
    email = (payload.get("email") or "").strip()
    meta = payload.get("user_metadata") or {}
    if not email and isinstance(meta, dict):
        email = (meta.get("email") or "").strip()
    full_name = ""
    if isinstance(meta, dict):
        full_name = (meta.get("full_name") or meta.get("name") or "").strip()

    if not email:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email manquant dans le token — impossible d'enregistrer le compte admin",
        )

    await db.execute(
        text(
            """
            INSERT INTO users (id, email, full_name, is_platform_admin, created_at)
            VALUES (:id, :email, :full_name, true, now())
            ON CONFLICT (id) DO UPDATE
              SET is_platform_admin = true,
                  email = EXCLUDED.email,
                  full_name = EXCLUDED.full_name
            """
        ),
        {"id": str(user_id), "email": email, "full_name": full_name or None},
    )
    await db.commit()
    return user_id
