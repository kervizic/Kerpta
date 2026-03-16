# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — Gestion du stockage externe (S3, FTP, etc.).

Fournit la gestion des connexions de stockage et l'upload de fichiers
vers le provider configuré par l'organisation.

Tous les PDF sont compressés via pikepdf avant stockage.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.storage.s3 import S3Adapter
from app.storage.utils import compress_pdf, sanitize_folder_name

_log = logging.getLogger(__name__)

VALID_PROVIDERS = ("s3", "ftp", "sftp", "google_drive", "onedrive", "dropbox")


# ── Connexions ─────────────────────────────────────────────────────────────────


async def list_connections(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Liste les connexions de stockage d'une organisation."""
    result = await db.execute(
        text("""
            SELECT id::text, provider, base_path, is_active,
                   last_tested_at, created_at,
                   credentials->>'account_email' AS account_email,
                   credentials->>'endpoint' AS endpoint,
                   credentials->>'bucket' AS bucket,
                   credentials->>'region' AS region,
                   credentials->>'host' AS host
            FROM organization_storage_configs
            WHERE organization_id = :org_id
        """),
        {"org_id": str(org_id)},
    )
    rows = result.fetchall()
    connections = []
    for row in rows:
        r = dict(row._mapping)
        label = _provider_label(r["provider"], r)
        connections.append({
            "id": r["id"],
            "provider": r["provider"],
            "label": label,
            "is_active": r["is_active"],
            "connected_at": str(r["created_at"]) if r["created_at"] else None,
            "last_tested_at": str(r["last_tested_at"]) if r["last_tested_at"] else None,
            "account_email": r.get("account_email"),
            "endpoint": r.get("endpoint"),
            "bucket": r.get("bucket"),
            "region": r.get("region"),
            "host": r.get("host"),
        })
    return connections


def _provider_label(provider: str, data: dict) -> str:
    """Génère un label lisible pour un provider."""
    labels = {
        "s3": "S3 Compatible",
        "ftp": "FTP",
        "sftp": "SFTP",
        "google_drive": "Google Drive",
        "onedrive": "OneDrive",
        "dropbox": "Dropbox",
    }
    base = labels.get(provider, provider)
    if provider == "s3" and data.get("bucket"):
        return f"{base} ({data['bucket']})"
    if provider in ("ftp", "sftp") and data.get("host"):
        return f"{base} ({data['host']})"
    return base


async def connect_storage(
    org_id: uuid.UUID, data: dict, db: AsyncSession
) -> dict:
    """Crée ou met à jour une connexion de stockage."""
    provider = data.get("provider", "")
    if provider not in VALID_PROVIDERS:
        raise HTTPException(422, f"Provider invalide : {provider}")

    # Vérifier qu'il n'y a pas déjà une connexion pour ce provider
    existing = await db.execute(
        text("""
            SELECT id::text FROM organization_storage_configs
            WHERE organization_id = :org_id AND provider = :provider
        """),
        {"org_id": str(org_id), "provider": provider},
    )
    existing_row = existing.fetchone()

    # Construire les credentials selon le provider
    credentials = _build_credentials(provider, data)

    # Tester la connexion avant de sauvegarder
    if provider == "s3":
        adapter = S3Adapter(credentials)
        test_ok, test_msg = adapter.test_connection()
        if not test_ok:
            raise HTTPException(400, f"Connexion S3 échouée : {test_msg}")

    now = datetime.now(timezone.utc)

    if existing_row:
        # Mise à jour
        await db.execute(
            text("""
                UPDATE organization_storage_configs
                SET credentials = CAST(:creds AS jsonb),
                    base_path = :path,
                    is_active = true,
                    last_tested_at = :now,
                    updated_at = :now
                WHERE id = :cid AND organization_id = :org_id
            """),
            {
                "cid": existing_row[0],
                "org_id": str(org_id),
                "creds": json.dumps(credentials),
                "path": data.get("base_path") or data.get("path") or "/",
                "now": now,
            },
        )
        await db.commit()
        return {"id": existing_row[0], "status": "updated"}
    else:
        # Création
        config_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO organization_storage_configs
                    (id, organization_id, provider, credentials, base_path, is_active, last_tested_at, created_at, updated_at)
                VALUES (:id, :org_id, :provider, CAST(:creds AS jsonb), :path, true, :now, :now, :now)
            """),
            {
                "id": str(config_id),
                "org_id": str(org_id),
                "provider": provider,
                "creds": json.dumps(credentials),
                "path": data.get("base_path") or data.get("path") or "/",
                "now": now,
            },
        )
        await db.commit()
        return {"id": str(config_id), "status": "created"}


def _build_credentials(provider: str, data: dict) -> dict:
    """Construit le dict credentials selon le provider."""
    if provider == "s3":
        return {
            "endpoint": data.get("endpoint", ""),
            "access_key": data.get("access_key", ""),
            "secret_key": data.get("secret_key", ""),
            "bucket": data.get("bucket", ""),
            "region": data.get("region", ""),
        }
    if provider in ("ftp", "sftp"):
        return {
            "host": data.get("host", ""),
            "port": int(data.get("port", 22 if provider == "sftp" else 21)),
            "username": data.get("username", ""),
            "password": data.get("password", ""),
        }
    # OAuth providers (google_drive, onedrive, dropbox) — tokens stockés
    return {k: v for k, v in data.items() if k != "provider"}


async def disconnect_storage(
    org_id: uuid.UUID, config_id: str, db: AsyncSession
) -> dict:
    """Supprime une connexion de stockage."""
    result = await db.execute(
        text("""
            DELETE FROM organization_storage_configs
            WHERE id = :cid AND organization_id = :org_id
        """),
        {"cid": config_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Connexion de stockage introuvable")
    await db.commit()
    return {"status": "deleted"}


async def test_connection(
    org_id: uuid.UUID, config_id: str, db: AsyncSession
) -> dict:
    """Teste une connexion de stockage existante."""
    result = await db.execute(
        text("""
            SELECT provider, credentials
            FROM organization_storage_configs
            WHERE id = :cid AND organization_id = :org_id
        """),
        {"cid": config_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Connexion de stockage introuvable")

    provider = row[0]
    credentials = row[1] if isinstance(row[1], dict) else {}

    if provider == "s3":
        adapter = S3Adapter(credentials)
        ok, msg = adapter.test_connection()
    else:
        ok, msg = False, f"Test non implémenté pour {provider}"

    now = datetime.now(timezone.utc)
    await db.execute(
        text("UPDATE organization_storage_configs SET last_tested_at = :now WHERE id = :cid"),
        {"now": now, "cid": config_id},
    )
    await db.commit()

    if ok:
        return {"status": "ok", "message": msg}
    raise HTTPException(400, msg)


# ── Helpers — Arborescence S3 ─────────────────────────────────────────────────


async def get_org_siren(org_id: uuid.UUID, db: AsyncSession) -> str:
    """Récupère le SIREN de l'organisation (pour le dossier racine S3)."""
    result = await db.execute(
        text("SELECT siren FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    return row[0] if row and row[0] else "sans-siren"


async def get_client_folder(
    client_id: str, org_id: uuid.UUID, db: AsyncSession
) -> str:
    """Construit le nom de dossier client : {Nom-Client}_{SIREN}.

    Utilise le SIREN du client (9 premiers chiffres du SIRET) s'il est
    renseigne, sinon le company_siren, sinon l'UUID en fallback.

    Returns:
        Ex: "Dupont-Construction_838377331"
    """
    result = await db.execute(
        text("SELECT name, siret, company_siren, id::text FROM clients WHERE id = :cid AND organization_id = :org_id"),
        {"cid": client_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return f"client-inconnu_{client_id}"
    name_clean = sanitize_folder_name(row[0])
    # SIREN = 9 premiers chiffres du SIRET, sinon company_siren, sinon UUID
    siren = None
    if row[1] and len(row[1].strip()) >= 9:
        siren = row[1].strip()[:9]
    elif row[2]:
        siren = row[2].strip()
    identifier = siren or row[3]
    return f"{name_clean}_{identifier}"


async def get_supplier_folder(
    supplier_id: str, org_id: uuid.UUID, db: AsyncSession
) -> str:
    """Construit le nom de dossier fournisseur : {Nom-Fournisseur}_{SIREN}.

    Utilise le SIREN du fournisseur (9 premiers chiffres du SIRET) s'il est
    renseigne, sinon l'UUID en fallback.
    """
    result = await db.execute(
        text("SELECT name, siret, id::text FROM suppliers WHERE id = :sid AND organization_id = :org_id"),
        {"sid": supplier_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        return f"fournisseur-inconnu_{supplier_id}"
    name_clean = sanitize_folder_name(row[0])
    siren = None
    if row[1] and len(row[1].strip()) >= 9:
        siren = row[1].strip()[:9]
    identifier = siren or row[2]
    return f"{name_clean}_{identifier}"


async def build_document_path(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    doc_type: str,
    filename: str,
    client_id: str | None = None,
    supplier_id: str | None = None,
) -> str:
    """Construit le chemin S3 complet selon l'arborescence Kerpta.

    Structure :
        Kerpta/{SIREN}/clients/{Nom}_{SIREN-client}/{sous-dossier}/{fichier}
        Kerpta/{SIREN}/fournisseurs/{Nom}_{SIREN-fournisseur}/{sous-dossier}/{fichier}

    Args:
        org_id: UUID de l'organisation
        db: session BDD
        doc_type: type de document (facture, devis, bon-commande, bon-livraison, piece-jointe, achat, config)
        filename: nom du fichier PDF
        client_id: UUID du client (si doc client)
        supplier_id: UUID du fournisseur (si doc fournisseur)

    Returns:
        Chemin S3 relatif (ex: "Kerpta/123456789/clients/Dupont_838377331/factures/FA-2026-0001.pdf")
    """
    siren = await get_org_siren(org_id, db)

    # Dossier config à la racine de la société (RIB, etc.)
    if doc_type == "config":
        return f"Kerpta/{siren}/config/{filename}"

    # Mapping type → sous-dossier
    folder_map = {
        "facture": "factures",
        "devis": "devis",
        "bon-commande": "bons-commande",
        "bon-livraison": "bons-livraison",
        "piece-jointe": "pieces-jointes",
        "achat": "achats",
    }
    sub_folder = folder_map.get(doc_type, doc_type)

    if supplier_id:
        entity_folder = await get_supplier_folder(supplier_id, org_id, db)
        return f"Kerpta/{siren}/fournisseurs/{entity_folder}/{sub_folder}/{filename}"

    if client_id:
        entity_folder = await get_client_folder(client_id, org_id, db)
        return f"Kerpta/{siren}/clients/{entity_folder}/{sub_folder}/{filename}"

    # Fallback : dossier racine org (ne devrait pas arriver)
    return f"Kerpta/{siren}/{sub_folder}/{filename}"


# ── Vérification S3 ──────────────────────────────────────────────────────────


async def _get_platform_s3_config(db: AsyncSession) -> dict | None:
    """Récupère la config S3 plateforme depuis platform_config.api_keys->'s3'."""
    result = await db.execute(
        text("SELECT api_keys->'s3' FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    if not row or not row[0]:
        return None
    cfg = row[0] if isinstance(row[0], dict) else {}
    # Vérifier que les champs essentiels sont renseignés
    if cfg.get("endpoint") and cfg.get("access_key") and cfg.get("bucket"):
        return cfg
    return None


async def has_active_storage(org_id: uuid.UUID, db: AsyncSession) -> bool:
    """Vérifie si le stockage S3 plateforme est configuré."""
    return await _get_platform_s3_config(db) is not None


async def require_active_storage(org_id: uuid.UUID, db: AsyncSession) -> None:
    """Lève une HTTPException si le stockage S3 plateforme n'est pas configuré.

    Doit être appelé avant tout upload de fichier (PJ, RIB, etc.).
    """
    if not await has_active_storage(org_id, db):
        raise HTTPException(
            400,
            "Aucun backup S3 configuré pour Kerpta. "
            "Contactez l'administrateur de la plateforme pour configurer "
            "le stockage S3 dans la configuration générale.",
        )


# ── Upload de fichiers ─────────────────────────────────────────────────────────


async def upload_document(
    org_id: uuid.UUID,
    file_bytes: bytes,
    remote_path: str,
    db: AsyncSession,
    *,
    content_type: str = "application/pdf",
) -> str | None:
    """Upload un document vers le stockage S3 plateforme.

    Le PDF est automatiquement compressé avant upload.

    Returns:
        L'URL publique ou le chemin distant du fichier, ou None si pas de stockage configuré.
    """
    s3_config = await _get_platform_s3_config(db)
    if not s3_config:
        return None

    base_path = s3_config.get("base_path", "")

    # Compresser le PDF avant stockage
    if content_type == "application/pdf":
        file_bytes = compress_pdf(file_bytes)

    # Construire le chemin complet
    full_path = f"{base_path.rstrip('/')}/{remote_path.lstrip('/')}" if base_path else remote_path

    adapter = S3Adapter(s3_config)
    url = adapter.upload(file_bytes, full_path, content_type=content_type)
    return url
