# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Facturation (comptes bancaires, profils, unités)."""

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
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
from app.services import billing as svc

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


# ── Style d'impression ──────────────────────────────────────────────────────


@router.get("/print-style")
async def get_print_style(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_print_style(ctx.org_id, db)


@router.patch("/print-style")
async def update_print_style(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_print_style(ctx.org_id, data, db)


# ── Colonnes du document ────────────────────────────────────────────────────


@router.get("/document-columns")
async def get_document_columns(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_document_columns(ctx.org_id, db)


@router.patch("/document-columns")
async def update_document_columns(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_document_columns(ctx.org_id, data, db)


# ── Pied de page document ──────────────────────────────────────────────────


@router.get("/document-footer")
async def get_document_footer(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_document_footer(ctx.org_id, db)


@router.patch("/document-footer")
async def update_document_footer(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_document_footer(ctx.org_id, data.get("footer", ""), db)


@router.get("/auto-footer")
async def get_auto_footer(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.generate_auto_footer(ctx.org_id, db)


@router.get("/document-header")
async def get_document_header(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_document_header(ctx.org_id, db)


@router.patch("/document-header")
async def update_document_header(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_document_header(ctx.org_id, data, db)


@router.get("/page-footer-options")
async def get_page_footer_options(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_page_footer_options(ctx.org_id, db)


@router.patch("/page-footer-options")
async def update_page_footer_options(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_page_footer_options(ctx.org_id, data, db)


# ── Taux de TVA ────────────────────────────────────────────────────────────


@router.get("/vat-rates")
async def get_vat_rates(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_vat_rates(ctx.org_id, db)


@router.patch("/vat-rates")
async def update_vat_rates(
    data: list[dict],
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_vat_rates(ctx.org_id, data, db)


# ── Arrondis ──────────────────────────────────────────────────────────────────


@router.get("/rounding")
async def get_rounding(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_rounding(ctx.org_id, db)


@router.patch("/rounding")
async def update_rounding(
    data: dict,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_rounding(ctx.org_id, data, db)


# ── Types de documents (devis) ──────────────────────────────────────────────


@router.get("/quote-document-types")
async def get_quote_document_types(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_quote_document_types(ctx.org_id, db)


@router.patch("/quote-document-types")
async def update_quote_document_types(
    data: list[dict],
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_quote_document_types(ctx.org_id, data, db)


# ── Comptes bancaires ────────────────────────────────────────────────────────


@router.get("/bank-accounts")
async def list_bank_accounts(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_bank_accounts(ctx.org_id, db)


@router.post("/bank-accounts", status_code=201)
async def create_bank_account(
    data: BankAccountCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_bank_account(ctx.org_id, data, db)


@router.patch("/bank-accounts/{account_id}")
async def update_bank_account(
    account_id: str,
    data: BankAccountUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_bank_account(ctx.org_id, account_id, data, db)


@router.delete("/bank-accounts/{account_id}")
async def delete_bank_account(
    account_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_bank_account(ctx.org_id, account_id, db)


@router.post("/bank-accounts/{account_id}/rib")
async def upload_rib(
    account_id: str,
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload un RIB (PDF ou image) pour un compte bancaire."""
    file_bytes = await file.read()
    return await svc.upload_rib(
        ctx.org_id, account_id, file_bytes,
        file.filename or "rib", file.content_type or "application/octet-stream", db,
    )


@router.delete("/bank-accounts/{account_id}/rib")
async def delete_rib(
    account_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Supprime le RIB attaché à un compte bancaire."""
    return await svc.delete_rib(ctx.org_id, account_id, db)


# ── Profils de facturation ───────────────────────────────────────────────────


@router.get("/profiles")
async def list_billing_profiles(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_billing_profiles(ctx.org_id, db)


@router.post("/profiles", status_code=201)
async def create_billing_profile(
    data: BillingProfileCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_billing_profile(ctx.org_id, data, db)


@router.patch("/profiles/{profile_id}")
async def update_billing_profile(
    profile_id: str,
    data: BillingProfileUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_billing_profile(ctx.org_id, profile_id, data, db)


@router.delete("/profiles/{profile_id}")
async def delete_billing_profile(
    profile_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_billing_profile(ctx.org_id, profile_id, db)


# ── Modes de règlement ───────────────────────────────────────────────────────


@router.get("/payment-methods")
async def list_payment_methods(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_payment_methods(ctx.org_id, db)


@router.post("/payment-methods", status_code=201)
async def create_payment_method(
    data: PaymentMethodCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_payment_method(ctx.org_id, data, db)


@router.patch("/payment-methods/{method_id}")
async def update_payment_method(
    method_id: str,
    data: PaymentMethodUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_payment_method(ctx.org_id, method_id, data, db)


@router.delete("/payment-methods/{method_id}")
async def delete_payment_method(
    method_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_payment_method(ctx.org_id, method_id, db)


# ── Unités personnalisées ────────────────────────────────────────────────────


@router.get("/units")
async def list_units(
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_units(ctx.org_id, db)


@router.post("/units", status_code=201)
async def create_unit(
    data: UnitCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_unit(ctx.org_id, data, db)


@router.patch("/units/{unit_id}")
async def update_unit(
    unit_id: str,
    data: UnitUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_unit(ctx.org_id, unit_id, data, db)


@router.delete("/units/{unit_id}")
async def delete_unit(
    unit_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_unit(ctx.org_id, unit_id, db)
