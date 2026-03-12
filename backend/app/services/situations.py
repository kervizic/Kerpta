# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service métier — situations d'avancement."""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.situations import SituationCreate, SituationUpdate
from app.services.numbering import generate_number


async def list_situations(
    org_id: uuid.UUID, contract_id: str, db: AsyncSession
) -> list[dict]:
    """Liste des situations d'un contrat."""
    result = await db.execute(
        text("""
            SELECT s.id::text, s.contract_id::text, s.bpu_quote_id::text,
                   s.situation_number, s.period_label, s.status,
                   s.cumulative_total, s.previously_invoiced, s.invoice_amount,
                   s.invoice_id::text, s.created_at, s.updated_at
            FROM situations s
            WHERE s.contract_id = :cid AND s.organization_id = :org_id
            ORDER BY s.situation_number
        """),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def create_situation(
    org_id: uuid.UUID, contract_id: str, data: SituationCreate, db: AsyncSession
) -> dict:
    """Crée une nouvelle situation avec pré-remplissage depuis le BPU."""
    # Vérifier le contrat et récupérer le bpu_quote_id
    contract_result = await db.execute(
        text("""
            SELECT contract_type, status, bpu_quote_id::text
            FROM contracts
            WHERE id = :cid AND organization_id = :org_id
        """),
        {"cid": contract_id, "org_id": str(org_id)},
    )
    contract = contract_result.fetchone()
    if contract is None:
        raise HTTPException(404, "Contrat introuvable")
    if contract[1] not in ("active", "draft"):
        raise HTTPException(409, "Le contrat n'est pas actif")

    bpu_quote_id = contract[2]
    if bpu_quote_id is None:
        raise HTTPException(422, "Le contrat n'a pas de BPU associé")

    # Vérifier qu'il n'y a pas de situation en brouillon
    draft_check = await db.execute(
        text("""
            SELECT id FROM situations
            WHERE contract_id = :cid AND status = 'draft'
        """),
        {"cid": contract_id},
    )
    if draft_check.fetchone() is not None:
        raise HTTPException(409, "Une situation en brouillon existe déjà pour ce contrat")

    # Calculer le prochain numéro de situation
    num_result = await db.execute(
        text("""
            SELECT COALESCE(MAX(situation_number), 0) + 1
            FROM situations
            WHERE contract_id = :cid
        """),
        {"cid": contract_id},
    )
    situation_number = num_result.scalar()

    # Récupérer les lignes du BPU
    bpu_lines = await db.execute(
        text("""
            SELECT ql.id::text, ql.reference, ql.description, ql.unit, ql.total_ht
            FROM quote_lines ql
            WHERE ql.quote_id = :bpu_id
            ORDER BY ql.position
        """),
        {"bpu_id": bpu_quote_id},
    )
    lines = bpu_lines.fetchall()
    if not lines:
        raise HTTPException(422, "Le BPU n'a aucune ligne")

    # Récupérer les % cumulés de la dernière situation validée
    prev_result = await db.execute(
        text("""
            SELECT sl.quote_line_id::text, sl.completion_percent
            FROM situation_lines sl
            JOIN situations s ON s.id = sl.situation_id
            WHERE s.contract_id = :cid AND s.status != 'draft'
              AND s.situation_number = (
                  SELECT MAX(situation_number)
                  FROM situations
                  WHERE contract_id = :cid AND status != 'draft'
              )
        """),
        {"cid": contract_id},
    )
    prev_percents: dict[str, Decimal] = {}
    for row in prev_result.fetchall():
        prev_percents[row[0]] = Decimal(str(row[1]))

    # Créer la situation
    situation_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO situations (
                id, organization_id, contract_id, bpu_quote_id,
                situation_number, period_label, status,
                cumulative_total, previously_invoiced, invoice_amount,
                created_at, updated_at
            ) VALUES (
                :id, :org_id, :cid, :bpu_id,
                :num, :label, 'draft',
                0, 0, 0,
                now(), now()
            )
        """),
        {
            "id": str(situation_id),
            "org_id": str(org_id),
            "cid": contract_id,
            "bpu_id": bpu_quote_id,
            "num": situation_number,
            "label": data.period_label,
        },
    )

    # Créer les lignes pré-remplies
    for line in lines:
        line_id = uuid.uuid4()
        quote_line_id = line[0]
        total_contract = Decimal(str(line[4]))
        prev_pct = prev_percents.get(quote_line_id, Decimal("0"))
        previously_invoiced = (prev_pct * total_contract / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        await db.execute(
            text("""
                INSERT INTO situation_lines (
                    id, situation_id, quote_line_id, total_contract,
                    previous_completion_percent, completion_percent,
                    cumulative_amount, previously_invoiced, line_invoice_amount
                ) VALUES (
                    :id, :sid, :qlid, :total,
                    :prev_pct, :prev_pct,
                    :prev_invoiced, :prev_invoiced, 0
                )
            """),
            {
                "id": str(line_id),
                "sid": str(situation_id),
                "qlid": quote_line_id,
                "total": str(total_contract),
                "prev_pct": str(prev_pct),
                "prev_invoiced": str(previously_invoiced),
            },
        )

    await db.commit()
    return {"id": str(situation_id), "situation_number": situation_number}


async def get_situation(
    org_id: uuid.UUID, situation_id: str, db: AsyncSession
) -> dict:
    """Détail d'une situation avec ses lignes."""
    result = await db.execute(
        text("""
            SELECT s.id::text, s.contract_id::text, s.bpu_quote_id::text,
                   s.situation_number, s.period_label, s.status,
                   s.cumulative_total, s.previously_invoiced, s.invoice_amount,
                   s.invoice_id::text, s.created_at, s.updated_at
            FROM situations s
            WHERE s.id = :sid AND s.organization_id = :org_id
        """),
        {"sid": situation_id, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if row is None:
        raise HTTPException(404, "Situation introuvable")
    situation = dict(row._mapping)

    # Récupérer les lignes avec les infos du BPU
    lines_result = await db.execute(
        text("""
            SELECT sl.id::text, sl.quote_line_id::text,
                   ql.description, ql.reference, ql.unit,
                   sl.total_contract, sl.previous_completion_percent,
                   sl.completion_percent, sl.cumulative_amount,
                   sl.previously_invoiced, sl.line_invoice_amount
            FROM situation_lines sl
            JOIN quote_lines ql ON ql.id = sl.quote_line_id
            WHERE sl.situation_id = :sid
            ORDER BY ql.position
        """),
        {"sid": situation_id},
    )
    situation["lines"] = [dict(r._mapping) for r in lines_result.fetchall()]
    return situation


async def update_situation(
    org_id: uuid.UUID, situation_id: str, data: SituationUpdate, db: AsyncSession
) -> dict:
    """Met à jour une situation draft (label + lignes d'avancement)."""
    # Vérifier statut
    status_result = await db.execute(
        text("""
            SELECT status FROM situations
            WHERE id = :sid AND organization_id = :org_id
        """),
        {"sid": situation_id, "org_id": str(org_id)},
    )
    row = status_result.fetchone()
    if row is None:
        raise HTTPException(404, "Situation introuvable")
    if row[0] != "draft":
        raise HTTPException(409, "Seules les situations en brouillon peuvent être modifiées")

    if data.period_label is not None:
        await db.execute(
            text("UPDATE situations SET period_label = :label, updated_at = now() WHERE id = :sid"),
            {"label": data.period_label, "sid": situation_id},
        )

    if data.lines is not None:
        cumulative_total = Decimal("0")
        previously_invoiced_total = Decimal("0")

        for line_update in data.lines:
            pct = Decimal(str(line_update.completion_percent))

            # Récupérer la ligne existante
            line_result = await db.execute(
                text("""
                    SELECT total_contract, previous_completion_percent
                    FROM situation_lines
                    WHERE situation_id = :sid AND quote_line_id = :qlid
                """),
                {"sid": situation_id, "qlid": line_update.quote_line_id},
            )
            line_row = line_result.fetchone()
            if line_row is None:
                raise HTTPException(422, f"Ligne BPU {line_update.quote_line_id} introuvable dans cette situation")

            total_contract = Decimal(str(line_row[0]))
            prev_pct = Decimal(str(line_row[1]))

            if pct < prev_pct:
                raise HTTPException(
                    422,
                    f"Le pourcentage cumulé ({pct}%) ne peut pas être inférieur "
                    f"au pourcentage précédent ({prev_pct}%)"
                )
            if pct > Decimal("100"):
                raise HTTPException(422, "Le pourcentage cumulé ne peut pas dépasser 100%")

            cumulative_amount = (pct * total_contract / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            prev_invoiced = (prev_pct * total_contract / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            line_invoice_amount = cumulative_amount - prev_invoiced

            await db.execute(
                text("""
                    UPDATE situation_lines SET
                        completion_percent = :pct,
                        cumulative_amount = :cum,
                        previously_invoiced = :prev,
                        line_invoice_amount = :delta
                    WHERE situation_id = :sid AND quote_line_id = :qlid
                """),
                {
                    "pct": str(pct),
                    "cum": str(cumulative_amount),
                    "prev": str(prev_invoiced),
                    "delta": str(line_invoice_amount),
                    "sid": situation_id,
                    "qlid": line_update.quote_line_id,
                },
            )

            cumulative_total += cumulative_amount
            previously_invoiced_total += prev_invoiced

        invoice_amount = cumulative_total - previously_invoiced_total
        await db.execute(
            text("""
                UPDATE situations SET
                    cumulative_total = :cum,
                    previously_invoiced = :prev,
                    invoice_amount = :delta,
                    updated_at = now()
                WHERE id = :sid
            """),
            {
                "cum": str(cumulative_total),
                "prev": str(previously_invoiced_total),
                "delta": str(invoice_amount),
                "sid": situation_id,
            },
        )

    await db.commit()
    return {"status": "updated"}


async def validate_situation(
    org_id: uuid.UUID, situation_id: str, db: AsyncSession
) -> dict:
    """Valide une situation et génère la facture correspondante."""
    # Récupérer la situation
    sit_result = await db.execute(
        text("""
            SELECT s.id::text, s.contract_id::text, s.bpu_quote_id::text,
                   s.situation_number, s.period_label, s.status,
                   s.invoice_amount, c.client_id::text
            FROM situations s
            JOIN contracts c ON c.id = s.contract_id
            WHERE s.id = :sid AND s.organization_id = :org_id
        """),
        {"sid": situation_id, "org_id": str(org_id)},
    )
    sit = sit_result.fetchone()
    if sit is None:
        raise HTTPException(404, "Situation introuvable")
    if sit[5] != "draft":
        raise HTTPException(409, "Seules les situations en brouillon peuvent être validées")

    invoice_amount = Decimal(str(sit[6]))
    if invoice_amount <= 0:
        raise HTTPException(422, "Le montant à facturer doit être positif")

    contract_id = sit[1]
    situation_number = sit[3]
    client_id = sit[7]

    # Générer la facture
    invoice_id = uuid.uuid4()
    invoice_number = await generate_number("invoice", org_id, db)

    # TVA par défaut 20% sur le montant de la situation
    vat_rate = Decimal("20")
    subtotal_ht = invoice_amount
    total_vat = (subtotal_ht * vat_rate / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    total_ttc = subtotal_ht + total_vat

    await db.execute(
        text("""
            INSERT INTO invoices (
                id, organization_id, client_id, number,
                contract_id, situation_id, is_situation, situation_number,
                is_credit_note, status, issue_date, currency,
                subtotal_ht, total_vat, total_ttc, amount_paid,
                discount_type, discount_value, payment_terms,
                notes, created_at, updated_at
            ) VALUES (
                :id, :org_id, :client_id, :number,
                :contract_id, :situation_id, true, :sit_num,
                false, 'draft', CURRENT_DATE, 'EUR',
                :ht, :vat, :ttc, 0,
                'none', 0, 30,
                :notes, now(), now()
            )
        """),
        {
            "id": str(invoice_id),
            "org_id": str(org_id),
            "client_id": client_id,
            "number": invoice_number,
            "contract_id": contract_id,
            "situation_id": situation_id,
            "sit_num": situation_number,
            "ht": str(subtotal_ht),
            "vat": str(total_vat),
            "ttc": str(total_ttc),
            "notes": f"Situation n°{situation_number} — {sit[4]}",
        },
    )

    # Créer les lignes de facture depuis les lignes de situation
    sit_lines = await db.execute(
        text("""
            SELECT sl.quote_line_id::text, ql.description, ql.reference, ql.unit,
                   sl.completion_percent, sl.previous_completion_percent,
                   sl.line_invoice_amount, sl.total_contract
            FROM situation_lines sl
            JOIN quote_lines ql ON ql.id = sl.quote_line_id
            WHERE sl.situation_id = :sid AND sl.line_invoice_amount > 0
            ORDER BY ql.position
        """),
        {"sid": situation_id},
    )

    for i, sl in enumerate(sit_lines.fetchall()):
        line_id = uuid.uuid4()
        line_amount = Decimal(str(sl[6]))
        line_vat = (line_amount * vat_rate / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        prev_pct = Decimal(str(sl[5]))
        curr_pct = Decimal(str(sl[4]))
        desc = f"{sl[1] or ''} — {prev_pct}% → {curr_pct}%"

        await db.execute(
            text("""
                INSERT INTO invoice_lines (
                    id, invoice_id, position, description,
                    quantity, unit, unit_price, vat_rate,
                    discount_percent, total_ht, total_vat
                ) VALUES (
                    :id, :iid, :pos, :desc,
                    1, :unit, :price, :vat_rate,
                    0, :ht, :vat
                )
            """),
            {
                "id": str(line_id),
                "iid": str(invoice_id),
                "pos": i,
                "desc": desc.strip(),
                "unit": sl[3],
                "price": str(line_amount),
                "vat_rate": str(vat_rate),
                "ht": str(line_amount),
                "vat": str(line_vat),
            },
        )

    # Mettre à jour la situation
    await db.execute(
        text("""
            UPDATE situations SET
                status = 'invoiced',
                invoice_id = :iid,
                updated_at = now()
            WHERE id = :sid
        """),
        {"iid": str(invoice_id), "sid": situation_id},
    )

    # Mettre à jour total_invoiced du contrat
    await db.execute(
        text("""
            UPDATE contracts SET
                total_invoiced = COALESCE((
                    SELECT SUM(total_ttc) FROM invoices
                    WHERE contract_id = :cid AND status != 'cancelled'
                ), 0),
                updated_at = now()
            WHERE id = :cid
        """),
        {"cid": contract_id},
    )

    await db.commit()
    return {
        "status": "invoiced",
        "invoice_id": str(invoice_id),
        "invoice_number": invoice_number,
    }
