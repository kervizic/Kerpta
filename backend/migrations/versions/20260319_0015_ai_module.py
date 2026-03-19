# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Module Intelligence Artificielle : providers, models, usage, categorization."""

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


def upgrade() -> None:
    # ── Table ai_providers ────────────────────────────────────────────────────
    op.create_table(
        "ai_providers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "type",
            sa.String(30),
            nullable=False,
            comment="ollama, vllm, openai, anthropic, mistral, google, openai_compatible",
        ),
        sa.Column("base_url", sa.String(255), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True, comment="Chiffre AES-256"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_check_ok", sa.Boolean(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ── Table ai_models ───────────────────────────────────────────────────────
    op.create_table(
        "ai_models",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "provider_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ai_providers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model_id", sa.String(255), nullable=False, comment="ID cote provider"),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("capabilities", JSONB, nullable=True, comment='["vision","chat","thinking"]'),
        sa.Column("context_window", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_ai_models_provider", "ai_models", ["provider_id"])
    op.create_unique_constraint("uq_ai_models_provider_model", "ai_models", ["provider_id", "model_id"])

    # ── Table ai_usage_logs ───────────────────────────────────────────────────
    op.create_table(
        "ai_usage_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "model_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ai_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("role", sa.String(10), nullable=False, comment="vl, instruct, thinking"),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_ai_usage_org", "ai_usage_logs", ["organization_id", "created_at"])
    op.create_index("ix_ai_usage_model", "ai_usage_logs", ["model_id"])

    # ── Table ai_categorization_history ────────────────────────────────────────
    op.create_table(
        "ai_categorization_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("input_label", sa.Text(), nullable=False),
        sa.Column("input_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("suggested_account", sa.String(10), nullable=True),
        sa.Column("final_account", sa.String(10), nullable=True),
        sa.Column("was_correct", sa.Boolean(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_ai_categ_org", "ai_categorization_history", ["organization_id", "created_at"]
    )

    # ── Colonnes IA dans platform_config ───────────────────────────────────────
    op.add_column(
        "platform_config",
        sa.Column("ai_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "platform_config",
        sa.Column("ai_litellm_base_url", sa.String(255), nullable=True),
    )
    op.add_column(
        "platform_config",
        sa.Column("ai_litellm_master_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "platform_config",
        sa.Column(
            "ai_role_vl_model_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ai_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "platform_config",
        sa.Column(
            "ai_role_instruct_model_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ai_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "platform_config",
        sa.Column(
            "ai_role_thinking_model_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ai_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "platform_config",
        sa.Column("ai_features", JSONB, nullable=True, comment="Fonctionnalites IA activees"),
    )

    # ── Colonne module_ai_enabled dans organizations ──────────────────────────
    op.add_column(
        "organizations",
        sa.Column(
            "module_ai_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "module_ai_enabled")
    op.drop_column("platform_config", "ai_features")
    op.drop_column("platform_config", "ai_role_thinking_model_id")
    op.drop_column("platform_config", "ai_role_instruct_model_id")
    op.drop_column("platform_config", "ai_role_vl_model_id")
    op.drop_column("platform_config", "ai_litellm_master_key")
    op.drop_column("platform_config", "ai_litellm_base_url")
    op.drop_column("platform_config", "ai_enabled")

    op.drop_index("ix_ai_categ_org", "ai_categorization_history")
    op.drop_table("ai_categorization_history")
    op.drop_index("ix_ai_usage_model", "ai_usage_logs")
    op.drop_index("ix_ai_usage_org", "ai_usage_logs")
    op.drop_table("ai_usage_logs")
    op.drop_constraint("uq_ai_models_provider_model", "ai_models", type_="unique")
    op.drop_index("ix_ai_models_provider", "ai_models")
    op.drop_table("ai_models")
    op.drop_table("ai_providers")
