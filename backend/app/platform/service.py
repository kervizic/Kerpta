# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service CMS page vitrine — lecture et gestion du contenu platform_content."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.platform.seed import INITIAL_SECTIONS

_log = logging.getLogger(__name__)


async def get_all_sections(db: AsyncSession) -> list[dict[str, Any]]:
    """Retourne toutes les sections visibles triées par sort_order."""
    result = await db.execute(
        text(
            "SELECT section, content, visible, sort_order "
            "FROM platform_content "
            "WHERE visible = true "
            "ORDER BY sort_order ASC"
        )
    )
    rows = result.fetchall()
    return [
        {
            "section": row[0],
            "content": row[1],
            "visible": row[2],
            "sort_order": row[3],
        }
        for row in rows
    ]


async def get_section(db: AsyncSession, section: str) -> dict[str, Any] | None:
    """Retourne le contenu d'une section spécifique."""
    result = await db.execute(
        text(
            "SELECT section, content, visible, sort_order "
            "FROM platform_content WHERE section = :section"
        ),
        {"section": section},
    )
    row = result.fetchone()
    if not row:
        return None
    return {"section": row[0], "content": row[1], "visible": row[2], "sort_order": row[3]}


async def seed_content(db: AsyncSession) -> None:
    """Insère le contenu initial (seed) — ignore les sections déjà présentes."""
    for item in INITIAL_SECTIONS:
        await db.execute(
            text(
                """
                INSERT INTO platform_content (section, content, visible, sort_order)
                VALUES (:section, CAST(:content AS jsonb), :visible, :sort_order)
                ON CONFLICT (section) DO NOTHING
                """
            ),
            {
                "section": item["section"],
                "content": __import__("json").dumps(item["content"]),
                "visible": item["visible"],
                "sort_order": item["sort_order"],
            },
        )
    await db.commit()
    _log.info("[platform] Seed contenu vitrine terminé (%d sections)", len(INITIAL_SECTIONS))


async def reset_and_seed_content(db_url: str) -> None:
    """Supprime et re-seed tout le contenu vitrine.

    Utilisé en mode dev (KERPTA_DEV_RESET_CONTENT=true) pour que les
    modifications du fichier seed.py soient visibles sans intervention manuelle.
    """
    engine = create_async_engine(db_url, echo=False)
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM platform_content"))
        _log.info("[platform] Contenu vitrine supprimé (reset dev)")

    async with engine.begin() as conn:
        for item in INITIAL_SECTIONS:
            await conn.execute(
                text(
                    """
                    INSERT INTO platform_content (section, content, visible, sort_order)
                    VALUES (:section, CAST(:content AS jsonb), :visible, :sort_order)
                    """
                ),
                {
                    "section": item["section"],
                    "content": __import__("json").dumps(item["content"]),
                    "visible": item["visible"],
                    "sort_order": item["sort_order"],
                },
            )
        _log.info("[platform] Contenu vitrine re-seedé (%d sections)", len(INITIAL_SECTIONS))

    await engine.dispose()
