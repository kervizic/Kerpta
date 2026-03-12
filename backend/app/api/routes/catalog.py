# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Catalogue (produits, variantes, coefficients)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.catalog import (
    CoefficientCreate,
    ProductCreate,
    ProductUpdate,
    VariantCreate,
)
from app.services import catalog as svc

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])


# ── Produits ──────────────────────────────────────────────────────────────────


@router.get("/products")
async def list_products(
    search: str | None = None,
    client_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_products(
        ctx.org_id, db, search=search, client_id=client_id, page=page, page_size=page_size
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
