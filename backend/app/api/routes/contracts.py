# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API - Contrats."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.contracts import (
    BudgetOut,
    ContractCreate,
    ContractDetailOut,
    ContractUpdate,
    PaginatedContracts,
)
from app.services import contracts as contract_svc
from app.services import executions as exec_svc

router = APIRouter(prefix="/api/v1/contracts", tags=["contracts"])


@router.get("", response_model=PaginatedContracts)
async def list_contracts(
    contract_type: str | None = None,
    status: str | None = None,
    client_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.list_contracts(
        ctx.org_id, db,
        contract_type=contract_type, status=status,
        client_id=client_id, page=page, page_size=page_size,
    )


@router.post("", status_code=201)
async def create_contract(
    data: ContractCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.create_contract(ctx.org_id, ctx.user_id, data, db)


@router.get("/{contract_id}", response_model=ContractDetailOut)
async def get_contract(
    contract_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.get_contract(ctx.org_id, contract_id, db)


@router.patch("/{contract_id}")
async def update_contract(
    contract_id: str,
    data: ContractUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.update_contract(ctx.org_id, contract_id, data, db)


@router.delete("/{contract_id}")
async def delete_contract(
    contract_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.delete_contract(ctx.org_id, contract_id, db)


@router.get("/{contract_id}/quotes")
async def get_contract_quotes(
    contract_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.get_contract_quotes(ctx.org_id, contract_id, db)


@router.get("/{contract_id}/budget", response_model=BudgetOut)
async def get_contract_budget(
    contract_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contract_svc.get_contract_budget(ctx.org_id, contract_id, db)


@router.get("/{contract_id}/executions")
async def list_contract_executions(
    contract_id: str,
    exec_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    """Liste les documents d'execution lies a ce contrat."""
    return await exec_svc.list_executions(
        ctx.org_id, db,
        contract_id=contract_id,
        exec_type=exec_type,
        page=page, page_size=page_size,
    )
