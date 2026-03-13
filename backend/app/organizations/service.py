# Kerpta — Service métier pour les organisations
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Logique métier pour la gestion des organisations.

- Création d'une organisation (l'utilisateur devient owner)
- Récupération des memberships de l'utilisateur
- Recherche d'organisations Kerpta existantes
- Gestion des demandes de rattachement
"""

import base64
import io
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile
from PIL import Image
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import JoinRequestCreate, OrgCreateRequest

# Taille max du fichier uploadé (5 MB)
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
# Taille max du logo après traitement Pillow (100 KB en bytes bruts)
_MAX_LOGO_BYTES = 100 * 1024
# Dimensions max du logo stocké
_LOGO_MAX_WIDTH = 400
_LOGO_MAX_HEIGHT = 400
# Dimensions du thumbnail sidebar (2x retina pour affichage 24-32 px)
_THUMB_SIZE = 64
# Formats acceptés
_ACCEPTED_MIME = {"image/png", "image/jpeg", "image/jpg", "image/webp"}


async def get_user_memberships(user_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Retourne la liste des organisations auxquelles appartient l'utilisateur.

    Inclut le thumbnail du logo (logo_thumb_b64) depuis organization_logos
    via un LEFT JOIN — évite de charger le logo pleine résolution.
    """
    result = await db.execute(
        text("""
            SELECT
                om.organization_id::text AS org_id,
                o.name                   AS org_name,
                o.siret                  AS org_siret,
                o.siren                  AS org_siren,
                o.logo_url               AS org_logo_url,
                ol.logo_thumb_b64        AS org_logo_thumb,
                om.role,
                om.joined_at
            FROM organization_memberships om
            JOIN organizations o ON o.id = om.organization_id
            LEFT JOIN organization_logos ol ON ol.organization_id = o.id
            WHERE om.user_id = :uid
            ORDER BY om.created_at ASC
        """),
        {"uid": str(user_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_organization(
    user_id: uuid.UUID, data: OrgCreateRequest, db: AsyncSession
) -> dict:
    """Crée une organisation et enregistre l'utilisateur comme owner."""
    org_id = uuid.uuid4()
    membership_id = uuid.uuid4()

    address_json = json.dumps(data.address) if data.address else None
    capital = str(data.capital) if data.capital is not None else None

    await db.execute(
        text("""
            INSERT INTO organizations (
                id, name, siret, siren, vat_number, legal_form,
                address, email, phone,
                vat_regime, vat_exigibility, accounting_regime,
                rcs_city, capital, ape_code,
                created_at
            ) VALUES (
                :id, :name, :siret, :siren, :vat_number, :legal_form,
                CAST(:address AS jsonb), :email, :phone,
                :vat_regime, :vat_exigibility, :accounting_regime,
                :rcs_city, :capital, :ape_code,
                now()
            )
        """),
        {
            "id": str(org_id),
            "name": data.name,
            "siret": data.siret,
            "siren": data.siren,
            "vat_number": data.vat_number,
            "legal_form": data.legal_form,
            "address": address_json,
            "email": data.email,
            "phone": data.phone,
            "vat_regime": data.vat_regime,
            "vat_exigibility": data.vat_exigibility or "encaissements",
            "accounting_regime": data.accounting_regime,
            "rcs_city": data.rcs_city,
            "capital": capital,
            "ape_code": data.ape_code,
        },
    )

    await db.execute(
        text("""
            INSERT INTO organization_memberships (
                id, user_id, organization_id, role, joined_at, created_at
            ) VALUES (
                :id, :uid, :oid, 'owner', now(), now()
            )
        """),
        {"id": str(membership_id), "uid": str(user_id), "oid": str(org_id)},
    )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        msg = str(exc.orig)
        if "organizations_siret_key" in msg:
            raise HTTPException(409, "Une organisation avec ce SIRET existe déjà sur Kerpta")
        if "organizations" in msg and "unique" in msg.lower():
            raise HTTPException(409, "Cette organisation est déjà enregistrée sur Kerpta")
        raise HTTPException(500, "Erreur lors de la création de l'organisation")

    return {"org_id": str(org_id), "org_name": data.name, "role": "owner"}


async def search_organizations(q: str, db: AsyncSession) -> list[dict]:
    """Recherche des organisations Kerpta par nom ou SIREN/SIRET."""
    q = q.strip()
    if re.fullmatch(r"\d{9,14}", q):
        siren = q[:9]
        result = await db.execute(
            text("""
                SELECT id::text AS org_id, name AS org_name, siret AS org_siret, siren AS org_siren
                FROM organizations
                WHERE siren = :siren
                LIMIT 10
            """),
            {"siren": siren},
        )
    else:
        result = await db.execute(
            text("""
                SELECT id::text AS org_id, name AS org_name, siret AS org_siret, siren AS org_siren
                FROM organizations
                WHERE LOWER(name) LIKE :q
                LIMIT 10
            """),
            {"q": f"%{q.lower()}%"},
        )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_join_request(
    user_id: uuid.UUID,
    org_id: str,
    data: JoinRequestCreate,
    db: AsyncSession,
) -> dict:
    """Soumet une demande de rattachement à une organisation."""
    # Vérifier que l'organisation existe
    org_result = await db.execute(
        text("SELECT id, name FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )
    org = org_result.fetchone()
    if org is None:
        raise HTTPException(404, "Organisation introuvable")

    # Vérifier que l'utilisateur n'est pas déjà membre
    existing_member = await db.execute(
        text("""
            SELECT id FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    if existing_member.fetchone():
        raise HTTPException(409, "Vous êtes déjà membre de cette organisation")

    # Vérifier qu'il n'y a pas déjà une demande pending
    existing_req = await db.execute(
        text("""
            SELECT id, cooldown_until FROM organization_join_requests
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    existing = existing_req.fetchone()
    if existing:
        if existing[1] and existing[1] > datetime.now(timezone.utc):
            raise HTTPException(
                429,
                f"Vous devez attendre jusqu'au {existing[1].strftime('%d/%m/%Y')} "
                "avant de soumettre une nouvelle demande",
            )
        # Supprimer l'ancienne demande pour permettre une nouvelle
        await db.execute(
            text("DELETE FROM organization_join_requests WHERE user_id = :uid AND organization_id = :oid"),
            {"uid": str(user_id), "oid": org_id},
        )

    req_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO organization_join_requests
                (id, organization_id, user_id, message, status, created_at)
            VALUES
                (:id, :oid, :uid, :msg, 'pending', now())
        """),
        {"id": str(req_id), "oid": org_id, "uid": str(user_id), "msg": data.message},
    )
    await db.commit()
    return {
        "id": str(req_id),
        "organization_id": org_id,
        "org_name": org[1],
        "status": "pending",
        "message": data.message,
        "created_at": datetime.now(timezone.utc),
    }


async def get_organization(
    org_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Retourne les détails d'une organisation (réservé aux membres)."""
    result = await db.execute(
        text("""
            SELECT
                o.id::text        AS org_id,
                o.name            AS org_name,
                o.siret           AS org_siret,
                o.siren           AS org_siren,
                o.logo_url        AS org_logo_url,
                o.vat_number,
                o.legal_form,
                o.address,
                o.email,
                o.phone,
                o.vat_regime,
                o.vat_exigibility,
                o.accounting_regime,
                o.rcs_city,
                o.capital::text   AS capital,
                o.capital_variable,
                o.ape_code,
                o.billing_siret,
                o.website,
                o.objet_social,
                o.date_cloture_exercice,
                o.date_immatriculation_rcs,
                o.last_enriched_at,
                o.manual_fields,
                (EXISTS (
                    SELECT 1 FROM organization_logos ol
                    WHERE ol.organization_id = o.id
                )) AS has_logo
            FROM organizations o
            JOIN organization_memberships om
              ON om.organization_id = o.id AND om.user_id = :uid
            WHERE o.id = :oid
        """),
        {"oid": org_id, "uid": str(user_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Organisation introuvable ou accès refusé")
    return dict(row._mapping)


async def upload_logo(
    org_id: str, user_id: uuid.UUID, file: UploadFile, db: AsyncSession
) -> dict:
    """Traite et stocke le logo d'une organisation (owner/admin uniquement).

    Pipeline :
      1. Vérification du rôle
      2. Lecture du fichier (max 5 MB)
      3. Pillow : thumbnail(400×400) + convert RGBA→PNG
      4. Vérification poids < 100 KB
      5. UPSERT dans organization_logos
    """
    # Vérifier le rôle
    membership = await db.execute(
        text("""
            SELECT role FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    m = membership.fetchone()
    if m is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    if m[0] not in ("owner", "admin"):
        raise HTTPException(403, "Seuls les owners et admins peuvent modifier le logo")

    # Vérifier le type MIME
    content_type = file.content_type or ""
    if content_type not in _ACCEPTED_MIME:
        raise HTTPException(
            422,
            f"Format non supporté ({content_type}). "
            "Formats acceptés : PNG, JPG, WebP",
        )

    # Lire le fichier
    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Le fichier est trop volumineux (max 5 MB)")

    # Traitement Pillow
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGBA")
        img.thumbnail((_LOGO_MAX_WIDTH, _LOGO_MAX_HEIGHT), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="PNG", optimize=True)
        png_bytes = output.getvalue()
    except Exception as exc:
        raise HTTPException(422, f"Image invalide ou corrompue : {exc}") from exc

    # Vérifier le poids après traitement
    if len(png_bytes) > _MAX_LOGO_BYTES:
        raise HTTPException(
            422,
            f"Le logo traité est trop lourd ({len(png_bytes) // 1024} KB). "
            "Maximum : 100 KB. Simplifiez l'image ou réduisez sa résolution.",
        )

    width, height = img.size
    b64_data = base64.b64encode(png_bytes).decode("utf-8")
    # Data URI complète pour utilisation directe dans le HTML des factures
    logo_b64 = f"data:image/png;base64,{b64_data}"

    # Thumbnail 64×64 px pour la sidebar (2× retina à 32 px d'affichage)
    # On redimensionne en conservant le ratio (fit dans 64×64),
    # puis on centre dans un canvas carré transparent pour éviter le zoom sur les logos rectangulaires.
    thumb_img = img.copy()
    thumb_img.thumbnail((_THUMB_SIZE, _THUMB_SIZE), Image.LANCZOS)
    square = Image.new("RGBA", (_THUMB_SIZE, _THUMB_SIZE), (255, 255, 255, 0))
    offset_x = (_THUMB_SIZE - thumb_img.width) // 2
    offset_y = (_THUMB_SIZE - thumb_img.height) // 2
    square.paste(thumb_img, (offset_x, offset_y))
    thumb_output = io.BytesIO()
    square.save(thumb_output, format="PNG", optimize=True)
    thumb_b64 = "data:image/png;base64," + base64.b64encode(thumb_output.getvalue()).decode("utf-8")

    # UPSERT (INSERT ou UPDATE si déjà présent)
    existing = await db.execute(
        text("SELECT organization_id FROM organization_logos WHERE organization_id = :oid"),
        {"oid": org_id},
    )
    if existing.fetchone():
        await db.execute(
            text("""
                UPDATE organization_logos
                SET logo_b64 = :b64, logo_thumb_b64 = :thumb,
                    original_name = :name, mime_type = 'image/png',
                    size_bytes = :size, width_px = :w, height_px = :h,
                    updated_at = now()
                WHERE organization_id = :oid
            """),
            {
                "b64": logo_b64,
                "thumb": thumb_b64,
                "name": file.filename,
                "size": len(png_bytes),
                "w": width,
                "h": height,
                "oid": org_id,
            },
        )
    else:
        await db.execute(
            text("""
                INSERT INTO organization_logos
                    (organization_id, logo_b64, logo_thumb_b64, original_name, mime_type,
                     size_bytes, width_px, height_px, created_at, updated_at)
                VALUES
                    (:oid, :b64, :thumb, :name, 'image/png',
                     :size, :w, :h, now(), now())
            """),
            {
                "oid": org_id,
                "b64": logo_b64,
                "thumb": thumb_b64,
                "name": file.filename,
                "size": len(png_bytes),
                "w": width,
                "h": height,
            },
        )

    await db.commit()
    return {
        "organization_id": org_id,
        "logo_b64": logo_b64,
        "original_name": file.filename,
        "mime_type": "image/png",
        "size_bytes": len(png_bytes),
        "width_px": width,
        "height_px": height,
    }


async def get_logo(org_id: str, user_id: uuid.UUID, db: AsyncSession) -> dict:
    """Retourne le logo d'une organisation (réservé aux membres)."""
    # Vérifier membership
    membership = await db.execute(
        text("""
            SELECT 1 FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    if membership.fetchone() is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")

    result = await db.execute(
        text("""
            SELECT organization_id::text, logo_b64, original_name,
                   mime_type, size_bytes, width_px, height_px
            FROM organization_logos
            WHERE organization_id = :oid
        """),
        {"oid": org_id},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Aucun logo pour cette organisation")
    return dict(row._mapping)


async def delete_logo(org_id: str, user_id: uuid.UUID, db: AsyncSession) -> dict:
    """Supprime le logo d'une organisation (owner/admin uniquement)."""
    membership = await db.execute(
        text("""
            SELECT role FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    m = membership.fetchone()
    if m is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    if m[0] not in ("owner", "admin"):
        raise HTTPException(403, "Seuls les owners et admins peuvent supprimer le logo")

    result = await db.execute(
        text("DELETE FROM organization_logos WHERE organization_id = :oid"),
        {"oid": org_id},
    )
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(404, "Aucun logo à supprimer")
    return {"status": "deleted"}


async def update_organization(
    org_id: str, user_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Met à jour les champs modifiables d'une organisation (owner uniquement)."""
    # Vérifier que l'utilisateur est owner
    membership = await db.execute(
        text("""
            SELECT role FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    m = membership.fetchone()
    if m is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    if m[0] not in ("owner", "admin"):
        raise HTTPException(403, "Seuls les owners et admins peuvent modifier la structure")

    # Vérifier que le billing_siret n'est pas fermé (si présent dans le cache SIRENE)
    if data.get("billing_siret"):
        etab_row = await db.execute(
            text("SELECT status FROM establishments WHERE siret = :siret"),
            {"siret": data["billing_siret"]},
        )
        etab = etab_row.fetchone()
        if etab is not None and etab[0] == "closed":
            raise HTTPException(
                422,
                "L'établissement sélectionné est cessé (fermé par l'INSEE) — "
                "il ne peut pas être utilisé pour la facturation",
            )

    # Champs toujours éditables (sans restriction)
    always_allowed = {
        "email", "phone", "website", "vat_regime", "vat_exigibility",
        "accounting_regime", "billing_siret", "logo_url", "manual_fields",
    }
    # Champs synchronisables — éditables uniquement si présents dans manual_fields
    # SIRENE : name, legal_form, siren, siret, vat_number, ape_code, address
    # INPI : capital, capital_variable, objet_social, date_cloture_exercice, date_immatriculation_rcs
    syncable_fields = {
        "name", "legal_form", "siren", "siret", "vat_number", "ape_code", "address",
        "capital", "capital_variable", "objet_social", "date_cloture_exercice", "date_immatriculation_rcs",
    }
    # Champs toujours manuels — toujours éditables
    always_manual = {"rcs_city"}

    # Vérifier le guard par champ pour les champs synchronisables
    syncable_sent = {k for k in data if k in syncable_fields and data[k] is not None}
    if syncable_sent:
        # Déterminer la liste des champs manuels :
        # soit celle envoyée dans cette requête, soit celle en BDD
        current_manual = data.get("manual_fields")
        if current_manual is None:
            org_row = await db.execute(
                text("SELECT manual_fields FROM organizations WHERE id = :oid"),
                {"oid": org_id},
            )
            org_state = org_row.fetchone()
            current_manual = (org_state[0] if org_state else []) or []

        # Bloquer les champs synchronisables qui ne sont pas en mode manuel
        blocked = syncable_sent - set(current_manual)
        if blocked:
            raise HTTPException(
                422,
                f"Les champs suivants ne sont modifiables qu'en mode manuel : "
                f"{', '.join(sorted(blocked))}. "
                "Passez-les en mode manuel avant de les modifier.",
            )

    # Construire la requête UPDATE dynamiquement
    allowed = always_allowed | syncable_fields | always_manual
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(422, "Aucun champ valide à mettre à jour")

    # Gestion des cas spéciaux
    set_parts = []
    params: dict = {"oid": org_id}
    for k, v in updates.items():
        if k == "address":
            # JSONB nécessite un CAST explicite pour asyncpg
            set_parts.append("address = CAST(:address AS jsonb)")
            params["address"] = json.dumps(v) if v is not None else None
        elif k == "capital":
            set_parts.append("capital = :capital")
            params["capital"] = str(v) if v is not None else None
        elif k == "manual_fields":
            set_parts.append("manual_fields = CAST(:manual_fields AS jsonb)")
            params["manual_fields"] = json.dumps(v) if v is not None else "[]"
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    set_clause = ", ".join(set_parts)
    await db.execute(
        text(f"UPDATE organizations SET {set_clause} WHERE id = :oid"),
        params,
    )
    await db.commit()
    return {"status": "updated"}


async def list_join_requests(org_id: str, db: AsyncSession) -> list[dict]:
    """Liste les demandes pending pour une organisation (pour owner/admin)."""
    result = await db.execute(
        text("""
            SELECT
                jr.id::text,
                jr.organization_id::text,
                jr.user_id::text,
                u.email,
                u.full_name,
                u.avatar_url,
                jr.message,
                jr.status,
                jr.created_at
            FROM organization_join_requests jr
            JOIN users u ON u.id = jr.user_id
            WHERE jr.organization_id = :oid AND jr.status = 'pending'
            ORDER BY jr.created_at ASC
        """),
        {"oid": org_id},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def review_join_request(
    reviewer_id: uuid.UUID,
    org_id: str,
    req_id: str,
    action: str,
    role: str | None,
    custom_permissions: list[str] | None,
    db: AsyncSession,
) -> dict:
    """Accepte ou refuse une demande de rattachement."""
    result = await db.execute(
        text("""
            SELECT id, user_id, organization_id, status
            FROM organization_join_requests
            WHERE id = :rid AND organization_id = :oid
        """),
        {"rid": req_id, "oid": org_id},
    )
    req = result.fetchone()
    if req is None:
        raise HTTPException(404, "Demande introuvable")
    if req[3] != "pending":
        raise HTTPException(409, "Demande déjà traitée")

    now = datetime.now(timezone.utc)

    if action == "accept":
        if not role:
            raise HTTPException(422, "Le rôle est obligatoire pour accepter une demande")
        perms_json = json.dumps(custom_permissions) if custom_permissions else "null"
        # Créer le membership
        membership_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO organization_memberships
                    (id, user_id, organization_id, role, custom_permissions, joined_at, created_at)
                VALUES
                    (:id, :uid, :oid, :role, CAST(:perms AS jsonb), :now, :now)
                ON CONFLICT (user_id, organization_id) DO NOTHING
            """),
            {
                "id": str(membership_id),
                "uid": str(req[1]),
                "oid": org_id,
                "role": role,
                "perms": perms_json,
                "now": now,
            },
        )
        await db.execute(
            text("""
                UPDATE organization_join_requests
                SET status = 'accepted', reviewed_by = :reviewer, reviewed_at = :now,
                    role_assigned = :role
                WHERE id = :rid
            """),
            {"reviewer": str(reviewer_id), "now": now, "role": role, "rid": req_id},
        )
    else:  # reject
        cooldown = now + timedelta(days=30)
        await db.execute(
            text("""
                UPDATE organization_join_requests
                SET status = 'rejected', reviewed_by = :reviewer, reviewed_at = :now,
                    cooldown_until = :cooldown
                WHERE id = :rid
            """),
            {"reviewer": str(reviewer_id), "now": now, "cooldown": cooldown, "rid": req_id},
        )

    await db.commit()
    return {"status": "accepted" if action == "accept" else "rejected"}


# ── Configuration des modules ────────────────────────────────────────────────


async def _check_membership(
    org_id: str, user_id: uuid.UUID, db: AsyncSession
) -> str:
    """Vérifie l'appartenance et retourne le rôle."""
    result = await db.execute(
        text("""
            SELECT role FROM organization_memberships
            WHERE user_id = :uid AND organization_id = :oid
        """),
        {"uid": str(user_id), "oid": org_id},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(403, "Vous n'êtes pas membre de cette organisation")
    return row[0]


async def get_module_config(
    org_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Retourne la config des modules (tout membre)."""
    await _check_membership(org_id, user_id, db)

    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Organisation introuvable")
    return row[0] or {}


async def update_module_config(
    org_id: str, user_id: uuid.UUID, config: dict, db: AsyncSession
) -> dict:
    """Met à jour la config des modules (owner uniquement)."""
    role = await _check_membership(org_id, user_id, db)
    if role != "owner":
        raise HTTPException(403, "Seul le propriétaire peut modifier les modules")

    # Valider que toutes les valeurs sont des booléens
    for key, value in config.items():
        if not isinstance(key, str) or not isinstance(value, bool):
            raise HTTPException(400, "Le format attendu est { clé: booléen }")

    await db.execute(
        text("""
            UPDATE organizations
            SET module_config = :config
            WHERE id = :oid
        """),
        {"config": json.dumps(config), "oid": org_id},
    )
    await db.commit()
    return config


# ── Associés (shareholders) CRUD ─────────────────────────────────────────────


async def list_shareholders(
    org_id: str, user_id: uuid.UUID, db: AsyncSession
) -> list[dict]:
    """Liste les associés d'une organisation avec leurs représentants (tout membre)."""
    await _check_membership(org_id, user_id, db)

    result = await db.execute(
        text("""
            SELECT
                s.id::text,
                s.type,
                s.first_name,
                s.last_name,
                s.company_name,
                s.company_siren,
                s.address,
                s.quality,
                s.shares_count,
                s.ownership_pct,
                s.entry_date,
                s.exit_date,
                s.created_at,
                COALESCE(
                    (SELECT json_agg(json_build_object(
                        'id', r.id::text,
                        'first_name', r.first_name,
                        'last_name', r.last_name,
                        'quality', r.quality,
                        'created_at', r.created_at
                    ) ORDER BY r.created_at)
                    FROM shareholder_representatives r
                    WHERE r.shareholder_id = s.id),
                    '[]'::json
                ) AS representatives
            FROM shareholders s
            WHERE s.organization_id = :oid
            ORDER BY s.created_at
        """),
        {"oid": org_id},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_shareholder(
    org_id: str, user_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Crée un associé (owner/admin uniquement)."""
    role = await _check_membership(org_id, user_id, db)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Permission insuffisante")

    sh_id = str(uuid.uuid4())
    representatives = data.pop("representatives", None) or []

    await db.execute(
        text("""
            INSERT INTO shareholders (
                id, organization_id, type,
                first_name, last_name,
                company_name, company_siren,
                address, quality, shares_count, ownership_pct,
                entry_date, exit_date
            ) VALUES (
                :id, :oid, :type,
                :first_name, :last_name,
                :company_name, :company_siren,
                CAST(:address AS jsonb), :quality, :shares_count, :ownership_pct,
                :entry_date, :exit_date
            )
        """),
        {
            "id": sh_id,
            "oid": org_id,
            "type": data.get("type", "physical"),
            "first_name": data.get("first_name"),
            "last_name": data.get("last_name"),
            "company_name": data.get("company_name"),
            "company_siren": data.get("company_siren"),
            "address": json.dumps(data["address"]) if data.get("address") else None,
            "quality": data.get("quality"),
            "shares_count": data.get("shares_count"),
            "ownership_pct": float(data["ownership_pct"]) if data.get("ownership_pct") is not None else None,
            "entry_date": data.get("entry_date"),
            "exit_date": data.get("exit_date"),
        },
    )

    # Créer les représentants si fournis
    for rep in representatives:
        rep_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO shareholder_representatives (id, shareholder_id, first_name, last_name, quality)
                VALUES (:id, :sid, :first_name, :last_name, :quality)
            """),
            {
                "id": rep_id,
                "sid": sh_id,
                "first_name": rep["first_name"],
                "last_name": rep["last_name"],
                "quality": rep.get("quality"),
            },
        )

    await db.commit()

    # Retourner l'associé créé
    return await _get_shareholder_by_id(sh_id, db)


async def update_shareholder(
    org_id: str, sh_id: str, user_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Met à jour un associé (owner/admin uniquement)."""
    role = await _check_membership(org_id, user_id, db)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Permission insuffisante")

    # Vérifier que l'associé appartient à l'organisation
    check = await db.execute(
        text("SELECT 1 FROM shareholders WHERE id = :sid AND organization_id = :oid"),
        {"sid": sh_id, "oid": org_id},
    )
    if check.fetchone() is None:
        raise HTTPException(404, "Associé introuvable")

    if not data:
        return await _get_shareholder_by_id(sh_id, db)

    # Construire le SET dynamique
    set_parts: list[str] = []
    params: dict = {"sid": sh_id}
    for field in (
        "type", "first_name", "last_name", "company_name", "company_siren",
        "quality", "shares_count", "entry_date", "exit_date",
    ):
        if field in data:
            set_parts.append(f"{field} = :{field}")
            params[field] = data[field]

    if "ownership_pct" in data:
        set_parts.append("ownership_pct = :ownership_pct")
        params["ownership_pct"] = float(data["ownership_pct"]) if data["ownership_pct"] is not None else None

    if "address" in data:
        set_parts.append("address = CAST(:address AS jsonb)")
        params["address"] = json.dumps(data["address"]) if data["address"] else None

    if set_parts:
        await db.execute(
            text(f"UPDATE shareholders SET {', '.join(set_parts)} WHERE id = :sid"),
            params,
        )
        await db.commit()

    return await _get_shareholder_by_id(sh_id, db)


async def delete_shareholder(
    org_id: str, sh_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Supprime un associé et ses représentants (owner/admin uniquement)."""
    role = await _check_membership(org_id, user_id, db)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Permission insuffisante")

    result = await db.execute(
        text("DELETE FROM shareholders WHERE id = :sid AND organization_id = :oid RETURNING id"),
        {"sid": sh_id, "oid": org_id},
    )
    if result.fetchone() is None:
        raise HTTPException(404, "Associé introuvable")
    await db.commit()
    return {"ok": True}


async def add_representative(
    org_id: str, sh_id: str, user_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Ajoute un représentant à un associé personne morale (owner/admin)."""
    role = await _check_membership(org_id, user_id, db)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Permission insuffisante")

    # Vérifier que l'associé existe et appartient à l'org
    check = await db.execute(
        text("SELECT type FROM shareholders WHERE id = :sid AND organization_id = :oid"),
        {"sid": sh_id, "oid": org_id},
    )
    row = check.fetchone()
    if row is None:
        raise HTTPException(404, "Associé introuvable")

    rep_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO shareholder_representatives (id, shareholder_id, first_name, last_name, quality)
            VALUES (:id, :sid, :first_name, :last_name, :quality)
        """),
        {
            "id": rep_id,
            "sid": sh_id,
            "first_name": data["first_name"],
            "last_name": data["last_name"],
            "quality": data.get("quality"),
        },
    )
    await db.commit()

    result = await db.execute(
        text("""
            SELECT id::text, first_name, last_name, quality, created_at
            FROM shareholder_representatives WHERE id = :rid
        """),
        {"rid": rep_id},
    )
    return dict(result.fetchone()._mapping)


async def update_representative(
    org_id: str, sh_id: str, rep_id: str, user_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Met à jour un représentant (owner/admin uniquement)."""
    role = await _check_membership(org_id, user_id, db)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Permission insuffisante")

    # Vérifier que l'associé appartient à l'org
    check = await db.execute(
        text("SELECT 1 FROM shareholders WHERE id = :sid AND organization_id = :oid"),
        {"sid": sh_id, "oid": org_id},
    )
    if check.fetchone() is None:
        raise HTTPException(404, "Associé introuvable")

    set_parts: list[str] = []
    params: dict = {"rid": rep_id, "sid": sh_id}
    for field in ("first_name", "last_name", "quality"):
        if field in data:
            set_parts.append(f"{field} = :{field}")
            params[field] = data[field]

    if not set_parts:
        result = await db.execute(
            text("SELECT id::text, first_name, last_name, quality, created_at FROM shareholder_representatives WHERE id = :rid"),
            {"rid": rep_id},
        )
        row = result.fetchone()
        if row is None:
            raise HTTPException(404, "Représentant introuvable")
        return dict(row._mapping)

    result = await db.execute(
        text(f"UPDATE shareholder_representatives SET {', '.join(set_parts)} WHERE id = :rid AND shareholder_id = :sid RETURNING id"),
        params,
    )
    if result.fetchone() is None:
        raise HTTPException(404, "Représentant introuvable")
    await db.commit()

    result = await db.execute(
        text("SELECT id::text, first_name, last_name, quality, created_at FROM shareholder_representatives WHERE id = :rid"),
        {"rid": rep_id},
    )
    return dict(result.fetchone()._mapping)


async def delete_representative(
    org_id: str, sh_id: str, rep_id: str, user_id: uuid.UUID, db: AsyncSession
) -> dict:
    """Supprime un représentant (owner/admin uniquement)."""
    role = await _check_membership(org_id, user_id, db)
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Permission insuffisante")

    # Vérifier que l'associé appartient à l'org
    check = await db.execute(
        text("SELECT 1 FROM shareholders WHERE id = :sid AND organization_id = :oid"),
        {"sid": sh_id, "oid": org_id},
    )
    if check.fetchone() is None:
        raise HTTPException(404, "Associé introuvable")

    result = await db.execute(
        text("DELETE FROM shareholder_representatives WHERE id = :rid AND shareholder_id = :sid RETURNING id"),
        {"rid": rep_id, "sid": sh_id},
    )
    if result.fetchone() is None:
        raise HTTPException(404, "Représentant introuvable")
    await db.commit()
    return {"ok": True}


async def _get_shareholder_by_id(sh_id: str, db: AsyncSession) -> dict:
    """Retourne un associé par son ID avec ses représentants."""
    result = await db.execute(
        text("""
            SELECT
                s.id::text,
                s.type,
                s.first_name,
                s.last_name,
                s.company_name,
                s.company_siren,
                s.address,
                s.quality,
                s.shares_count,
                s.ownership_pct,
                s.entry_date,
                s.exit_date,
                s.created_at,
                COALESCE(
                    (SELECT json_agg(json_build_object(
                        'id', r.id::text,
                        'first_name', r.first_name,
                        'last_name', r.last_name,
                        'quality', r.quality,
                        'created_at', r.created_at
                    ) ORDER BY r.created_at)
                    FROM shareholder_representatives r
                    WHERE r.shareholder_id = s.id),
                    '[]'::json
                ) AS representatives
            FROM shareholders s
            WHERE s.id = :sid
        """),
        {"sid": sh_id},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Associé introuvable")
    return dict(row._mapping)
