"""Schéma initial Kerpta — toutes les tables (consolidé, migrations 0001-0021)

Revision ID: 0001
Revises:
Create Date: 2026-03-10 00:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("is_platform_admin", sa.Boolean, default=False, nullable=False),
        sa.Column(
            "provider_sub",
            sa.String(255),
            unique=True,
            nullable=True,
            comment="Identifiant stable côté provider OAuth. Format : google:{sub} | azure:{oid} | apple:{sub}",
        ),
        sa.Column(
            "platform_admin_granted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "platform_admin_granted_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── organizations ────────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("siret", sa.CHAR(14), unique=True, nullable=True),
        sa.Column("siren", sa.CHAR(9), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("legal_form", sa.String(20), nullable=True),
        sa.Column("address", postgresql.JSONB, nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("logo_url", sa.Text, nullable=True),
        sa.Column("fiscal_year_start", sa.Date, nullable=True),
        sa.Column("vat_regime", sa.String(20), nullable=True),
        sa.Column("accounting_regime", sa.String(20), nullable=True),
        sa.Column("rcs_city", sa.String(100), nullable=True),
        sa.Column("capital", sa.Numeric(15, 2), nullable=True),
        sa.Column("capital_variable", sa.Boolean, nullable=True),
        sa.Column("ape_code", sa.String(10), nullable=True),
        sa.Column("objet_social", sa.Text, nullable=True),
        sa.Column("date_cloture_exercice", sa.String(4), nullable=True),
        sa.Column("date_immatriculation_rcs", sa.String(10), nullable=True),
        sa.Column(
            "expense_validation_threshold",
            sa.Numeric(10, 2),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "expense_validator_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "quote_document_types",
            postgresql.JSONB,
            server_default='["Devis","Attachement","BPU"]',
            nullable=False,
        ),
        sa.Column("module_quotes_enabled", sa.Boolean, server_default="true", nullable=False),
        sa.Column("module_invoices_enabled", sa.Boolean, server_default="true", nullable=False),
        sa.Column(
            "module_purchase_orders_enabled",
            sa.Boolean,
            server_default="true",
            nullable=False,
        ),
        sa.Column("module_purchases_enabled", sa.Boolean, server_default="true", nullable=False),
        sa.Column("module_expenses_enabled", sa.Boolean, server_default="true", nullable=False),
        sa.Column("module_payroll_enabled", sa.Boolean, server_default="true", nullable=False),
        sa.Column("module_accounting_enabled", sa.Boolean, server_default="true", nullable=False),
        sa.Column(
            "module_esignature_enabled", sa.Boolean, server_default="true", nullable=False
        ),
        # From 0006: billing_siret
        sa.Column("billing_siret", sa.CHAR(14), nullable=True),
        # From 0010: module_contracts_enabled
        sa.Column("module_contracts_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        # From 0011: module_config
        sa.Column("module_config", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        # From 0019: vat_exigibility
        sa.Column("vat_exigibility", sa.String(20), nullable=False, server_default=sa.text("'encaissements'")),
        # From 0020: website
        sa.Column("website", sa.String(255), nullable=True),
        # From 0021: manual_fields (replaces company_info_manual from 0020)
        sa.Column("manual_fields", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── organization_memberships ─────────────────────────────────────────────
    op.create_table(
        "organization_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("custom_permissions", postgresql.JSONB, nullable=True),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "organization_id"),
        sa.CheckConstraint(
            "role IN ('owner', 'accountant', 'commercial', 'employee', 'custom')"
        ),
    )

    # ── invitations ──────────────────────────────────────────────────────────
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("token_hash", sa.CHAR(64), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("custom_permissions", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "accepted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── clients ──────────────────────────────────────────────────────────────
    # Includes company_siren (from 0008, FK dropped in 0013) and country_code (from 0009)
    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("siret", sa.CHAR(14), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("billing_address", postgresql.JSONB, nullable=True),
        sa.Column("shipping_address", postgresql.JSONB, nullable=True),
        sa.Column("payment_terms", sa.Integer, server_default="30", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        # From 0008: company_siren (NO FK — dropped in 0013)
        sa.Column("company_siren", sa.CHAR(9), nullable=True),
        # From 0009: country_code
        sa.Column("country_code", sa.CHAR(2), nullable=False, server_default="FR"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── suppliers ────────────────────────────────────────────────────────────
    # Includes company_siren (from 0008, FK dropped in 0013) and country_code (from 0009)
    op.create_table(
        "suppliers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("siret", sa.CHAR(14), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address", postgresql.JSONB, nullable=True),
        sa.Column("default_category", sa.String(100), nullable=True),
        # From 0008: company_siren (NO FK — dropped in 0013)
        sa.Column("company_siren", sa.CHAR(9), nullable=True),
        # From 0009: country_code
        sa.Column("country_code", sa.CHAR(2), nullable=False, server_default="FR"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── price_coefficients ───────────────────────────────────────────────────
    op.create_table(
        "price_coefficients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("value", sa.Numeric(8, 4), nullable=False),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── products ─────────────────────────────────────────────────────────────
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("account_code", sa.String(10), nullable=True),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=True,
        ),
        sa.Column("is_in_catalog", sa.Boolean, server_default="true", nullable=False),
        sa.Column("purchase_price", sa.Numeric(15, 4), nullable=True),
        sa.Column("sale_price_mode", sa.String(20), server_default="fixed", nullable=False),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=True),
        sa.Column(
            "sale_price_coefficient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("price_coefficients.id"),
            nullable=True,
        ),
        sa.Column("is_composite", sa.Boolean, server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── client_product_variants ──────────────────────────────────────────────
    op.create_table(
        "client_product_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column("variant_index", sa.Integer, server_default="1", nullable=False),
        sa.Column("override_reference", sa.String(100), nullable=True),
        sa.Column("override_name", sa.String(255), nullable=True),
        sa.Column("price_mode", sa.String(20), server_default="inherit", nullable=False),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=True),
        sa.Column(
            "price_coefficient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("price_coefficients.id"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("product_id", "client_id", "variant_index"),
    )

    # ── product_purchase_links ───────────────────────────────────────────────
    op.create_table(
        "product_purchase_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column(
            "supplier_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("suppliers.id"),
            nullable=True,
        ),
        sa.Column("supplier_reference", sa.String(100), nullable=True),
        sa.Column("purchase_price", sa.Numeric(15, 4), nullable=False),
        sa.Column(
            "sale_price_mode", sa.String(20), server_default="coefficient", nullable=False
        ),
        sa.Column("fixed_sale_price", sa.Numeric(15, 4), nullable=True),
        sa.Column(
            "price_coefficient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("price_coefficients.id"),
            nullable=True,
        ),
        sa.Column("is_default", sa.Boolean, server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── product_components ───────────────────────────────────────────────────
    op.create_table(
        "product_components",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "parent_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column(
            "component_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
    )

    # ── journal_entries (avant invoices pour la FK) ──────────────────────────
    op.create_table(
        "journal_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("journal_type", sa.String(20), nullable=False),
        sa.Column("entry_date", sa.Date, nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("source_type", sa.String(20), nullable=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── quotes (avant invoices — invoices.quote_id référence quotes) ─────────
    # Includes contract_id, is_avenant, avenant_number, bpu_source_id (from 0010)
    # document_type is VARCHAR(20) with default 'devis' (from 0010)
    # billing_profile_id (from 0016)
    op.create_table(
        "quotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("document_type", sa.String(20), server_default="devis", nullable=False),
        sa.Column("show_quantity", sa.Boolean, server_default="true", nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column("currency", sa.CHAR(3), server_default="EUR", nullable=False),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("discount_type", sa.String(10), server_default="none", nullable=False),
        sa.Column("discount_value", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("footer", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signature_status", sa.String(20), server_default="none", nullable=False),
        sa.Column("signature_request_id", sa.String(255), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_pdf_url", sa.Text, nullable=True),
        # From 0010: contract fields
        sa.Column("contract_id", UUID(as_uuid=True), nullable=True),
        sa.Column("is_avenant", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("avenant_number", sa.Integer, nullable=True),
        sa.Column("bpu_source_id", UUID(as_uuid=True), nullable=True),
        # From 0016: billing_profile_id (FK added after billing_profiles table)
        sa.Column("billing_profile_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── invoices ─────────────────────────────────────────────────────────────
    # Includes contract_id, situation_id, is_situation, situation_number (from 0010)
    # billing_profile_id (from 0016)
    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column(
            "quote_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("quotes.id"),
            nullable=True,
        ),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("is_credit_note", sa.Boolean, server_default="false", nullable=False),
        sa.Column(
            "credit_note_for",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("currency", sa.CHAR(3), server_default="EUR", nullable=False),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("amount_paid", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("discount_type", sa.String(10), server_default="none", nullable=False),
        sa.Column("discount_value", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("payment_terms", sa.Integer, server_default="30", nullable=False),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("bank_details", postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("footer", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column("pdp_reference", sa.String(255), nullable=True),
        sa.Column("pdp_status", sa.String(50), nullable=True),
        sa.Column("pdp_submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        # From 0010: contract/situation fields
        sa.Column("contract_id", UUID(as_uuid=True), nullable=True),
        sa.Column("situation_id", UUID(as_uuid=True), nullable=True),
        sa.Column("is_situation", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("situation_number", sa.Integer, nullable=True),
        # From 0016: billing_profile_id (FK added after billing_profiles table)
        sa.Column("billing_profile_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── quote_lines ──────────────────────────────────────────────────────────
    # Includes reference (from 0010)
    op.create_table(
        "quote_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "quote_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("quotes.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=True,
        ),
        sa.Column(
            "client_product_variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("client_product_variants.id"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), nullable=False),
        # From 0010: reference
        sa.Column("reference", sa.String(100), nullable=True),
    )

    # ── invoice_lines ────────────────────────────────────────────────────────
    op.create_table(
        "invoice_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_code", sa.String(10), nullable=True),
    )

    # ── client_purchase_orders ───────────────────────────────────────────────
    # Includes contract_id (from 0010)
    op.create_table(
        "client_purchase_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column(
            "quote_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("quotes.id"),
            nullable=True,
        ),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("client_reference", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default="received", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("delivery_date", sa.Date, nullable=True),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        # From 0010: contract_id
        sa.Column("contract_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Ajout FK purchase_order_id sur invoices après création de client_purchase_orders
    op.add_column(
        "invoices",
        sa.Column(
            "purchase_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("client_purchase_orders.id"),
            nullable=True,
        ),
    )

    # ── client_purchase_order_lines ──────────────────────────────────────────
    op.create_table(
        "client_purchase_order_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "purchase_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("client_purchase_orders.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), nullable=False),
    )

    # ── supplier_orders (avant supplier_quotes pour la FK) ───────────────────
    op.create_table(
        "supplier_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "supplier_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("suppliers.id"),
            nullable=False,
        ),
        sa.Column("supplier_quote_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("expected_delivery_date", sa.Date, nullable=True),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── supplier_quotes ──────────────────────────────────────────────────────
    op.create_table(
        "supplier_quotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "supplier_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("suppliers.id"),
            nullable=False,
        ),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("supplier_reference", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default="received", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column(
            "supplier_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("supplier_orders.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Ajout FK supplier_quote_id sur supplier_orders après création de supplier_quotes
    op.create_foreign_key(
        "fk_supplier_orders_supplier_quote_id",
        "supplier_orders",
        "supplier_quotes",
        ["supplier_quote_id"],
        ["id"],
    )

    # ── supplier_quote_lines ─────────────────────────────────────────────────
    op.create_table(
        "supplier_quote_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "supplier_quote_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("supplier_quotes.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
    )

    # ── supplier_order_lines ─────────────────────────────────────────────────
    op.create_table(
        "supplier_order_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "supplier_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("supplier_orders.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_code", sa.String(10), nullable=True),
    )

    # ── supplier_invoices ────────────────────────────────────────────────────
    op.create_table(
        "supplier_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "supplier_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("suppliers.id"),
            nullable=False,
        ),
        sa.Column(
            "supplier_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("supplier_orders.id"),
            nullable=True,
        ),
        sa.Column("number", sa.String(50), unique=True, nullable=False),
        sa.Column("supplier_reference", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default="received", nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("subtotal_ht", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total_ttc", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("amount_paid", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column(
            "journal_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("journal_entries.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── supplier_invoice_lines ───────────────────────────────────────────────
    op.create_table(
        "supplier_invoice_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "supplier_invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("supplier_invoices.id"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("total_vat", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_code", sa.String(10), nullable=True),
    )

    # ── payments ─────────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column("method", sa.String(30), nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── expenses ─────────────────────────────────────────────────────────────
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "supplier_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("suppliers.id"),
            nullable=True,
        ),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("amount_ht", sa.Numeric(15, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("amount_ttc", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.CHAR(3), server_default="EUR", nullable=False),
        sa.Column("expense_date", sa.Date, nullable=False),
        sa.Column("receipt_url", sa.Text, nullable=True),
        sa.Column("account_code", sa.String(10), nullable=True),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("reimbursed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "journal_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("journal_entries.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── employees ────────────────────────────────────────────────────────────
    op.create_table(
        "employees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("nir", sa.CHAR(15), nullable=True),
        sa.Column("job_title", sa.String(255), nullable=True),
        sa.Column("contract_type", sa.String(20), nullable=True),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("gross_salary", sa.Numeric(15, 2), nullable=True),
        sa.Column("convention_collective", sa.String(100), nullable=True),
        sa.Column("address", postgresql.JSONB, nullable=True),
        sa.Column("iban", sa.String(34), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── payslips ─────────────────────────────────────────────────────────────
    op.create_table(
        "payslips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("employees.id"),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("gross_salary", sa.Numeric(15, 2), nullable=False),
        sa.Column("net_salary", sa.Numeric(15, 2), nullable=False),
        sa.Column("employer_cost", sa.Numeric(15, 2), nullable=False),
        sa.Column("cotisations", postgresql.JSONB, nullable=True),
        sa.Column("hours_worked", sa.Numeric(6, 2), nullable=True),
        sa.Column("hours_extra", sa.Numeric(6, 2), nullable=True),
        sa.Column("absences", postgresql.JSONB, nullable=True),
        sa.Column("pdf_url", sa.Text, nullable=True),
        sa.Column("dsn_exported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── journal_entry_lines ──────────────────────────────────────────────────
    op.create_table(
        "journal_entry_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "journal_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("journal_entries.id"),
            nullable=False,
        ),
        sa.Column("account_code", sa.String(10), nullable=False),
        sa.Column("account_label", sa.String(255), nullable=True),
        sa.Column("debit", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("credit", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("third_party", sa.String(255), nullable=True),
    )

    # ── tax_declarations ─────────────────────────────────────────────────────
    op.create_table(
        "tax_declarations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("data", postgresql.JSONB, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── organization_storage_configs ─────────────────────────────────────────
    op.create_table(
        "organization_storage_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("credentials", postgresql.JSONB, nullable=False),
        sa.Column("base_path", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="false", nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── platform_config ──────────────────────────────────────────────────────
    # Includes base_url, auth_url, oauth_config (from 0002) and api_keys (from 0004)
    op.create_table(
        "platform_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "setup_completed", sa.Boolean, server_default="false", nullable=False
        ),
        sa.Column("setup_step", sa.Integer, server_default="1", nullable=False),
        sa.Column("instance_name", sa.String(255), nullable=True),
        # From 0002: OAuth fields
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("auth_url", sa.String(500), nullable=True),
        sa.Column(
            "oauth_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment=(
                "Config OAuth par provider. Structure : "
                '{provider: {enabled, client_id, client_secret, ...}}'
            ),
        ),
        # From 0004: api_keys
        sa.Column("api_keys", JSONB, nullable=True, comment="Clés API externes (INSEE, etc.)"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── platform_admin_log ───────────────────────────────────────────────────
    op.create_table(
        "platform_admin_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "admin_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column(
            "target_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "target_org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── platform_content (from 0003) ─────────────────────────────────────────
    op.create_table(
        "platform_content",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("section", sa.String(50), nullable=False),
        sa.Column(
            "content",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("visible", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("section", name="uq_platform_content_section"),
    )
    op.create_index("ix_platform_content_sort_order", "platform_content", ["sort_order"])

    # ── organization_join_requests (from 0005) ───────────────────────────────
    op.create_table(
        "organization_join_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("role_assigned", sa.String(20), nullable=True),
        sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "organization_id", name="uq_join_request_user_org"),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')",
            name="ck_join_request_status",
        ),
    )
    op.create_index(
        "ix_join_requests_org_status",
        "organization_join_requests",
        ["organization_id", "status"],
    )
    op.create_index(
        "ix_join_requests_user",
        "organization_join_requests",
        ["user_id"],
    )

    # ── organization_logos (from 0007, includes logo_thumb_b64 from 0008) ────
    op.create_table(
        "organization_logos",
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("logo_b64", sa.Text, nullable=False),
        sa.Column("original_name", sa.String(255), nullable=True),
        sa.Column("mime_type", sa.String(50), nullable=True),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column("width_px", sa.SmallInteger, nullable=True),
        sa.Column("height_px", sa.SmallInteger, nullable=True),
        # From 0008: logo_thumb_b64
        sa.Column("logo_thumb_b64", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── companies (from 0008, includes raw_data from 0014) ───────────────────
    op.create_table(
        "companies",
        sa.Column("siren", sa.CHAR(9), primary_key=True, nullable=False),
        sa.Column("denomination", sa.String(500), nullable=True),
        sa.Column("sigle", sa.String(100), nullable=True),
        sa.Column("legal_form_code", sa.String(10), nullable=True),
        sa.Column("legal_form", sa.String(50), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("ape_code", sa.String(10), nullable=True),
        sa.Column("rcs_city", sa.String(100), nullable=True),
        sa.Column("capital", sa.Numeric(15, 2), nullable=True),
        sa.Column("creation_date", sa.Date, nullable=True),
        sa.Column("closure_date", sa.Date, nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        # From 0014: raw_data
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_companies_status", "companies", ["status"])

    # ── establishments (from 0008, includes raw_data from 0014) ──────────────
    op.create_table(
        "establishments",
        sa.Column("siret", sa.CHAR(14), primary_key=True, nullable=False),
        sa.Column(
            "siren",
            sa.CHAR(9),
            sa.ForeignKey("companies.siren", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nic", sa.CHAR(5), nullable=True),
        sa.Column("is_siege", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("address", JSONB, nullable=True),
        sa.Column("activite_principale", sa.String(10), nullable=True),
        sa.Column("closure_date", sa.Date, nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        # From 0014: raw_data
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_establishments_siren", "establishments", ["siren"])
    op.create_index("idx_establishments_status", "establishments", ["status"])

    # ── contracts (from 0010) ────────────────────────────────────────────────
    op.create_table(
        "contracts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supplier_id", UUID(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("reference", sa.String(50), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("auto_renew", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("renewal_notice_days", sa.Integer, nullable=False, server_default="30"),
        sa.Column("bpu_quote_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_budget", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total_invoiced", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("signed_pdf_url", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── situations (from 0010) ───────────────────────────────────────────────
    op.create_table(
        "situations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bpu_quote_id", UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("situation_number", sa.Integer, nullable=False),
        sa.Column("period_label", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("cumulative_total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("previously_invoiced", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("invoice_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("contract_id", "situation_number"),
    )

    # ── situation_lines (from 0010) ──────────────────────────────────────────
    op.create_table(
        "situation_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("situation_id", UUID(as_uuid=True), sa.ForeignKey("situations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quote_line_id", UUID(as_uuid=True), sa.ForeignKey("quote_lines.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("total_contract", sa.Numeric(15, 2), nullable=False),
        sa.Column("previous_completion_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("completion_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("cumulative_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("previously_invoiced", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("line_invoice_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.CheckConstraint("completion_percent BETWEEN 0 AND 100", name="check_completion"),
        sa.CheckConstraint("completion_percent >= previous_completion_percent", name="check_cumulative"),
    )

    # ── contacts (from 0012) ─────────────────────────────────────────────────
    op.create_table(
        "contacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("job_title", sa.String(100), nullable=True),
        sa.Column("is_primary", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_contacts_client_id", "contacts", ["client_id"])
    op.create_index("ix_contacts_organization_id", "contacts", ["organization_id"])

    # ── product_quantity_discounts (from 0015) ───────────────────────────────
    op.create_table(
        "product_quantity_discounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=True),
        sa.Column("min_quantity", sa.Numeric(15, 4), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_pqd_product", "product_quantity_discounts", ["product_id"])
    op.create_index("ix_pqd_org", "product_quantity_discounts", ["organization_id"])

    # ── bank_accounts (from 0016) ────────────────────────────────────────────
    op.create_table(
        "bank_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("bank_name", sa.String(100), nullable=True),
        sa.Column("iban", sa.String(34), nullable=False),
        sa.Column("bic", sa.String(11), nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ba_org", "bank_accounts", ["organization_id"])

    # ── billing_profiles (from 0016, includes cols from 0017, 0018; NOT vat_regime removed in 0019) ──
    op.create_table(
        "billing_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id"), nullable=True),
        sa.Column("payment_terms", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("late_penalty_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("discount_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("legal_mentions", sa.Text, nullable=True),
        sa.Column("footer", sa.Text, nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        # From 0017: payment_term_type, payment_term_day
        sa.Column("payment_term_type", sa.String(20), nullable=False, server_default=sa.text("'net'")),
        sa.Column("payment_term_day", sa.Integer, nullable=True),
        # From 0018: recovery_fee, early_payment_discount, payment_note, legal_mentions_auto
        sa.Column("recovery_fee", sa.Numeric(6, 2), nullable=False, server_default=sa.text("40.00")),
        sa.Column("early_payment_discount", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("payment_note", sa.Text, nullable=True),
        sa.Column("legal_mentions_auto", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_bp_org", "billing_profiles", ["organization_id"])

    # ── custom_units (from 0016) ─────────────────────────────────────────────
    op.create_table(
        "custom_units",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.UniqueConstraint("organization_id", "label"),
    )

    # ── Deferred FK for quotes/invoices → contracts, situations, billing_profiles ──
    op.create_foreign_key("fk_quotes_contract_id", "quotes", "contracts", ["contract_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_quotes_bpu_source_id", "quotes", "quotes", ["bpu_source_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_quotes_billing_profile_id", "quotes", "billing_profiles", ["billing_profile_id"], ["id"])
    op.create_foreign_key("fk_invoices_contract_id", "invoices", "contracts", ["contract_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_invoices_situation_id", "invoices", "situations", ["situation_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_invoices_billing_profile_id", "invoices", "billing_profiles", ["billing_profile_id"], ["id"])
    op.create_foreign_key("fk_cpo_contract_id", "client_purchase_orders", "contracts", ["contract_id"], ["id"], ondelete="SET NULL")

    # ── Index ────────────────────────────────────────────────────────────────
    op.create_index("idx_invoices_org_status", "invoices", ["organization_id", "status"])
    op.create_index(
        "idx_invoices_org_date",
        "invoices",
        ["organization_id", sa.text("issue_date DESC")],
    )
    op.create_index("idx_quotes_org_status", "quotes", ["organization_id", "status"])
    op.create_index("idx_expenses_org_status", "expenses", ["organization_id", "status"])
    op.create_index(
        "idx_journal_org_date",
        "journal_entries",
        ["organization_id", sa.text("entry_date DESC")],
    )
    op.create_index("idx_clients_org", "clients", ["organization_id"])
    op.create_index(
        "idx_clients_siret",
        "clients",
        ["siret"],
        postgresql_where=sa.text("siret IS NOT NULL"),
    )
    op.create_index("idx_memberships_user", "organization_memberships", ["user_id"])
    op.create_index(
        "idx_memberships_org", "organization_memberships", ["organization_id"]
    )
    op.create_index(
        "idx_invoice_number",
        "invoices",
        ["organization_id", "number"],
        unique=True,
    )
    op.create_index(
        "idx_quote_number", "quotes", ["organization_id", "number"], unique=True
    )
    op.create_index("idx_users_provider_sub", "users", ["provider_sub"], unique=True)

    # Index from 0008
    op.create_index("idx_clients_company_siren", "clients", ["company_siren"])
    op.create_index("idx_suppliers_company_siren", "suppliers", ["company_siren"])

    # Index from 0009
    op.create_index("idx_clients_country", "clients", ["country_code"])
    op.create_index("idx_suppliers_country", "suppliers", ["country_code"])

    # Index from 0010
    op.create_index("idx_quotes_contract", "quotes", ["contract_id"])
    op.create_index("idx_quotes_bpu_source", "quotes", ["bpu_source_id"])
    op.create_index("idx_invoices_contract", "invoices", ["contract_id"])
    op.create_index("idx_invoices_situation", "invoices", ["situation_id"])
    op.create_index("idx_contracts_org", "contracts", ["organization_id"])
    op.create_index("idx_contracts_client", "contracts", ["client_id"])
    op.create_index("idx_situations_contract", "situations", ["contract_id"])
    op.create_index("idx_situation_lines_situation", "situation_lines", ["situation_id"])

    # ── RLS — Row Level Security ─────────────────────────────────────────────
    op.execute("CREATE SCHEMA IF NOT EXISTS auth")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
          LANGUAGE sql STABLE
          AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$
        """
    )

    rls_tables = [
        "invoices",
        "quotes",
        "clients",
        "suppliers",
        "products",
        "price_coefficients",
        "client_product_variants",
        "client_purchase_orders",
        "supplier_quotes",
        "supplier_orders",
        "supplier_invoices",
        "payments",
        "expenses",
        "employees",
        "payslips",
        "journal_entries",
        "tax_declarations",
        "organization_storage_configs",
        "organization_memberships",
        "invitations",
    ]

    for table in rls_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY org_isolation ON {table}
              FOR ALL USING (
                organization_id IN (
                  SELECT organization_id FROM organization_memberships
                  WHERE user_id = auth.uid()
                )
              )
            """
        )


def downgrade() -> None:
    pass
