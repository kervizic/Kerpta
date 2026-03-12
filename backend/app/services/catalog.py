# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — catalogue produits & services."""

import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.catalog import (
    CoefficientCreate,
    CoefficientUpdate,
    ComponentCreate,
    ComponentUpdate,
    ProductCreate,
    ProductUpdate,
    PurchaseLinkCreate,
    PurchaseLinkUpdate,
    QuantityDiscountCreate,
    QuantityDiscountUpdate,
    VariantCreate,
    VariantUpdate,
)

# ── Colonnes SELECT réutilisées ──────────────────────────────────────────────

_PRODUCT_COLS = """
    p.id::text, p.reference, p.name, p.description, p.unit,
    p.vat_rate, p.account_code, p.client_id::text,
    p.is_in_catalog, p.purchase_price, p.sale_price_mode,
    p.unit_price, p.sale_price_coefficient_id::text,
    p.is_composite, p.created_at, p.archived_at,
    pc.name AS coefficient_name, pc.value AS coefficient_value
"""


# ── Produits ─────────────────────────────────────────────────────────────────


async def list_products(
    org_id: uuid.UUID,
    db: AsyncSession,
    *,
    search: str | None = None,
    client_id: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    """Liste paginée des articles du catalogue (non archivés)."""
    conditions = ["p.organization_id = :org_id", "p.archived_at IS NULL"]
    params: dict = {"org_id": str(org_id)}

    if client_id:
        # Articles visibles pour ce client : catalogue général + articles spécifiques client
        conditions.append("(p.is_in_catalog = true OR p.client_id = :client_id)")
        params["client_id"] = client_id
    else:
        conditions.append("p.is_in_catalog = true")

    if search:
        conditions.append("(LOWER(p.name) LIKE :search OR LOWER(p.reference) LIKE :search)")
        params["search"] = f"%{search.lower()}%"

    where = " AND ".join(conditions)

    # Compter le total
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM products p WHERE {where}"), params
    )
    total = count_result.scalar() or 0

    # Requête paginée avec JOIN coefficient
    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT {_PRODUCT_COLS}
            FROM products p
            LEFT JOIN price_coefficients pc ON pc.id = p.sale_price_coefficient_id
            WHERE {where}
            ORDER BY p.name ASC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [dict(row._mapping) for row in result.fetchall()]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


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
    """Détail d'un article avec le nom du coefficient si applicable."""
    result = await db.execute(
        text(f"""
            SELECT {_PRODUCT_COLS}
            FROM products p
            LEFT JOIN price_coefficients pc ON pc.id = p.sale_price_coefficient_id
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


# ── Variantes client ─────────────────────────────────────────────────────────


async def list_variants(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> list[dict]:
    """Liste les variantes client d'un article."""
    result = await db.execute(
        text("""
            SELECT v.id::text, v.product_id::text, v.client_id::text,
                   v.variant_index, v.override_reference, v.override_name,
                   v.price_mode, v.unit_price, v.price_coefficient_id::text,
                   v.is_active, c.name AS client_name,
                   pc.name AS coefficient_name, pc.value AS coefficient_value
            FROM client_product_variants v
            JOIN clients c ON c.id = v.client_id
            LEFT JOIN price_coefficients pc ON pc.id = v.price_coefficient_id
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


async def update_variant(
    org_id: uuid.UUID, variant_id: str, data: VariantUpdate, db: AsyncSession
) -> dict:
    """Met à jour une variante client."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"vid": variant_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key == "unit_price" else value

    result = await db.execute(
        text(f"""
            UPDATE client_product_variants SET {', '.join(set_parts)}
            WHERE id = :vid AND organization_id = :org_id
        """),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Variante introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_variant(
    org_id: uuid.UUID, variant_id: str, db: AsyncSession
) -> dict:
    """Supprime une variante client."""
    result = await db.execute(
        text("""
            DELETE FROM client_product_variants
            WHERE id = :vid AND organization_id = :org_id
        """),
        {"vid": variant_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Variante introuvable")
    await db.commit()
    return {"status": "deleted"}


# ── Coefficients de prix ─────────────────────────────────────────────────────


async def list_coefficients(
    org_id: uuid.UUID, db: AsyncSession
) -> list[dict]:
    """Liste les coefficients de prix de l'organisation."""
    result = await db.execute(
        text("""
            SELECT pc.id::text, pc.name, pc.value, pc.client_id::text,
                   c.name AS client_name, pc.created_at
            FROM price_coefficients pc
            LEFT JOIN clients c ON c.id = pc.client_id
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


async def update_coefficient(
    org_id: uuid.UUID, coef_id: str, data: CoefficientUpdate, db: AsyncSession
) -> dict:
    """Met à jour un coefficient de prix."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"cid": coef_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key == "value" else value

    result = await db.execute(
        text(f"""
            UPDATE price_coefficients SET {', '.join(set_parts)}
            WHERE id = :cid AND organization_id = :org_id
        """),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Coefficient introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_coefficient(
    org_id: uuid.UUID, coef_id: str, db: AsyncSession
) -> dict:
    """Supprime un coefficient (vérifie qu'il n'est pas utilisé)."""
    # Vérifier pas d'utilisation
    usage = await db.execute(
        text("""
            SELECT COUNT(*) FROM (
                SELECT 1 FROM products WHERE sale_price_coefficient_id = :cid
                UNION ALL
                SELECT 1 FROM client_product_variants WHERE price_coefficient_id = :cid
                UNION ALL
                SELECT 1 FROM product_purchase_links WHERE price_coefficient_id = :cid
            ) sub
        """),
        {"cid": coef_id},
    )
    count = usage.scalar() or 0
    if count > 0:
        raise HTTPException(409, f"Coefficient utilisé par {count} article(s)/variante(s)")

    result = await db.execute(
        text("DELETE FROM price_coefficients WHERE id = :cid AND organization_id = :org_id"),
        {"cid": coef_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Coefficient introuvable")
    await db.commit()
    return {"status": "deleted"}


# ── Liens achats fournisseur ─────────────────────────────────────────────────


async def list_purchase_links(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> list[dict]:
    """Liste les liens achats d'un article."""
    result = await db.execute(
        text("""
            SELECT pl.id::text, pl.product_id::text, pl.supplier_id::text,
                   pl.supplier_reference, pl.purchase_price,
                   pl.sale_price_mode, pl.fixed_sale_price,
                   pl.price_coefficient_id::text, pl.is_default, pl.created_at,
                   s.name AS supplier_name,
                   pc.name AS coefficient_name, pc.value AS coefficient_value
            FROM product_purchase_links pl
            LEFT JOIN suppliers s ON s.id = pl.supplier_id
            LEFT JOIN price_coefficients pc ON pc.id = pl.price_coefficient_id
            WHERE pl.product_id = :pid
              AND EXISTS (SELECT 1 FROM products p WHERE p.id = pl.product_id AND p.organization_id = :org_id)
            ORDER BY pl.is_default DESC, s.name
        """),
        {"pid": product_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_purchase_link(
    org_id: uuid.UUID, product_id: str, data: PurchaseLinkCreate, db: AsyncSession
) -> dict:
    """Crée un lien achat fournisseur pour un article."""
    link_id = uuid.uuid4()

    # Si is_default, désactiver les autres
    if data.is_default:
        await db.execute(
            text("""
                UPDATE product_purchase_links SET is_default = false
                WHERE product_id = :pid AND is_default = true
            """),
            {"pid": product_id},
        )

    await db.execute(
        text("""
            INSERT INTO product_purchase_links (
                id, product_id, supplier_id, supplier_reference,
                purchase_price, sale_price_mode, fixed_sale_price,
                price_coefficient_id, is_default, created_at
            ) VALUES (
                :id, :pid, :sid, :ref,
                :price, :mode, :fixed,
                :coef_id, :default, now()
            )
        """),
        {
            "id": str(link_id),
            "pid": product_id,
            "sid": data.supplier_id,
            "ref": data.supplier_reference,
            "price": str(data.purchase_price) if data.purchase_price is not None else None,
            "mode": data.sale_price_mode,
            "fixed": str(data.fixed_sale_price) if data.fixed_sale_price is not None else None,
            "coef_id": data.price_coefficient_id,
            "default": data.is_default,
        },
    )
    await db.commit()
    return {"id": str(link_id)}


async def update_purchase_link(
    org_id: uuid.UUID, link_id: str, data: PurchaseLinkUpdate, db: AsyncSession
) -> dict:
    """Met à jour un lien achat fournisseur."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"lid": link_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key in ("purchase_price", "fixed_sale_price") else value

    result = await db.execute(
        text(f"""
            UPDATE product_purchase_links SET {', '.join(set_parts)}
            WHERE id = :lid
              AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_purchase_links.product_id AND p.organization_id = :org_id)
        """),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Lien achat introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_purchase_link(
    org_id: uuid.UUID, link_id: str, db: AsyncSession
) -> dict:
    """Supprime un lien achat fournisseur."""
    result = await db.execute(
        text("""
            DELETE FROM product_purchase_links
            WHERE id = :lid
              AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_purchase_links.product_id AND p.organization_id = :org_id)
        """),
        {"lid": link_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Lien achat introuvable")
    await db.commit()
    return {"status": "deleted"}


# ── Composition d'articles ───────────────────────────────────────────────────


async def list_components(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> list[dict]:
    """Liste les composants d'un article composite."""
    result = await db.execute(
        text("""
            SELECT c.id::text, c.parent_product_id::text, c.component_product_id::text,
                   c.quantity, c.unit, c.position,
                   p.name AS component_name, p.reference AS component_reference,
                   p.unit_price AS component_unit_price
            FROM product_components c
            JOIN products p ON p.id = c.component_product_id
            WHERE c.parent_product_id = :pid
              AND EXISTS (SELECT 1 FROM products pp WHERE pp.id = :pid AND pp.organization_id = :org_id)
            ORDER BY c.position, p.name
        """),
        {"pid": product_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def add_component(
    org_id: uuid.UUID, product_id: str, data: ComponentCreate, db: AsyncSession
) -> dict:
    """Ajoute un composant à un article composite."""
    # Vérifier pas de cycle (A→B→A)
    if data.component_product_id == product_id:
        raise HTTPException(422, "Un article ne peut pas être composant de lui-même")

    # Vérifier que le composant n'est pas déjà parent de cet article (cycle)
    cycle = await db.execute(
        text("""
            SELECT 1 FROM product_components
            WHERE parent_product_id = :comp AND component_product_id = :parent
        """),
        {"comp": data.component_product_id, "parent": product_id},
    )
    if cycle.fetchone():
        raise HTTPException(422, "Référence circulaire détectée")

    comp_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO product_components (id, parent_product_id, component_product_id, quantity, unit, position)
            VALUES (:id, :pid, :cid, :qty, :unit, :pos)
        """),
        {
            "id": str(comp_id),
            "pid": product_id,
            "cid": data.component_product_id,
            "qty": str(data.quantity),
            "unit": data.unit,
            "pos": data.position,
        },
    )

    # Mettre is_composite = true si premier composant
    await db.execute(
        text("UPDATE products SET is_composite = true WHERE id = :pid AND organization_id = :org_id"),
        {"pid": product_id, "org_id": str(org_id)},
    )
    await db.commit()
    return {"id": str(comp_id)}


async def update_component(
    org_id: uuid.UUID, component_id: str, data: ComponentUpdate, db: AsyncSession
) -> dict:
    """Met à jour un composant."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"cid": component_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key == "quantity" else value

    result = await db.execute(
        text(f"""
            UPDATE product_components SET {', '.join(set_parts)}
            WHERE id = :cid
              AND EXISTS (
                  SELECT 1 FROM products p WHERE p.id = product_components.parent_product_id AND p.organization_id = :org_id
              )
        """),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Composant introuvable")
    await db.commit()
    return {"status": "updated"}


async def remove_component(
    org_id: uuid.UUID, component_id: str, db: AsyncSession
) -> dict:
    """Supprime un composant d'un article composite."""
    # Récupérer le parent_product_id avant suppression
    parent_row = await db.execute(
        text("SELECT parent_product_id::text FROM product_components WHERE id = :cid"),
        {"cid": component_id},
    )
    parent = parent_row.fetchone()
    if not parent:
        raise HTTPException(404, "Composant introuvable")
    parent_id = parent[0]

    await db.execute(
        text("DELETE FROM product_components WHERE id = :cid"),
        {"cid": component_id},
    )

    # Si plus aucun composant, remettre is_composite = false
    remaining = await db.execute(
        text("SELECT COUNT(*) FROM product_components WHERE parent_product_id = :pid"),
        {"pid": parent_id},
    )
    if (remaining.scalar() or 0) == 0:
        await db.execute(
            text("UPDATE products SET is_composite = false WHERE id = :pid AND organization_id = :org_id"),
            {"pid": parent_id, "org_id": str(org_id)},
        )

    await db.commit()
    return {"status": "deleted"}


# ── Paliers de remise quantité ───────────────────────────────────────────────


async def list_quantity_discounts(
    org_id: uuid.UUID, product_id: str, db: AsyncSession
) -> list[dict]:
    """Liste les paliers de remise quantité d'un article."""
    result = await db.execute(
        text("""
            SELECT qd.id::text, qd.product_id::text, qd.client_id::text,
                   qd.min_quantity, qd.discount_percent, qd.created_at,
                   c.name AS client_name
            FROM product_quantity_discounts qd
            LEFT JOIN clients c ON c.id = qd.client_id
            WHERE qd.product_id = :pid AND qd.organization_id = :org_id
            ORDER BY qd.min_quantity ASC
        """),
        {"pid": product_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_quantity_discount(
    org_id: uuid.UUID, product_id: str, data: QuantityDiscountCreate, db: AsyncSession
) -> dict:
    """Crée un palier de remise quantité."""
    discount_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO product_quantity_discounts (
                id, organization_id, product_id, client_id, min_quantity, discount_percent, created_at
            ) VALUES (:id, :org_id, :pid, :cid, :qty, :pct, now())
        """),
        {
            "id": str(discount_id),
            "org_id": str(org_id),
            "pid": product_id,
            "cid": data.client_id,
            "qty": str(data.min_quantity),
            "pct": str(data.discount_percent),
        },
    )
    await db.commit()
    return {"id": str(discount_id)}


async def update_quantity_discount(
    org_id: uuid.UUID, discount_id: str, data: QuantityDiscountUpdate, db: AsyncSession
) -> dict:
    """Met à jour un palier de remise quantité."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Aucun champ à mettre à jour")

    set_parts = []
    params: dict = {"did": discount_id, "org_id": str(org_id)}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = str(value) if value is not None and key in ("min_quantity", "discount_percent") else value

    result = await db.execute(
        text(f"""
            UPDATE product_quantity_discounts SET {', '.join(set_parts)}
            WHERE id = :did AND organization_id = :org_id
        """),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Palier introuvable")
    await db.commit()
    return {"status": "updated"}


async def delete_quantity_discount(
    org_id: uuid.UUID, discount_id: str, db: AsyncSession
) -> dict:
    """Supprime un palier de remise quantité."""
    result = await db.execute(
        text("""
            DELETE FROM product_quantity_discounts
            WHERE id = :did AND organization_id = :org_id
        """),
        {"did": discount_id, "org_id": str(org_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Palier introuvable")
    await db.commit()
    return {"status": "deleted"}


async def get_applicable_discount(
    org_id: uuid.UUID, product_id: str, client_id: str | None, quantity: float, db: AsyncSession
) -> float:
    """Retourne le % de remise applicable pour une quantité donnée.

    Cherche le palier le plus élevé applicable (min_quantity ≤ quantity).
    Priorité : palier client-spécifique > palier général.
    """
    params: dict = {"pid": product_id, "org_id": str(org_id), "qty": str(quantity)}

    if client_id:
        # Palier client-spécifique en priorité
        result = await db.execute(
            text("""
                SELECT discount_percent FROM product_quantity_discounts
                WHERE product_id = :pid AND organization_id = :org_id
                  AND client_id = :cid AND min_quantity <= :qty
                ORDER BY min_quantity DESC LIMIT 1
            """),
            {**params, "cid": client_id},
        )
        row = result.fetchone()
        if row:
            return float(row[0])

    # Palier général
    result = await db.execute(
        text("""
            SELECT discount_percent FROM product_quantity_discounts
            WHERE product_id = :pid AND organization_id = :org_id
              AND client_id IS NULL AND min_quantity <= :qty
            ORDER BY min_quantity DESC LIMIT 1
        """),
        params,
    )
    row = result.fetchone()
    return float(row[0]) if row else 0.0
