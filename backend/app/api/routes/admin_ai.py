# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Routes super-admin pour la gestion du module IA."""

import json
import os
import time
import uuid as uuid_mod

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_platform_admin
from app.schemas.ai import (
    AiConfigResponse,
    AiConfigUpdate,
    AiModelCreate,
    AiModelResponse,
    AiModelUpdate,
    AiProviderCreate,
    AiProviderResponse,
    AiProviderTestResult,
    AiProviderUpdate,
    AiRoleTestResult,
    AiRolesResponse,
    AiRolesUpdate,
    AiUsageStats,
)
from app.services import ai_providers as providers_svc

router = APIRouter(prefix="/api/admin/ai", tags=["Admin IA"])


async def _get_litellm_config(db: AsyncSession) -> tuple[str, str]:
    """Recupere l'URL et la cle LiteLLM depuis platform_config ou env."""
    result = await db.execute(
        text("SELECT ai_litellm_base_url, ai_litellm_master_key FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    url = (row[0] if row and row[0] else None) or os.getenv("LITELLM_BASE_URL", "http://litellm:4000")
    key = (row[1] if row and row[1] else None) or os.getenv("LITELLM_MASTER_KEY", "")
    return url, key


async def _auto_enable_ai_if_models(db: AsyncSession) -> None:
    """Active automatiquement l'IA plateforme + toutes les orgs si des modeles actifs existent."""
    result = await db.execute(text("SELECT COUNT(*) FROM ai_models WHERE is_active = true"))
    nb = result.scalar() or 0
    if nb > 0:
        await db.execute(text("UPDATE platform_config SET ai_enabled = true, updated_at = now() WHERE ai_enabled = false"))
        await db.execute(text("UPDATE organizations SET module_ai_enabled = true WHERE module_ai_enabled = false"))
        await db.commit()


# Flag pour ne pas re-enregistrer a chaque requete GET /config
_litellm_models_ensured = False


async def _ensure_models_in_litellm(db: AsyncSession) -> None:
    """Re-enregistre les modeles actifs dans LiteLLM si besoin (perte au restart)."""
    global _litellm_models_ensured
    if _litellm_models_ensured:
        return
    _litellm_models_ensured = True

    litellm_url, litellm_key = await _get_litellm_config(db)
    result = await db.execute(
        text("""
            SELECT m.model_id, p.type, p.api_key, p.base_url
            FROM ai_models m
            JOIN ai_providers p ON p.id = m.provider_id
            WHERE m.is_active = true AND p.is_active = true
        """)
    )
    rows = result.fetchall()
    for model_id, provider_type, api_key, base_url in rows:
        await providers_svc.register_model_in_litellm(
            litellm_url, litellm_key,
            provider_type, model_id,
            api_key=api_key, base_url=base_url,
        )


# ── Fournisseurs ──────────────────────────────────────────────────────────────


@router.get("/providers", response_model=list[AiProviderResponse])
async def list_providers(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT p.id, p.name, p.type, p.base_url, p.is_active,
                   p.last_check_at, p.last_check_ok, p.created_at, p.updated_at,
                   (SELECT COUNT(*) FROM ai_models m WHERE m.provider_id = p.id) AS model_count
            FROM ai_providers p
            ORDER BY p.created_at
        """)
    )
    return [
        AiProviderResponse(
            id=r[0], name=r[1], type=r[2], base_url=r[3], is_active=r[4],
            last_check_at=r[5], last_check_ok=r[6], created_at=r[7], updated_at=r[8],
            model_count=r[9],
        )
        for r in result.fetchall()
    ]


@router.post("/providers", status_code=201)
async def create_provider(
    body: AiProviderCreate,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    new_id = uuid_mod.uuid4()
    await db.execute(
        text("""
            INSERT INTO ai_providers (id, name, type, base_url, api_key, is_active, created_at, updated_at)
            VALUES (:id, :name, :type, :url, :key, true, now(), now())
        """),
        {
            "id": str(new_id),
            "name": body.name,
            "type": body.type,
            "url": body.base_url,
            "key": body.api_key,
        },
    )
    await db.commit()

    # Auto-test connexion + sync modeles + enregistrement LiteLLM
    test_result = await providers_svc.test_connection(body.type, body.base_url, body.api_key)
    synced = 0
    if test_result["success"]:
        try:
            ll_url, ll_key = await _get_litellm_config(db)
            synced = await providers_svc.sync_models(
                db, new_id, body.type, body.base_url, body.api_key,
                litellm_url=ll_url, litellm_key=ll_key,
            )
            await _auto_enable_ai_if_models(db)
        except Exception:
            pass
    else:
        await db.execute(
            text("UPDATE ai_providers SET last_check_at = now(), last_check_ok = false, updated_at = now() WHERE id = :id"),
            {"id": str(new_id)},
        )
        await db.commit()

    return {
        "id": str(new_id),
        "test": test_result,
        "synced": synced,
    }


@router.put("/providers/{provider_id}", response_model=dict)
async def update_provider(
    provider_id: uuid_mod.UUID,
    body: AiProviderUpdate,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    sets = []
    params: dict = {"id": str(provider_id)}
    if body.name is not None:
        sets.append("name = :name")
        params["name"] = body.name
    if body.type is not None:
        sets.append("type = :type")
        params["type"] = body.type
    if body.base_url is not None:
        sets.append("base_url = :url")
        params["url"] = body.base_url
    if body.api_key is not None:
        sets.append("api_key = :key")
        params["key"] = body.api_key
    if body.is_active is not None:
        sets.append("is_active = :active")
        params["active"] = body.is_active
    if not sets:
        return {"ok": True}
    sets.append("updated_at = now()")
    await db.execute(text(f"UPDATE ai_providers SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()

    # Auto-test + resync apres modification
    row = await db.execute(
        text("SELECT type, base_url, api_key FROM ai_providers WHERE id = :id"),
        {"id": str(provider_id)},
    )
    prov = row.fetchone()
    test_result = {"success": False, "message": "Fournisseur introuvable"}
    synced = 0
    if prov:
        test_result = await providers_svc.test_connection(prov[0], prov[1], prov[2])
        if test_result["success"]:
            try:
                ll_url, ll_key = await _get_litellm_config(db)
                synced = await providers_svc.sync_models(
                    db, provider_id, prov[0], prov[1], prov[2],
                    litellm_url=ll_url, litellm_key=ll_key,
                )
                await _auto_enable_ai_if_models(db)
            except Exception:
                pass
        else:
            await db.execute(
                text("UPDATE ai_providers SET last_check_at = now(), last_check_ok = false, updated_at = now() WHERE id = :id"),
                {"id": str(provider_id)},
            )
            await db.commit()

    return {"ok": True, "test": test_result, "synced": synced}


@router.delete("/providers/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: uuid_mod.UUID,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.ai_providers import _purge_provider_models_from_litellm

    # Charger le provider pour connaitre son type
    row = (await db.execute(
        text("SELECT type FROM ai_providers WHERE id = :id"),
        {"id": str(provider_id)},
    )).fetchone()

    # Purger les modeles de LiteLLM
    if row:
        cfg_row = (await db.execute(
            text("SELECT ai_litellm_base_url, ai_litellm_master_key FROM platform_config LIMIT 1")
        )).fetchone()
        litellm_url = cfg_row[0] if cfg_row else None
        litellm_key = cfg_row[1] if cfg_row else None
        if litellm_url and litellm_key:
            await _purge_provider_models_from_litellm(litellm_url, litellm_key, row[0])

    # Supprimer les modeles en base puis le provider
    await db.execute(text("DELETE FROM ai_models WHERE provider_id = :id"), {"id": str(provider_id)})
    await db.execute(text("DELETE FROM ai_providers WHERE id = :id"), {"id": str(provider_id)})
    await db.commit()


@router.post("/providers/{provider_id}/test", response_model=AiProviderTestResult)
async def test_provider(
    provider_id: uuid_mod.UUID,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT type, base_url, api_key FROM ai_providers WHERE id = :id"),
        {"id": str(provider_id)},
    )
    row = result.fetchone()
    if not row:
        return AiProviderTestResult(success=False, message="Fournisseur introuvable")

    test_result = await providers_svc.test_connection(row[0], row[1], row[2])

    # Mettre a jour le statut
    await db.execute(
        text("UPDATE ai_providers SET last_check_at = now(), last_check_ok = :ok, updated_at = now() WHERE id = :id"),
        {"id": str(provider_id), "ok": test_result["success"]},
    )
    await db.commit()

    return AiProviderTestResult(**test_result)


@router.get("/providers/{provider_id}/models", response_model=list[AiModelResponse])
async def get_provider_models(
    provider_id: uuid_mod.UUID,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT m.id, m.provider_id, m.model_id, m.display_name, m.capabilities,
                   m.context_window, m.is_active, m.created_at, m.updated_at,
                   p.name, p.type
            FROM ai_models m
            JOIN ai_providers p ON p.id = m.provider_id
            WHERE m.provider_id = :pid
            ORDER BY m.display_name
        """),
        {"pid": str(provider_id)},
    )
    return [
        AiModelResponse(
            id=r[0], provider_id=r[1], model_id=r[2], display_name=r[3],
            capabilities=r[4], context_window=r[5], is_active=r[6],
            created_at=r[7], updated_at=r[8], provider_name=r[9], provider_type=r[10],
        )
        for r in result.fetchall()
    ]


@router.post("/providers/{provider_id}/sync", response_model=dict)
async def sync_provider_models(
    provider_id: uuid_mod.UUID,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT type, base_url, api_key FROM ai_providers WHERE id = :id"),
        {"id": str(provider_id)},
    )
    row = result.fetchone()
    if not row:
        return {"synced": 0, "message": "Fournisseur introuvable"}

    ll_url, ll_key = await _get_litellm_config(db)
    count = await providers_svc.sync_models(
        db, provider_id, row[0], row[1], row[2],
        litellm_url=ll_url, litellm_key=ll_key,
    )
    await _auto_enable_ai_if_models(db)
    return {"synced": count, "message": f"{count} modeles synchronises"}


# ── Modeles ───────────────────────────────────────────────────────────────────


@router.get("/models", response_model=list[AiModelResponse])
async def list_models(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT m.id, m.provider_id, m.model_id, m.display_name, m.capabilities,
                   m.context_window, m.is_active, m.created_at, m.updated_at,
                   p.name, p.type
            FROM ai_models m
            JOIN ai_providers p ON p.id = m.provider_id
            ORDER BY p.name, m.display_name
        """)
    )
    return [
        AiModelResponse(
            id=r[0], provider_id=r[1], model_id=r[2], display_name=r[3],
            capabilities=r[4], context_window=r[5], is_active=r[6],
            created_at=r[7], updated_at=r[8], provider_name=r[9], provider_type=r[10],
        )
        for r in result.fetchall()
    ]


@router.post("/models", response_model=AiModelResponse, status_code=201)
async def create_model(
    body: AiModelCreate,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    new_id = uuid_mod.uuid4()
    caps = json.dumps(body.capabilities) if body.capabilities else None
    await db.execute(
        text("""
            INSERT INTO ai_models (id, provider_id, model_id, display_name, capabilities, context_window, is_active, created_at, updated_at)
            VALUES (:id, :pid, :mid, :dname, CAST(:caps AS jsonb), :ctx, true, now(), now())
        """),
        {
            "id": str(new_id),
            "pid": str(body.provider_id),
            "mid": body.model_id,
            "dname": body.display_name,
            "caps": caps,
            "ctx": body.context_window,
        },
    )
    await db.commit()

    # Recuperer le provider pour la reponse
    prov = await db.execute(
        text("SELECT name, type FROM ai_providers WHERE id = :id"),
        {"id": str(body.provider_id)},
    )
    prow = prov.fetchone()

    return AiModelResponse(
        id=new_id, provider_id=body.provider_id, model_id=body.model_id,
        display_name=body.display_name, capabilities=body.capabilities,
        context_window=body.context_window, is_active=True,
        created_at=None, updated_at=None,
        provider_name=prow[0] if prow else "", provider_type=prow[1] if prow else "",
    )


@router.put("/models/{model_id}")
async def update_model(
    model_id: uuid_mod.UUID,
    body: AiModelUpdate,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    sets = []
    params: dict = {"id": str(model_id)}
    if body.display_name is not None:
        sets.append("display_name = :dname")
        params["dname"] = body.display_name
    if body.capabilities is not None:
        sets.append("capabilities = CAST(:caps AS jsonb)")
        params["caps"] = json.dumps(body.capabilities)
    if body.context_window is not None:
        sets.append("context_window = :ctx")
        params["ctx"] = body.context_window
    if body.is_active is not None:
        sets.append("is_active = :active")
        params["active"] = body.is_active
    if not sets:
        return {"ok": True}
    sets.append("updated_at = now()")
    await db.execute(text(f"UPDATE ai_models SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return {"ok": True}


@router.delete("/models/{model_id}", status_code=204)
async def delete_model(
    model_id: uuid_mod.UUID,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    # Recuperer les infos du modele pour le supprimer aussi de LiteLLM
    row = await db.execute(
        text("""
            SELECT m.model_id, p.type
            FROM ai_models m JOIN ai_providers p ON m.provider_id = p.id
            WHERE m.id = :id
        """),
        {"id": str(model_id)},
    )
    model_row = row.fetchone()

    await db.execute(text("DELETE FROM ai_models WHERE id = :id"), {"id": str(model_id)})
    await db.commit()

    # Supprimer de LiteLLM en arriere-plan
    if model_row:
        cfg = await db.execute(text("SELECT ai_litellm_base_url, ai_litellm_master_key FROM platform_config LIMIT 1"))
        cfg_row = cfg.fetchone()
        if cfg_row and cfg_row[0] and cfg_row[1]:
            ll_name = f"{model_row[1]}/{model_row[0]}"
            await providers_svc.remove_model_from_litellm(cfg_row[0], cfg_row[1], ll_name)


# ── Roles ─────────────────────────────────────────────────────────────────────


@router.get("/roles", response_model=AiRolesResponse)
async def get_roles(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT ai_role_vl_model_id, ai_role_instruct_model_id, ai_role_thinking_model_id FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    if not row:
        return AiRolesResponse()

    async def _model_resp(mid):
        if not mid:
            return None
        r = await db.execute(
            text("""
                SELECT m.id, m.provider_id, m.model_id, m.display_name, m.capabilities,
                       m.context_window, m.is_active, m.created_at, m.updated_at,
                       p.name, p.type
                FROM ai_models m JOIN ai_providers p ON p.id = m.provider_id
                WHERE m.id = :id
            """),
            {"id": str(mid)},
        )
        mr = r.fetchone()
        if not mr:
            return None
        return AiModelResponse(
            id=mr[0], provider_id=mr[1], model_id=mr[2], display_name=mr[3],
            capabilities=mr[4], context_window=mr[5], is_active=mr[6],
            created_at=mr[7], updated_at=mr[8], provider_name=mr[9], provider_type=mr[10],
        )

    return AiRolesResponse(
        vl=await _model_resp(row[0]),
        instruct=await _model_resp(row[1]),
        thinking=await _model_resp(row[2]),
    )


@router.put("/roles")
async def update_roles(
    body: AiRolesUpdate,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            UPDATE platform_config
            SET ai_role_vl_model_id = :vl,
                ai_role_instruct_model_id = :instruct,
                ai_role_thinking_model_id = :thinking,
                updated_at = now()
        """),
        {
            "vl": str(body.vl) if body.vl else None,
            "instruct": str(body.instruct) if body.instruct else None,
            "thinking": str(body.thinking) if body.thinking else None,
        },
    )
    await db.commit()
    return {"ok": True}


