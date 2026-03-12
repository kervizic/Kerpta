# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — catalogue produits & services."""

import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.catalog import CoefficientCreate, ProductCreate, ProductUpdate, VariantCreate


async def list_products(
    org_id: uuid.UUID, db: AsyncSession, *, search: str | None = None
) -> list[dict]:
    """Liste les articles du catalogue (non archivés, in_catalog=true)."""
    conditions = ["p.organization_id = :org_id", "p.archived_at IS NULL", "p.is_in_catalog = true"]
    params: dict = {"org_id": str(org_id)}

    if search:
        conditions.append("(LOWER(p.name) LIKE :search OR LOWER(p.reference) LIKE :search)")
        params["search"] = f"%{search.lower()}%"

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"""
            SELECT p.id::text, p.reference, p.name, p.description, p.unit,
                   p.vat_rate, p.account_code, p.client_id::text,
                   p.is_in_catalog, p.purchase_price, p.sale_price_mode,
                   p.unit_price, p.created_at, p.archived_at
            FROM products p WHERE {where}
            ORDER BY p.name ASC
        """),
        params,
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_product(
    org_id: uuid.UUID, data: ProductCreate, db: AsyncSession
) -> dict:
    """Crée un article dans le catalogue."""
    product_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO products (
                id, organization_id, reference, name, description, unit,
                vat_rate, account_code, client_id, is_in_catalog,
                purchase_price, sale_price_mode, unit_price,
                sale_price_coefficient_id, is_composite, created_at
            ) VALUES (
                :id, :org_id, :reference, :name, :description, :unit,
                :vat_rate, :account_code, :client_id, :is_in_catalog,
                :purchase_price, :sale_price_mode, :unit_price,
                :coefficient_id, false, now()
            )
        """),
        {
            "id": str(product_id),
            "org_id": str(org_id),
            "reference": data.reference,
            "name": data.name,
            "description": data.description,
            "unit": data.unit,
            "vat_rate": str(data.vat_rate),
            "account_code": data.account_code,
            "client_id": data.client_id,
            "is_in_catalog": data.is_in_catalog,
            "purchase_price": str(data.purchase_price) if data.purchase_price is not None else None,
            "sale_price_mode": data.sale_price_mode,
            "unit_price": str(data.unit_price) if data.unit_price is not None else None,
            "coefficient_id": data.sale_price_coefficient_id,
        },
    )
    await db.commit()
    return {"id": str(product_id), "name": data.name}


async def get_product(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> dict:
    """Détail d'un article."""
    result = await db.execute(
        text("""
            SELECT p.id::text, p.reference, p.name, p.description, p.unit,
                   p.vat_rate, p.account_code, p.client_id::text,
                   p.is_in_catalog, p.purchase_price, p.sale_price_mode,
                   p.unit_price, p.created_at, p.archived_at
            FROM products p
            WHERE p.id = :pid AND p.organization_id = :org_id
        """),
        {"pid": product_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Article introuvable")
    return dict(row._mapping)


async def update_product(
    org_id: uuid.UUID, product_id: str, data: ProductUpdate, db: AsyncSession
) -> dict:
    """Met à jour un article."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"pid": product_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key in ("vat_rate", "purchase_price", "unit_price") else value

    result = await db.execute(
        text(f"UPDATE products SET {', '.join(set_parts)} WHERE id = :pid AND organization_id = :org_id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Article introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_product(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> dict:
    """Soft delete d'un article."""
    result = await db.execute(
        text("""
            UPDATE products SET archived_at = now()
            WHERE id = :pid AND organization_id = :org_id AND archived_at IS NULL
        """),
        {"pid": product_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Article introuvable ou déjà archivé")
    await db.commit()
    return {"status": "archived"}


async def list_variants(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> list[dict]:
    """Liste les variantes client d'un article."""
    result = await db.execute(
        text("""
            SELECT v.id::text, v.product_id::text, v.client_id::text,
                   v.variant_index, v.override_reference, v.override_name,
                   v.price_mode, v.unit_price, v.is_active,
                   c.name AS client_name
            FROM client_product_variants v
            JOIN clients c ON c.id = v.client_id
            WHERE v.product_id = :pid AND v.organization_id = :org_id
            ORDER BY c.name, v.variant_index
        """),
        {"pid": product_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_variant(
    org_id: uuid.UUID, product_id: str, data: VariantCreate, db: AsyncSession
) -> dict:
    """Crée une variante client pour un article."""
    variant_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO client_product_variants (
                id, organization_id, product_id, client_id, variant_index,
                override_reference, override_name, price_mode, unit_price,
                price_coefficient_id, is_active, created_at
            ) VALUES (
                :id, :org_id, :pid, :cid, :idx,
                :ref, :name, :mode, :price,
                :coef_id, true, now()
            )
        """),
        {
            "id": str(variant_id),
            "org_id": str(org_id),
            "pid": product_id,
            "cid": data.client_id,
            "idx": data.variant_index,
            "ref": data.override_reference,
            "name": data.override_name,
            "mode": data.price_mode,
            "price": str(data.unit_price) if data.unit_price is not None else None,
            "coef_id": data.price_coefficient_id,
        },
    )
    await db.commit()
    return {"id": str(variant_id)}


async def list_coefficients(
    org_id: uuid.UUID, db: AsyncSession
) -> list[dict]:
    """Liste les coefficients de prix de l'organisation."""
    result = await db.execute(
        text("""
            SELECT pc.id::text, pc.name, pc.value, pc.client_id::text, pc.created_at
            FROM price_coefficients pc
            WHERE pc.organization_id = :org_id
            ORDER BY pc.name
        """),
        {"org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_coefficient(
    org_id: uuid.UUID, data: CoefficientCreate, db: AsyncSession
) -> dict:
    """Crée un coefficient de prix."""
    coef_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO price_coefficients (id, organization_id, name, value, client_id, created_at)
            VALUES (:id, :org_id, :name, :value, :client_id, now())
        """),
        {
            "id": str(coef_id),
            "org_id": str(org_id),
            "name": data.name,
            "value": str(data.value),
            "client_id": data.client_id,
        },
    )
    await db.commit()
    return {"id": str(coef_id), "name": data.name}
