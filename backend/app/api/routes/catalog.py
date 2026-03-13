# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Catalogue (produits, variantes, coefficients, achats, composition, paliers)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
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
from app.services import catalog as svc

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])


# ── Produits ──────────────────────────────────────────────────────────────────


@router.get("/products")
async def list_products(
    search: str | None = None,
    client_id: str | None = None,
    include_archived: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_products(
        ctx.org_id, db, search=search, client_id=client_id,
        include_archived=include_archived, page=page, page_size=page_size,
    )


@router.post("/products", status_code=201)
async def create_product(
    data: ProductCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_product(ctx.org_id, data, db)


@router.get("/products/{product_id}")
async def get_product(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_product(ctx.org_id, product_id, db)


@router.patch("/products/{product_id}")
async def update_product(
    product_id: str,
    data: ProductUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_product(ctx.org_id, product_id, data, db)


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_product(ctx.org_id, product_id, db)


@router.patch("/products/{product_id}/unarchive")
async def unarchive_product(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.unarchive_product(ctx.org_id, product_id, db)


# ── Variantes client ─────────────────────────────────────────────────────────


@router.get("/products/{product_id}/variants")
async def list_variants(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_variants(ctx.org_id, product_id, db)


@router.post("/products/{product_id}/variants", status_code=201)
async def create_variant(
    product_id: str,
    data: VariantCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_variant(ctx.org_id, product_id, data, db)


@router.patch("/products/{product_id}/variants/{variant_id}")
async def update_variant(
    product_id: str,
    variant_id: str,
    data: VariantUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_variant(ctx.org_id, variant_id, data, db)


@router.delete("/products/{product_id}/variants/{variant_id}")
async def delete_variant(
    product_id: str,
    variant_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_variant(ctx.org_id, variant_id, db)


# ── Coefficients de prix ─────────────────────────────────────────────────────


@router.get("/coefficients")
async def list_coefficients(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_coefficients(ctx.org_id, db)


@router.post("/coefficients", status_code=201)
async def create_coefficient(
    data: CoefficientCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_coefficient(ctx.org_id, data, db)


@router.patch("/coefficients/{coefficient_id}")
async def update_coefficient(
    coefficient_id: str,
    data: CoefficientUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_coefficient(ctx.org_id, coefficient_id, data, db)


@router.delete("/coefficients/{coefficient_id}")
async def delete_coefficient(
    coefficient_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_coefficient(ctx.org_id, coefficient_id, db)


# ── Liens achats fournisseur ─────────────────────────────────────────────────


@router.get("/products/{product_id}/purchase-links")
async def list_purchase_links(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_purchase_links(ctx.org_id, product_id, db)


@router.post("/products/{product_id}/purchase-links", status_code=201)
async def create_purchase_link(
    product_id: str,
    data: PurchaseLinkCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_purchase_link(ctx.org_id, product_id, data, db)


@router.patch("/products/{product_id}/purchase-links/{link_id}")
async def update_purchase_link(
    product_id: str,
    link_id: str,
    data: PurchaseLinkUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_purchase_link(ctx.org_id, link_id, data, db)


@router.delete("/products/{product_id}/purchase-links/{link_id}")
async def delete_purchase_link(
    product_id: str,
    link_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_purchase_link(ctx.org_id, link_id, db)


# ── Composition d'articles ───────────────────────────────────────────────────


@router.get("/products/{product_id}/components")
async def list_components(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_components(ctx.org_id, product_id, db)


@router.post("/products/{product_id}/components", status_code=201)
async def add_component(
    product_id: str,
    data: ComponentCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.add_component(ctx.org_id, product_id, data, db)


@router.patch("/products/{product_id}/components/{component_id}")
async def update_component(
    product_id: str,
    component_id: str,
    data: ComponentUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_component(ctx.org_id, component_id, data, db)


@router.delete("/products/{product_id}/components/{component_id}")
async def remove_component(
    product_id: str,
    component_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.remove_component(ctx.org_id, component_id, db)


# ── Paliers de remise quantité ───────────────────────────────────────────────


@router.get("/products/{product_id}/quantity-discounts")
async def list_quantity_discounts(
    product_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_quantity_discounts(ctx.org_id, product_id, db)


@router.post("/products/{product_id}/quantity-discounts", status_code=201)
async def create_quantity_discount(
    product_id: str,
    data: QuantityDiscountCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_quantity_discount(ctx.org_id, product_id, data, db)


@router.patch("/products/{product_id}/quantity-discounts/{discount_id}")
async def update_quantity_discount(
    product_id: str,
    discount_id: str,
    data: QuantityDiscountUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_quantity_discount(ctx.org_id, discount_id, data, db)


@router.delete("/products/{product_id}/quantity-discounts/{discount_id}")
async def delete_quantity_discount(
    product_id: str,
    discount_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_quantity_discount(ctx.org_id, discount_id, db)