@router.post("/roles/test", response_model=list[AiRoleTestResult])
async def test_roles(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services import ai as ai_svc

    config = await ai_svc._get_ai_config(db)
    results = []

    for role, model_id in [("vl", config["vl_model_id"]), ("instruct", config["instruct_model_id"]), ("thinking", config["thinking_model_id"])]:
        if not model_id:
            results.append(AiRoleTestResult(role=role, success=False, message="Non configure"))
            continue

        model = await ai_svc._resolve_model(db, model_id)
        if not model:
            results.append(AiRoleTestResult(role=role, success=False, message="Modele introuvable ou inactif"))
            continue

        try:
            start = time.monotonic()
            messages = [{"role": "user", "content": "Reponds 'OK' en un seul mot."}]
            await ai_svc._call_litellm(config["litellm_url"], config["litellm_key"], model["litellm_name"], messages, max_tokens=10)
            duration = int((time.monotonic() - start) * 1000)
            results.append(AiRoleTestResult(role=role, success=True, message=f"{model['display_name']} OK", duration_ms=duration))
        except Exception as exc:
            results.append(AiRoleTestResult(role=role, success=False, message=str(exc)[:200]))

    return results


# ── Config ────────────────────────────────────────────────────────────────────


@router.get("/config", response_model=AiConfigResponse)
async def get_config(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    # Auto-active l'IA si des modeles existent (rattrapage)
    await _auto_enable_ai_if_models(db)
    # Re-enregistre les modeles dans LiteLLM si absent (perte au restart)
    await _ensure_models_in_litellm(db)

    result = await db.execute(
        text("""
            SELECT ai_enabled, ai_litellm_base_url, ai_litellm_master_key, ai_features,
                   ai_role_vl_model_id, ai_role_instruct_model_id, ai_role_thinking_model_id,
                   ai_paddlex_url, ai_extraction_prompt
            FROM platform_config LIMIT 1
        """)
    )
    row = result.fetchone()
    env_key = os.getenv("LITELLM_MASTER_KEY", "")
    if not row:
        return AiConfigResponse(
            ai_enabled=False,
            ai_litellm_base_url="http://litellm:4000",
            has_master_key=bool(env_key),
            ai_paddlex_url=None,
            ai_features=None,
            ai_extraction_prompt=None,
            roles=AiRolesResponse(),
        )

    roles = await get_roles(_admin=_admin, db=db)
    return AiConfigResponse(
        ai_enabled=row[0],
        ai_litellm_base_url=row[1] or "http://litellm:4000",
        has_master_key=bool(row[2] or env_key),
        ai_paddlex_url=row[7],
        ai_features=row[3],
        ai_extraction_prompt=row[8],
        roles=roles,
    )


@router.put("/config")
async def update_config(
    body: AiConfigUpdate,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    sets = []
    params: dict = {}
    if body.ai_enabled is not None:
        sets.append("ai_enabled = :enabled")
        params["enabled"] = body.ai_enabled
    if body.ai_litellm_base_url is not None:
        sets.append("ai_litellm_base_url = :url")
        params["url"] = body.ai_litellm_base_url
    if body.ai_litellm_master_key is not None:
        sets.append("ai_litellm_master_key = :key")
        params["key"] = body.ai_litellm_master_key
    if body.ai_paddlex_url is not None:
        sets.append("ai_paddlex_url = :paddlex_url")
        params["paddlex_url"] = body.ai_paddlex_url or None
    if body.ai_features is not None:
        sets.append("ai_features = CAST(:features AS jsonb)")
        params["features"] = json.dumps(body.ai_features)
    if body.ai_extraction_prompt is not None:
        sets.append("ai_extraction_prompt = :extraction_prompt")
        params["extraction_prompt"] = body.ai_extraction_prompt or None
    if not sets:
        return {"ok": True}
    sets.append("updated_at = now()")
    await db.execute(text(f"UPDATE platform_config SET {', '.join(sets)}"), params)
    await db.commit()
    return {"ok": True}


@router.post("/config/test")
async def test_litellm_connection(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Teste la connexion au proxy LiteLLM depuis le backend."""
    import httpx

    result = await db.execute(
        text("SELECT ai_litellm_base_url, ai_litellm_master_key FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    url = (row[0] if row and row[0] else None) or os.getenv("LITELLM_BASE_URL", "http://litellm:4000")
    key = (row[1] if row and row[1] else None) or os.getenv("LITELLM_MASTER_KEY", "")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": f"Bearer {key}"} if key else {}
            resp = await client.get(f"{url.rstrip('/')}/health/liveliness", headers=headers)
            if resp.status_code in (200, 500):
                # 500 "Model list not initialized" = connexion OK, aucun modele configure
                return {"ok": True, "message": "LiteLLM connecte"}
            if resp.status_code == 401:
                return {"ok": False, "message": "Cle d'authentification invalide"}
            return {"ok": False, "message": f"Erreur HTTP {resp.status_code}"}
    except Exception as exc:
        return {"ok": False, "message": f"Impossible de joindre LiteLLM : {exc}"}


@router.post("/config/test-paddlex")
async def test_paddlex_connection(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Teste la connexion au serveur PaddleX Serving distant."""
    import httpx

    result = await db.execute(
        text("SELECT ai_paddlex_url FROM platform_config LIMIT 1")
    )
    row = result.fetchone()
    url = row[0] if row and row[0] else None

    if not url:
        return {"ok": False, "message": "URL PaddleX non configuree"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # PaddleX Serving repond sur / ou /layout-parsing
            resp = await client.get(f"{url.rstrip('/')}/")
            # Tout statut HTTP = serveur joignable (meme 404/405)
            return {"ok": True, "message": f"PaddleX connecte ({url})"}
    except httpx.ConnectError:
        return {"ok": False, "message": f"PaddleX non joignable sur {url}"}
    except httpx.TimeoutException:
        return {"ok": False, "message": f"PaddleX timeout sur {url}"}
    except Exception as exc:
        return {"ok": False, "message": f"Erreur PaddleX : {exc}"}


# ── Usage ─────────────────────────────────────────────────────────────────────


@router.get("/usage", response_model=AiUsageStats)
async def get_usage(
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    # Stats globales
    totals = await db.execute(
        text("""
            SELECT COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0), COUNT(*)
            FROM ai_usage_logs
            WHERE created_at >= now() - interval '30 days'
        """)
    )
    t = totals.fetchone()

    # Par role
    by_role = await db.execute(
        text("""
            SELECT role, COUNT(*) FROM ai_usage_logs
            WHERE created_at >= now() - interval '30 days'
            GROUP BY role
        """)
    )
    calls_by_role = {r[0]: r[1] for r in by_role.fetchall()}

    # Stats quotidiennes
    daily = await db.execute(
        text("""
            SELECT DATE(created_at) AS day, SUM(tokens_in), SUM(tokens_out), COUNT(*)
            FROM ai_usage_logs
            WHERE created_at >= now() - interval '30 days'
            GROUP BY day ORDER BY day
        """)
    )
    daily_stats = [
        {"date": str(r[0]), "tokens_in": int(r[1]), "tokens_out": int(r[2]), "calls": r[3]}
        for r in daily.fetchall()
    ]

    # Top orgs
    top = await db.execute(
        text("""
            SELECT o.name, SUM(l.tokens_in + l.tokens_out) AS total
            FROM ai_usage_logs l
            JOIN organizations o ON o.id = l.organization_id
            WHERE l.created_at >= now() - interval '30 days'
            GROUP BY o.id, o.name
            ORDER BY total DESC LIMIT 5
        """)
    )
    top_orgs = [{"name": r[0], "tokens": int(r[1])} for r in top.fetchall()]

    return AiUsageStats(
        total_tokens_in=int(t[0]),
        total_tokens_out=int(t[1]),
        total_calls=t[2],
        calls_by_role=calls_by_role,
        daily_stats=daily_stats,
        top_organizations=top_orgs,
    )


@router.get("/usage/{org_id}", response_model=AiUsageStats)
async def get_org_usage(
    org_id: uuid_mod.UUID,
    _admin: uuid_mod.UUID = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    totals = await db.execute(
        text("""
            SELECT COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0), COUNT(*)
            FROM ai_usage_logs
            WHERE organization_id = :oid AND created_at >= now() - interval '30 days'
        """),
        {"oid": str(org_id)},
    )
    t = totals.fetchone()

    by_role = await db.execute(
        text("""
            SELECT role, COUNT(*) FROM ai_usage_logs
            WHERE organization_id = :oid AND created_at >= now() - interval '30 days'
            GROUP BY role
        """),
        {"oid": str(org_id)},
    )
    calls_by_role = {r[0]: r[1] for r in by_role.fetchall()}

    return AiUsageStats(
        total_tokens_in=int(t[0]),
        total_tokens_out=int(t[1]),
        total_calls=t[2],
        calls_by_role=calls_by_role,
    )
