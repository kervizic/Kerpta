# Kerpta - Application comptable web francaise
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

"""Service d'import des lignes IA vers le catalogue produits.

Permet de creer des articles (specifiques client ou catalogue general)
ou de lier a des articles existants via des variantes client,
directement depuis les lignes extraites par l'IA.
"""

import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)


async def import_lines_to_catalog(
    org_id: uuid.UUID,
    import_id: str,
    client_id: str | None,
    line_actions: list[dict],
    db: AsyncSession,
) -> dict:
    """Cree des articles dans le catalogue depuis les lignes d'import IA.

    Pour chaque ligne selon l'action :
    - create_client : cree product(client_id=X, is_in_catalog=false)
    - create_catalog : cree product(is_in_catalog=true)
    - link_existing : cree client_product_variant sur le product existant
    - skip : ne fait rien, marque la ligne comme skip
    """
    # Verifier que l'import appartient a l'organisation
    imp = await db.execute(
        text("""
            SELECT id FROM document_imports
            WHERE id = :import_id AND organization_id = :org_id
        """),
        {"import_id": import_id, "org_id": str(org_id)},
    )
    if not imp.fetchone():
        raise HTTPException(404, "Import introuvable")

    created = []
    linked = []
    skipped = []
    errors = []

    for la in line_actions:
        line_id = la.get("line_id")
        action = la.get("action")
        existing_product_id = la.get("existing_product_id")

        # Recuperer les donnees de la ligne
        line = await db.execute(
            text("""
                SELECT id, extracted_reference, extracted_designation,
                       extracted_description, extracted_quantity,
                       extracted_unit, extracted_unit_price,
                       extracted_vat_rate, matched_product_id
                FROM document_import_lines
                WHERE id = :line_id AND import_id = :import_id
            """),
            {"line_id": line_id, "import_id": import_id},
        )
        row = line.mappings().first()
        if not row:
            errors.append({"line_id": line_id, "error": "Ligne introuvable"})
            continue

        # Eviter les doublons : si la ligne a deja un produit associe, passer
        if row["matched_product_id"] is not None and action != "skip":
            errors.append({
                "line_id": line_id,
                "error": "Ligne deja importee dans le catalogue",
            })
            continue

        try:
            if action == "create_client":
                if not client_id:
                    errors.append({
                        "line_id": line_id,
                        "error": "client_id requis pour create_client",
                    })
                    continue
                product_id = await _create_product(
                    org_id=org_id,
                    row=row,
                    client_id=client_id,
                    is_in_catalog=False,
                    db=db,
                )
                await _update_import_line(line_id, product_id, "create_client", db)
                created.append({"line_id": line_id, "product_id": product_id, "type": "client"})

            elif action == "create_catalog":
                product_id = await _create_product(
                    org_id=org_id,
                    row=row,
                    client_id=None,
                    is_in_catalog=True,
                    db=db,
                )
                await _update_import_line(line_id, product_id, "create_catalog", db)
                created.append({"line_id": line_id, "product_id": product_id, "type": "catalog"})

            elif action == "link_existing":
                if not existing_product_id:
                    errors.append({
                        "line_id": line_id,
                        "error": "existing_product_id requis pour link_existing",
                    })
                    continue
                # Verifier que le produit existe et appartient a l'org
                prod = await db.execute(
                    text("""
                        SELECT id FROM products
                        WHERE id = :pid AND organization_id = :org_id
                    """),
                    {"pid": existing_product_id, "org_id": str(org_id)},
                )
                if not prod.fetchone():
                    errors.append({
                        "line_id": line_id,
                        "error": "Produit existant introuvable",
                    })
                    continue

                if client_id:
                    await _create_variant(
                        org_id=org_id,
                        product_id=existing_product_id,
                        client_id=client_id,
                        row=row,
                        db=db,
                    )
                await _update_import_line(line_id, existing_product_id, "link_existing", db)
                linked.append({"line_id": line_id, "product_id": existing_product_id})

            elif action == "skip":
                await _update_import_line(line_id, None, "skip", db)
                skipped.append({"line_id": line_id})

            else:
                errors.append({"line_id": line_id, "error": f"Action inconnue : {action}"})

        except Exception as exc:
            _log.exception("Erreur import ligne %s", line_id)
            errors.append({"line_id": line_id, "error": str(exc)})

    await db.commit()

    return {
        "created": created,
        "linked": linked,
        "skipped": skipped,
        "errors": errors,
        "total_processed": len(created) + len(linked) + len(skipped),
    }


