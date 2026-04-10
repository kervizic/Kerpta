# Kerpta — Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API - Documents d'execution."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.execution import (
    BatchArchiveRequest,
    ExecutionCreate,
    ExecutionDetailOut,
    ExecutionFromContract,
    ExecutionFromExecution,
    ExecutionFromQuote,
    ExecutionInvoiceRequest,
    ExecutionLinkCreate,
    ExecutionUpdate,
    PaginatedExecutions,
)
from app.services import executions as exec_svc

router = APIRouter(prefix="/api/v1/executions", tags=["executions"])


@router.get("", response_model=PaginatedExecutions)
async def list_executions(
    exec_type: str | None = None,
    status: str | None = None,
    client_id: str | None = None,
    contract_id: str | None = None,
    search: str | None = None,
    archived: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.list_executions(
        ctx.org_id, db,
        exec_type=exec_type, status=status,
        client_id=client_id, contract_id=contract_id,
        search=search, archived=archived,
        page=page, page_size=page_size,
    )


@router.post("", status_code=201)
async def create_execution(
    data: ExecutionCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.create_execution(ctx.org_id, ctx.user_id, data, db)


@router.get("/{exec_id}", response_model=ExecutionDetailOut)
async def get_execution(
    exec_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.get_execution(ctx.org_id, exec_id, db)


@router.patch("/{exec_id}")
async def update_execution(
    exec_id: str,
    data: ExecutionUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.update_execution(ctx.org_id, exec_id, data, db)


@router.delete("/{exec_id}")
async def delete_execution(
    exec_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.delete_execution(ctx.org_id, exec_id, db)


@router.post("/{exec_id}/validate")
async def validate_execution(
    exec_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.validate_execution(ctx.org_id, exec_id, ctx.user_id, db)


@router.post("/{exec_id}/invoice")
async def invoice_execution(
    exec_id: str,
    data: ExecutionInvoiceRequest = ExecutionInvoiceRequest(),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.invoice_execution(ctx.org_id, exec_id, data, db)


@router.post("/{exec_id}/duplicate", status_code=201)
async def duplicate_execution(
    exec_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.duplicate_execution(ctx.org_id, exec_id, ctx.user_id, db)


@router.post("/batch/archive")
async def archive_executions(
    data: BatchArchiveRequest,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.archive_executions(ctx.org_id, data.ids, data.archive, db)


# ── Liens ───────────────────────────────────────────────────────────────────


@router.get("/{exec_id}/links")
async def get_linked_documents(
    exec_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.get_linked_documents(ctx.org_id, exec_id, db)


@router.post("/{exec_id}/links", status_code=201)
async def create_link(
    exec_id: str,
    data: ExecutionLinkCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.create_link(ctx.org_id, exec_id, data.execution_b_id, data.link_type, db)


@router.get("/{exec_id}/chain")
async def get_chain(
    exec_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.get_chain(ctx.org_id, exec_id, db)


# ── Pre-remplissage ─────────────────────────────────────────────────────────


@router.post("/from-quote/{quote_id}", status_code=201)
async def create_from_quote(
    quote_id: str,
    data: ExecutionFromQuote,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.create_from_quote(ctx.org_id, ctx.user_id, quote_id, data, db)


@router.post("/from-execution/{source_exec_id}", status_code=201)
async def create_from_execution(
    source_exec_id: str,
    data: ExecutionFromExecution,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.create_from_execution(ctx.org_id, ctx.user_id, source_exec_id, data, db)


@router.post("/from-contract/{contract_id}", status_code=201)
async def create_from_contract(
    contract_id: str,
    data: ExecutionFromContract,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await exec_svc.create_from_contract(ctx.org_id, ctx.user_id, contract_id, data, db)
