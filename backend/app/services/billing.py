# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — facturation (comptes bancaires, profils, unités)."""

import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.billing import (
    BankAccountCreate,
    BankAccountUpdate,
    BillingProfileCreate,
    BillingProfileUpdate,
    PaymentMethodCreate,
    PaymentMethodUpdate,
    UnitCreate,
    UnitUpdate,
)

import json

DEFAULT_UNITS = ["U", "pce.", "ens.", "h", "jr", "m", "ml", "m\u00b2", "kg", "L", "km"]
DEFAULT_PAYMENT_METHODS = ["Virement bancaire", "Chèque", "Carte bancaire", "Espèces", "Prélèvement"]

# Colonnes par défaut des documents (devis/factures)
DEFAULT_DOCUMENT_COLUMNS = {
    "reference": True,
    "description": True,
    "quantity": True,
    "unit": True,
    "unit_price": True,
    "vat_rate": True,
    "discount_percent": True,
    "total_ht": True,
}


# ── Colonnes du document ────────────────────────────────────────────────────


async def get_document_columns(org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Retourne la config des colonnes du document depuis module_config."""
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[0]:
        return DEFAULT_DOCUMENT_COLUMNS.copy()
    config = row[0] if isinstance(row[0], dict) else {}
    return config.get("document_columns", DEFAULT_DOCUMENT_COLUMNS.copy())


async def update_document_columns(
    org_id: uuid.UUID, columns: dict, db: AsyncSession
) -> dict:
    """Met à jour la config des colonnes dans module_config.document_columns."""
    # Lire module_config actuel
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    config = (row[0] if row and row[0] and isinstance(row[0], dict) else {})

    # Fusionner les colonnes avec les valeurs par défaut
    merged = DEFAULT_DOCUMENT_COLUMNS.copy()
    for key in merged:
        if key in columns:
            merged[key] = bool(columns[key])
    config["document_columns"] = merged

    await db.execute(
        text("""
            UPDATE organizations SET module_config = CAST(:config AS jsonb)
            WHERE id = :org_id
        """),
        {"org_id": str(org_id), "config": json.dumps(config)},
    )
    await db.commit()
    return merged


# ── Types de documents (devis) ──────────────────────────────────────────────

DEFAULT_QUOTE_DOCUMENT_TYPES = [
    {
        "key": "devis",
        "title": "Devis",
        "columns": {
            "reference": True, "description": True, "quantity": True,
            "unit": True, "unit_price": True, "vat_rate": True,
            "discount_percent": True, "total_ht": True,
        },
    },
    {
        "key": "bpu",
        "title": "Bordereau de prix",
        "columns": {
            "reference": True, "description": True, "quantity": False,
            "unit": True, "unit_price": True, "vat_rate": True,
            "discount_percent": False, "total_ht": False,
        },
    },
    {
        "key": "attachement",
        "title": "Attachement",
        "columns": {
            "reference": True, "description": True, "quantity": True,
            "unit": True, "unit_price": True, "vat_rate": True,
            "discount_percent": True, "total_ht": True,
        },
    },
]


async def get_quote_document_types(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Retourne les types de documents devis depuis module_config."""
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[0]:
        return [t.copy() for t in DEFAULT_QUOTE_DOCUMENT_TYPES]
    config = row[0] if isinstance(row[0], dict) else {}
    return config.get("quote_document_types", [t.copy() for t in DEFAULT_QUOTE_DOCUMENT_TYPES])


async def update_quote_document_types(
    org_id: uuid.UUID, types: list[dict], db: AsyncSession
) -> list[dict]:
    """Met à jour les types de documents devis dans module_config."""
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    config = (row[0] if row and row[0] and isinstance(row[0], dict) else {})

    # Valider chaque type
    validated = []
    for t in types:
        if not t.get("key") or not t.get("title"):
            continue
        columns = t.get("columns", {})
        validated.append({
            "key": str(t["key"]).strip().lower().replace(" ", "_"),
            "title": str(t["title"]).strip(),
            "columns": {
                k: bool(columns.get(k, True))
                for k in DEFAULT_DOCUMENT_COLUMNS
            },
        })

    if not validated:
        raise HTTPException(422, "Au moins un type de document est requis")

    config["quote_document_types"] = validated

    await db.execute(
        text("""
            UPDATE organizations SET module_config = CAST(:config AS jsonb)
            WHERE id = :org_id
        """),
        {"org_id": str(org_id), "config": json.dumps(config)},
    )
    await db.commit()
    return validated


# ── Taux de TVA ────────────────────────────────────────────────────────────

DEFAULT_VAT_RATES = [
    {"rate": "20", "label": "TVA 20%"},
    {"rate": "10", "label": "TVA 10%"},
    {"rate": "5.5", "label": "TVA 5,5%"},
    {"rate": "2.1", "label": "TVA 2,1%"},
    {"rate": "0", "label": "TVA 0%"},
]


async def get_vat_rates(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Retourne la config des taux de TVA depuis module_config."""
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[0]:
        return [r.copy() for r in DEFAULT_VAT_RATES]
    config = row[0] if isinstance(row[0], dict) else {}
    return config.get("vat_rates", [r.copy() for r in DEFAULT_VAT_RATES])


async def update_vat_rates(
    org_id: uuid.UUID, rates: list[dict], db: AsyncSession
) -> list[dict]:
    """Met à jour les taux de TVA dans module_config.vat_rates."""
    # Valider les entrées
    cleaned = []
    for r in rates:
        rate_str = str(r.get("rate", "")).strip()
        label_str = str(r.get("label", "")).strip()
        if not rate_str:
            continue
        cleaned.append({"rate": rate_str, "label": label_str or f"{rate_str}%"})

    if not cleaned:
        raise HTTPException(422, "Au moins un taux de TVA est requis")

    # Lire module_config actuel
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    config = (row[0] if row and row[0] and isinstance(row[0], dict) else {})

    config["vat_rates"] = cleaned

    await db.execute(
        text("""
            UPDATE organizations SET module_config = CAST(:config AS jsonb)
            WHERE id = :org_id
        """),
        {"org_id": str(org_id), "config": json.dumps(config)},
    )
    await db.commit()
    return cleaned


# ── Arrondis ──────────────────────────────────────────────────────────────────

DEFAULT_ROUNDING = {
    "quantity_display": 2,       # Décimales affichées pour la quantité
    "quantity_calc": 4,          # Décimales de calcul pour la quantité
    "unit_price_display": 2,     # Décimales affichées pour le prix unitaire
    "unit_price_calc": 4,        # Décimales de calcul pour le prix unitaire
}


async def get_rounding(org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Retourne la config des arrondis depuis module_config.rounding."""
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row or not row[0]:
        return DEFAULT_ROUNDING.copy()
    config = row[0] if isinstance(row[0], dict) else {}
    stored = config.get("rounding", {})
    # Fusionner avec les défauts
    merged = DEFAULT_ROUNDING.copy()
    for key in merged:
        if key in stored:
            merged[key] = max(0, min(6, int(stored[key])))
    return merged


async def update_rounding(
    org_id: uuid.UUID, rounding: dict, db: AsyncSession
) -> dict:
    """Met à jour la config des arrondis dans module_config.rounding."""
    result = await db.execute(
        text("SELECT module_config FROM organizations WHERE id = :org_id"),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    config = (row[0] if row and row[0] and isinstance(row[0], dict) else {})

    merged = DEFAULT_ROUNDING.copy()
    for key in merged:
        if key in rounding:
            merged[key] = max(0, min(6, int(rounding[key])))
    config["rounding"] = merged

    await db.execute(
        text("""
            UPDATE organizations SET module_config = CAST(:config AS jsonb)
            WHERE id = :org_id
        """),
        {"org_id": str(org_id), "config": json.dumps(config)},
    )
    await db.commit()
    return merged


# ── Comptes bancaires ────────────────────────────────────────────────────────


async def list_bank_accounts(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT id::text, label, bank_name, iban, bic, is_default, created_at
            FROM bank_accounts
            WHERE organization_id = :org_id
            ORDER BY is_default DESC, label
        """),
        {"org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_bank_account(
    org_id: uuid.UUID, data: BankAccountCreate, db: AsyncSession
) -> dict:
    account_id = uuid.uuid4()

    if data.is_default:
        await db.execute(
            text("UPDATE bank_accounts SET is_default = false WHERE organization_id = :org_id AND is_default = true"),
            {"org_id": str(org_id)},
        )

    await db.execute(
        text("""
            INSERT INTO bank_accounts (id, organization_id, label, bank_name, iban, bic, is_default, created_at)
            VALUES (:id, :org_id, :label, :bank_name, :iban, :bic, :is_default, now())
        """),
        {
            "id": str(account_id),
            "org_id": str(org_id),
            "label": data.label,
            "bank_name": data.bank_name,
            "iban": data.iban,
            "bic": data.bic,
            "is_default": data.is_default,
        },
    )
    await db.commit()
    return {"id": str(account_id), "label": data.label}


async def update_bank_account(
    org_id: uuid.UUID, account_id: str, data: BankAccountUpdate, db: AsyncSession
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    if updates.get("is_default") is True:
        await db.execute(
            text("UPDATE bank_accounts SET is_default = false WHERE organization_id = :org_id AND is_default = true"),
            {"org_id": str(org_id)},
        )

    set_parts = []
    params: dict = {"aid": account_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value

    result = await db.execute(
        text(f"UPDATE bank_accounts SET {', '.join(set_parts)} WHERE id = :aid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Compte bancaire introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_bank_account(
    org_id: uuid.UUID, account_id: str, db: AsyncSession
) -> dict:
    # Vérifier pas utilisé par un profil
    usage = await db.execute(
        text("SELECT COUNT(*) FROM billing_profiles WHERE bank_account_id = :aid"),
        {"aid": account_id},
    )
    if (usage.scalar() or 0) > 0:
        raise HTTPException(409, "Compte utilisé par un profil de facturation")

    result = await db.execute(
        text("DELETE FROM bank_accounts WHERE id = :aid AND organization_id = :org_id"),
        {"aid": account_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Compte bancaire introuvable")
    await db.commit()
    return {"status": "deleted"}


# ── Profils de facturation ───────────────────────────────────────────────────


async def list_billing_profiles(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT bp.id::text, bp.name, bp.bank_account_id::text,
                   ba.label AS bank_account_label, ba.iban AS bank_account_iban,
                   bp.payment_terms, bp.payment_term_type, bp.payment_term_day,
                   bp.payment_method,
                   bp.late_penalty_rate, bp.discount_rate,
                   bp.recovery_fee,
                   bp.early_payment_discount, bp.payment_note,
                   bp.legal_mentions_auto, bp.legal_mentions,
                   bp.footer, bp.is_default, bp.created_at
            FROM billing_profiles bp
            LEFT JOIN bank_accounts ba ON ba.id = bp.bank_account_id
            WHERE bp.organization_id = :org_id
            ORDER BY bp.is_default DESC, bp.name
        """),
        {"org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_billing_profile(
    org_id: uuid.UUID, data: BillingProfileCreate, db: AsyncSession
) -> dict:
    profile_id = uuid.uuid4()

    if data.is_default:
        await db.execute(
            text("UPDATE billing_profiles SET is_default = false WHERE organization_id = :org_id AND is_default = true"),
            {"org_id": str(org_id)},
        )

    await db.execute(
        text("""
            INSERT INTO billing_profiles (
                id, organization_id, name, bank_account_id, payment_terms,
                payment_term_type, payment_term_day,
                payment_method, late_penalty_rate, discount_rate,
                recovery_fee, early_payment_discount,
                payment_note, legal_mentions_auto,
                legal_mentions, footer, is_default, created_at
            ) VALUES (
                :id, :org_id, :name, :bank_id, :terms,
                :term_type, :term_day,
                :method, :penalty, :discount,
                :recovery_fee, :early_discount,
                :payment_note, :legal_auto,
                :mentions, :footer, :is_default, now()
            )
        """),
        {
            "id": str(profile_id),
            "org_id": str(org_id),
            "name": data.name,
            "bank_id": data.bank_account_id,
            "terms": data.payment_terms,
            "term_type": data.payment_term_type,
            "term_day": data.payment_term_day,
            "method": data.payment_method,
            "penalty": str(data.late_penalty_rate) if data.late_penalty_rate is not None else None,
            "discount": str(data.discount_rate) if data.discount_rate is not None else None,
            "recovery_fee": str(data.recovery_fee),
            "early_discount": data.early_payment_discount,
            "payment_note": data.payment_note,
            "legal_auto": data.legal_mentions_auto,
            "mentions": data.legal_mentions,
            "footer": data.footer,
            "is_default": data.is_default,
        },
    )
    await db.commit()
    return {"id": str(profile_id), "name": data.name}


async def update_billing_profile(
    org_id: uuid.UUID, profile_id: str, data: BillingProfileUpdate, db: AsyncSession
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    if updates.get("is_default") is True:
        await db.execute(
            text("UPDATE billing_profiles SET is_default = false WHERE organization_id = :org_id AND is_default = true"),
            {"org_id": str(org_id)},
        )

    set_parts = []
    params: dict = {"pid": profile_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key in ("late_penalty_rate", "discount_rate", "recovery_fee") else value

    result = await db.execute(
        text(f"UPDATE billing_profiles SET {', '.join(set_parts)} WHERE id = :pid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Profil introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_billing_profile(
    org_id: uuid.UUID, profile_id: str, db: AsyncSession
) -> dict:
    result = await db.execute(
        text("DELETE FROM billing_profiles WHERE id = :pid AND organization_id = :org_id"),
        {"pid": profile_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Profil introuvable")
    await db.commit()
    return {"status": "deleted"}


# ── Unités personnalisées ────────────────────────────────────────────────────


async def list_units(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT id::text, label, position
            FROM custom_units
            WHERE organization_id = :org_id
            ORDER BY position, label
        """),
        {"org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_unit(
    org_id: uuid.UUID, data: UnitCreate, db: AsyncSession
) -> dict:
    unit_id = uuid.uuid4()

    # Position = max + 1
    pos_result = await db.execute(
        text("SELECT COALESCE(MAX(position), -1) + 1 FROM custom_units WHERE organization_id = :org_id"),
        {"org_id": str(org_id)},
    )
    position = pos_result.scalar() or 0

    await db.execute(
        text("""
            INSERT INTO custom_units (id, organization_id, label, position)
            VALUES (:id, :org_id, :label, :pos)
        """),
        {"id": str(unit_id), "org_id": str(org_id), "label": data.label, "pos": position},
    )
    await db.commit()
    return {"id": str(unit_id), "label": data.label}


async def update_unit(
    org_id: uuid.UUID, unit_id: str, data: UnitUpdate, db: AsyncSession
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"uid": unit_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value

    result = await db.execute(
        text(f"UPDATE custom_units SET {', '.join(set_parts)} WHERE id = :uid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Unité introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_unit(
    org_id: uuid.UUID, unit_id: str, db: AsyncSession
) -> dict:
    result = await db.execute(
        text("DELETE FROM custom_units WHERE id = :uid AND organization_id = :org_id"),
        {"uid": unit_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Unité introuvable")
    await db.commit()
    return {"status": "deleted"}


async def seed_default_units(org_id: uuid.UUID, db: AsyncSession) -> None:
    """Crée les unités par défaut pour une nouvelle organisation."""
    for i, label in enumerate(DEFAULT_UNITS):
        await db.execute(
            text("""
                INSERT INTO custom_units (id, organization_id, label, position)
                VALUES (:id, :org_id, :label, :pos)
                ON CONFLICT (organization_id, label) DO NOTHING
            """),
            {"id": str(uuid.uuid4()), "org_id": str(org_id), "label": label, "pos": i},
        )


# ── Modes de règlement ──────────────────────────────────────────────────────


async def list_payment_methods(org_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT id::text, label, position
            FROM payment_methods
            WHERE organization_id = :org_id
            ORDER BY position, label
        """),
        {"org_id": str(org_id)},
    )
    rows = [dict(row._mapping) for row in result.fetchall()]
    if not rows:
        # Auto-seed les valeurs par défaut pour les orgs existantes
        await seed_default_payment_methods(org_id, db)
        await db.commit()
        return await list_payment_methods(org_id, db)
    return rows


async def create_payment_method(
    org_id: uuid.UUID, data: PaymentMethodCreate, db: AsyncSession
) -> dict:
    method_id = uuid.uuid4()

    pos_result = await db.execute(
        text("SELECT COALESCE(MAX(position), -1) + 1 FROM payment_methods WHERE organization_id = :org_id"),
        {"org_id": str(org_id)},
    )
    position = pos_result.scalar() or 0

    await db.execute(
        text("""
            INSERT INTO payment_methods (id, organization_id, label, position)
            VALUES (:id, :org_id, :label, :pos)
        """),
        {"id": str(method_id), "org_id": str(org_id), "label": data.label, "pos": position},
    )
    await db.commit()
    return {"id": str(method_id), "label": data.label}


async def update_payment_method(
    org_id: uuid.UUID, method_id: str, data: PaymentMethodUpdate, db: AsyncSession
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"mid": method_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value

    result = await db.execute(
        text(f"UPDATE payment_methods SET {', '.join(set_parts)} WHERE id = :mid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Mode de règlement introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_payment_method(
    org_id: uuid.UUID, method_id: str, db: AsyncSession
) -> dict:
    result = await db.execute(
        text("DELETE FROM payment_methods WHERE id = :mid AND organization_id = :org_id"),
        {"mid": method_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Mode de règlement introuvable")
    await db.commit()
    return {"status": "deleted"}


async def seed_default_payment_methods(org_id: uuid.UUID, db: AsyncSession) -> None:
    """Crée les modes de règlement par défaut pour une nouvelle organisation."""
    for i, label in enumerate(DEFAULT_PAYMENT_METHODS):
        await db.execute(
            text("""
                INSERT INTO payment_methods (id, organization_id, label, position)
                VALUES (:id, :org_id, :label, :pos)
                ON CONFLICT (organization_id, label) DO NOTHING
            """),
            {"id": str(uuid.uuid4()), "org_id": str(org_id), "label": label, "pos": i},
        )


DEFAULT_BILLING_PROFILES = [
    {
        "name": "Comptant — Virement",
        "payment_terms": 0,
        "payment_term_type": "net",
        "payment_method": "Virement bancaire",
        "is_default": True,
    },
    {
        "name": "30 jours net",
        "payment_terms": 30,
        "payment_term_type": "net",
        "payment_method": None,
        "is_default": False,
    },
    {
        "name": "45 jours fin de mois",
        "payment_terms": 45,
        "payment_term_type": "end_of_month",
        "payment_method": None,
        "is_default": False,
    },
]


async def seed_default_billing_profiles(org_id: uuid.UUID, db: AsyncSession) -> None:
    """Crée les profils de facturation par défaut pour une nouvelle organisation."""
    for profile in DEFAULT_BILLING_PROFILES:
        await db.execute(
            text("""
                INSERT INTO billing_profiles (
                    id, organization_id, name, payment_terms, payment_term_type,
                    payment_method, recovery_fee, legal_mentions_auto, is_default, created_at
                ) VALUES (
                    :id, :org_id, :name, :terms, :term_type,
                    :method, 40.00, true, :is_default, now()
                )
                ON CONFLICT DO NOTHING
            """),
            {
                "id": str(uuid.uuid4()),
                "org_id": str(org_id),
                "name": profile["name"],
                "terms": profile["payment_terms"],
                "term_type": profile["payment_term_type"],
                "method": profile["payment_method"],
                "is_default": profile["is_default"],
            },
        )