async def _create_product(
    org_id: uuid.UUID,
    row: dict,
    client_id: str | None,
    is_in_catalog: bool,
    db: AsyncSession,
) -> str:
    """Cree un article dans la table products."""
    product_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO products (
                id, organization_id, reference, name, description,
                unit, unit_price, vat_rate, client_id, is_in_catalog,
                sale_price_mode, is_composite, created_at
            ) VALUES (
                :id, :org_id, :reference, :name, :description,
                :unit, :unit_price, :vat_rate, :client_id, :is_in_catalog,
                'fixed', false, NOW()
            )
        """),
        {
            "id": product_id,
            "org_id": str(org_id),
            "reference": row["extracted_reference"],
            "name": row["extracted_designation"] or "Article importe",
            "description": row.get("extracted_description"),
            "unit": row["extracted_unit"],
            "unit_price": float(row["extracted_unit_price"]) if row["extracted_unit_price"] else None,
            "vat_rate": float(row["extracted_vat_rate"]) if row["extracted_vat_rate"] else 20.0,
            "client_id": client_id,
            "is_in_catalog": is_in_catalog,
        },
    )
    return product_id


async def _create_variant(
    org_id: uuid.UUID,
    product_id: str,
    client_id: str,
    row: dict,
    db: AsyncSession,
) -> str:
    """Cree une variante client sur un produit existant."""
    variant_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO client_product_variants (
                id, organization_id, product_id, client_id,
                variant_index, override_reference, override_name,
                price_mode, unit_price, is_active, created_at
            ) VALUES (
                :id, :org_id, :product_id, :client_id,
                1, :override_reference, :override_name,
                'fixed', :unit_price, true, NOW()
            )
        """),
        {
            "id": variant_id,
            "org_id": str(org_id),
            "product_id": product_id,
            "client_id": client_id,
            "override_reference": row["extracted_reference"],
            "override_name": row["extracted_designation"],
            "unit_price": float(row["extracted_unit_price"]) if row["extracted_unit_price"] else None,
        },
    )
    return variant_id


async def _update_import_line(
    line_id: str,
    product_id: str | None,
    action: str,
    db: AsyncSession,
) -> None:
    """Met a jour la ligne d'import avec le produit associe et l'action."""
    if product_id:
        await db.execute(
            text("""
                UPDATE document_import_lines
                SET matched_product_id = :product_id, import_action = :action
                WHERE id = :line_id
            """),
            {"product_id": product_id, "action": action, "line_id": line_id},
        )
    else:
        await db.execute(
            text("""
                UPDATE document_import_lines
                SET import_action = :action
                WHERE id = :line_id
            """),
            {"action": action, "line_id": line_id},
        )


async def auto_match_products(
    org_id: uuid.UUID,
    import_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Tente de matcher automatiquement les lignes d'import avec des articles existants.

    Cherche par reference exacte, puis par nom similaire.
    Retourne les suggestions de matching pour chaque ligne.
    """
    # Verifier que l'import appartient a l'organisation
    imp = await db.execute(
        text("""
            SELECT id FROM document_imports
            WHERE id = :import_id AND organization_id = :org_id
        """),
        {"import_id": import_id, "org_id": str(org_id)},
    )
    if not imp.fetchone():
        raise HTTPException(404, "Import introuvable")

    # Recuperer les lignes de l'import
    lines = await db.execute(
        text("""
            SELECT id::text, extracted_reference, extracted_designation,
                   matched_product_id, import_action
            FROM document_import_lines
            WHERE import_id = :import_id
            ORDER BY position
        """),
        {"import_id": import_id},
    )
    rows = lines.mappings().all()

    results = []

    for row in rows:
        line_id = row["id"]
        ref = row["extracted_reference"]
        designation = row["extracted_designation"]
        suggestions = []

        # Si la ligne est deja traitee, pas de suggestion
        if row["import_action"] not in ("pending", None):
            results.append({
                "line_id": line_id,
                "import_action": row["import_action"],
                "matched_product_id": str(row["matched_product_id"]) if row["matched_product_id"] else None,
                "suggestions": [],
            })
            continue

        # 1. Recherche par reference exacte (case-insensitive)
        if ref:
            exact = await db.execute(
                text("""
                    SELECT id::text, name, reference, unit_price
                    FROM products
                    WHERE organization_id = :org_id
                      AND LOWER(reference) = LOWER(:ref)
                      AND archived_at IS NULL
                    LIMIT 5
                """),
                {"org_id": str(org_id), "ref": ref},
            )
            for p in exact.mappings().all():
                suggestions.append({
                    "product_id": p["id"],
                    "product_name": p["name"],
                    "product_reference": p["reference"],
                    "product_unit_price": float(p["unit_price"]) if p["unit_price"] else None,
                    "match_type": "exact_ref",
                    "score": 1.0,
                })

        # 2. Recherche par nom similaire (LIKE)
        if designation and len(suggestions) < 5:
            # Nettoyer la designation pour la recherche
            search_term = designation.strip()
            if len(search_term) >= 3:
                similar = await db.execute(
                    text("""
                        SELECT id::text, name, reference, unit_price
                        FROM products
                        WHERE organization_id = :org_id
                          AND LOWER(name) LIKE LOWER(:pattern)
                          AND archived_at IS NULL
                          AND id::text NOT IN (
                            SELECT unnest(:exclude_ids)
                          )
                        LIMIT 5
                    """),
                    {
                        "org_id": str(org_id),
                        "pattern": f"%{search_term}%",
                        "exclude_ids": [s["product_id"] for s in suggestions] or ["__none__"],
                    },
                )
                for p in similar.mappings().all():
                    suggestions.append({
                        "product_id": p["id"],
                        "product_name": p["name"],
                        "product_reference": p["reference"],
                        "product_unit_price": float(p["unit_price"]) if p["unit_price"] else None,
                        "match_type": "name_similar",
                        "score": 0.5,
                    })

        results.append({
            "line_id": line_id,
            "import_action": row["import_action"],
            "matched_product_id": None,
            "suggestions": suggestions,
        })

    return results
