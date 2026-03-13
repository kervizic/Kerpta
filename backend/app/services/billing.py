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
    UnitCreate,
    UnitUpdate,
)

DEFAULT_UNITS = ["U", "pce.", "ens.", "h", "jr", "m", "ml", "m\u00b2"]


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
