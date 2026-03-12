# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes API — Clients."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import OrgContext, get_org_context
from app.schemas.clients import (
    ClientCreate,
    ClientDetailOut,
    ClientUpdate,
    PaginatedClients,
)
from app.schemas.contacts import ContactCreate
from app.services import clients as svc
from app.services import contacts as contacts_svc

router = APIRouter(prefix="/api/v1/clients", tags=["clients"])


@router.get("", response_model=PaginatedClients)
async def list_clients(
    search: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_clients(
        ctx.org_id, db, search=search, status=status, page=page, page_size=page_size
    )


@router.post("", status_code=201)
async def create_client(
    data: ClientCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_client(ctx.org_id, data, db)


@router.get("/{client_id}", response_model=ClientDetailOut)
async def get_client(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_client(ctx.org_id, client_id, db)


@router.patch("/{client_id}")
async def update_client(
    client_id: str,
    data: ClientUpdate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_client(ctx.org_id, client_id, data, db)


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.delete_client(ctx.org_id, client_id, db)


@router.get("/{client_id}/quotes")
async def get_client_quotes(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_client_quotes(ctx.org_id, client_id, db)


@router.get("/{client_id}/invoices")
async def get_client_invoices(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_client_invoices(ctx.org_id, client_id, db)


@router.get("/{client_id}/contracts")
async def get_client_contracts(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_client_contracts(ctx.org_id, client_id, db)


# ── Contacts ─────────────────────────────────────────────────────────────────


@router.get("/{client_id}/contacts")
async def list_contacts(
    client_id: str,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contacts_svc.list_contacts(ctx.org_id, client_id, db)


@router.post("/{client_id}/contacts", status_code=201)
async def create_contact(
    client_id: str,
    data: ContactCreate,
    ctx: OrgContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
):
    return await contacts_svc.create_contact(ctx.org_id, client_id, data, db)
