# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Service de gestion des fournisseurs IA : connexion, sync modeles, LiteLLM."""

import json
import logging
import uuid

import httpx
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)

# Plus de liste hardcodee - les modeles sont recuperes dynamiquement via les APIs


async def _fetch_anthropic_models(api_key: str) -> list[dict]:
    """Recupere la liste des modeles depuis l'API Anthropic /v1/models."""
    models = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            for m in data.get("data", []):
                mid = m.get("id", "")
                display = m.get("display_name") or mid
                caps = ["chat", "vision"]
                # Tous les modeles Claude 4+ supportent thinking
                if any(kw in mid for kw in ("opus", "sonnet", "haiku-4")):
                    caps.append("thinking")
                ctx = m.get("max_input_tokens") or 200000
                models.append({
                    "model_id": mid,
                    "display_name": display,
                    "capabilities": caps,
                    "context_window": ctx,
                })
    except Exception as exc:
        _log.warning("Erreur fetch modeles Anthropic: %s", exc)
    return models


async def _fetch_google_models(api_key: str) -> list[dict]:
    """Recupere la liste des modeles depuis l'API Google Generative AI."""
    models = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            )
            resp.raise_for_status()
            data = resp.json()
            for m in data.get("models", []):
                # L'ID est au format "models/gemini-2.5-pro" - on enleve le prefix
                mid = m.get("name", "").replace("models/", "")
                if not mid or "embedding" in mid:
                    continue
                display = m.get("displayName") or mid
                caps = ["chat", "vision"]
                if any(kw in mid for kw in ("pro", "ultra", "thinking")):
                    caps.append("thinking")
                ctx = m.get("inputTokenLimit") or 200000
                models.append({
                    "model_id": mid,
                    "display_name": display,
                    "capabilities": caps,
                    "context_window": ctx,
                })
    except Exception as exc:
        _log.warning("Erreur fetch modeles Google: %s", exc)
    return models


async def test_connection(
    provider_type: str,
    base_url: str | None,
    api_key: str | None,
) -> dict:
    """Teste la connexion a un fournisseur IA. Retourne {success, message, models_found}."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider_type == "ollama":
                url = (base_url or "http://ollama:11434").rstrip("/")
                resp = await client.get(f"{url}/api/tags")
                resp.raise_for_status()
                data = resp.json()
                count = len(data.get("models", []))
                return {"success": True, "message": f"Connecte - {count} modeles detectes", "models_found": count}

            elif provider_type in ("vllm", "openai", "mistral", "openai_compatible"):
                url = (base_url or "").rstrip("/")
                if provider_type == "openai":
                    url = "https://api.openai.com/v1"
                elif provider_type == "mistral":
                    url = "https://api.mistral.ai/v1"
                headers = {}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                resp = await client.get(f"{url}/models", headers=headers)
                resp.raise_for_status()
                data = resp.json()
                count = len(data.get("data", []))
                return {"success": True, "message": f"Connecte - {count} modeles detectes", "models_found": count}

            elif provider_type == "anthropic":
                if not api_key:
                    return {"success": False, "message": "Cle API requise", "models_found": 0}
                models = await _fetch_anthropic_models(api_key)
                if models:
                    return {"success": True, "message": f"Connecte - {len(models)} modeles detectes", "models_found": len(models)}
                return {"success": False, "message": "Impossible de recuperer les modeles - verifiez la cle API", "models_found": 0}

            elif provider_type == "google":
                if not api_key:
                    return {"success": False, "message": "Cle API requise", "models_found": 0}
                models = await _fetch_google_models(api_key)
                if models:
                    return {"success": True, "message": f"Connecte - {len(models)} modeles detectes", "models_found": len(models)}
                return {"success": False, "message": "Impossible de recuperer les modeles - verifiez la cle API", "models_found": 0}

            else:
                return {"success": False, "message": f"Type inconnu : {provider_type}", "models_found": 0}

    except httpx.ConnectError:
        return {"success": False, "message": "Connexion refusee - verifiez l'URL et le reseau", "models_found": 0}
    except httpx.TimeoutException:
        return {"success": False, "message": "Timeout - le fournisseur ne repond pas", "models_found": 0}
    except httpx.HTTPStatusError as exc:
        return {"success": False, "message": f"Erreur HTTP {exc.response.status_code}", "models_found": 0}
    except Exception as exc:
        _log.warning("Erreur test connexion provider %s: %s", provider_type, exc)
        return {"success": False, "message": str(exc)[:200], "models_found": 0}


async def sync_models(
    db: AsyncSession,
    provider_id: uuid.UUID,
    provider_type: str,
    base_url: str | None,
    api_key: str | None,
    litellm_url: str | None = None,
    litellm_key: str | None = None,
) -> int:
    """Recupere la liste des modeles depuis le fournisseur, met a jour ai_models,
    et les enregistre dans LiteLLM.

    Retourne le nombre de modeles synchronises.
    """
    models_data: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider_type == "ollama":
                url = (base_url or "http://ollama:11434").rstrip("/")
                resp = await client.get(f"{url}/api/tags")
                resp.raise_for_status()
                data = resp.json()
                for m in data.get("models", []):
                    name = m.get("name", "")
                    details = m.get("details", {})
                    families = details.get("families", [])
                    caps = ["chat"]
                    if "clip" in families or "llava" in name.lower():
                        caps.append("vision")
                    models_data.append({
                        "model_id": name,
                        "display_name": name,
                        "capabilities": caps,
                        "context_window": None,
                    })

            elif provider_type in ("vllm", "openai", "mistral", "openai_compatible"):
                url = (base_url or "").rstrip("/")
                if provider_type == "openai":
                    url = "https://api.openai.com/v1"
                elif provider_type == "mistral":
                    url = "https://api.mistral.ai/v1"
                headers = {}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                resp = await client.get(f"{url}/models", headers=headers)
                resp.raise_for_status()
                data = resp.json()
                for m in data.get("data", []):
                    mid = m.get("id", "")
                    caps = ["chat"]
                    mid_lower = mid.lower()
                    if any(kw in mid_lower for kw in ("vision", "4o", "llava", "gemini", "sonnet", "opus")):
                        caps.append("vision")
                    if any(kw in mid_lower for kw in ("o1", "o3", "thinking", "deepseek-r1", "qwq")):
                        caps.append("thinking")
                    models_data.append({
                        "model_id": mid,
                        "display_name": mid,
                        "capabilities": caps,
                        "context_window": None,
                    })

            elif provider_type == "anthropic":
                if not api_key:
                    raise HTTPException(400, "Cle API Anthropic requise pour synchroniser")
                models_data = await _fetch_anthropic_models(api_key)
                if not models_data:
                    raise HTTPException(502, "Impossible de recuperer les modeles Anthropic - verifiez la cle API")

            elif provider_type == "google":
                if not api_key:
                    raise HTTPException(400, "Cle API Google requise pour synchroniser")
                models_data = await _fetch_google_models(api_key)
                if not models_data:
                    raise HTTPException(502, "Impossible de recuperer les modeles Google - verifiez la cle API")

    except Exception as exc:
        _log.warning("Erreur sync modeles provider %s: %s", provider_id, exc)
        raise HTTPException(502, f"Impossible de recuperer les modeles : {exc}")

    # Upsert les modeles en base
    synced = 0
    for m in models_data:
        new_id = str(uuid.uuid4())
        caps_json = json.dumps(m.get("capabilities"))
        await db.execute(
            text("""
                INSERT INTO ai_models (id, provider_id, model_id, display_name, capabilities, context_window, is_active, created_at, updated_at)
                VALUES (:id, :pid, :mid, :dname, CAST(:caps AS jsonb), :ctx, true, now(), now())
                ON CONFLICT (provider_id, model_id)
                    DO UPDATE SET display_name = EXCLUDED.display_name,
                                  capabilities = EXCLUDED.capabilities,
                                  context_window = COALESCE(EXCLUDED.context_window, ai_models.context_window),
                                  updated_at = now()
            """),
            {
                "id": new_id,
                "pid": str(provider_id),
                "mid": m["model_id"],
                "dname": m["display_name"],
                "caps": caps_json,
                "ctx": m.get("context_window"),
            },
        )
        synced += 1

    # Supprimer les modeles Kerpta qui ne sont plus sur le provider
    provider_model_ids = {m["model_id"] for m in models_data}
    existing = await db.execute(
        text("SELECT id, model_id FROM ai_models WHERE provider_id = :pid"),
        {"pid": str(provider_id)},
    )
    for row in existing.fetchall():
        if row[1] not in provider_model_ids:
            # Supprimer de LiteLLM
            if litellm_url and litellm_key:
                ll_name = f"{provider_type}/{row[1]}"
                await remove_model_from_litellm(litellm_url, litellm_key, ll_name)
            # Supprimer de Kerpta
            await db.execute(
                text("DELETE FROM ai_models WHERE id = :id"),
                {"id": str(row[0])},
            )
            _log.info("Modele supprime (absent du provider) : %s", row[1])

    # Nettoyer LiteLLM : supprimer tous les modeles de ce provider puis re-enregistrer
    if litellm_url and litellm_key:
        await _purge_provider_models_from_litellm(
            litellm_url, litellm_key, provider_type,
        )
        for m in models_data:
            await register_model_in_litellm(
                litellm_url, litellm_key,
                provider_type, m["model_id"],
                api_key=api_key, base_url=base_url,
            )

    # Mettre a jour last_check
    await db.execute(
        text("UPDATE ai_providers SET last_check_at = now(), last_check_ok = true, updated_at = now() WHERE id = :id"),
        {"id": str(provider_id)},
    )
    await db.commit()
    return synced


def _litellm_provider(provider_type: str) -> str:
    """Convertit le type de provider Kerpta en prefixe LiteLLM."""
    mapping = {
        "openai_compatible": "openai",
        "openai": "openai",
        "ollama": "ollama",
        "vllm": "openai",       # vLLM expose une API OpenAI-compatible
        "anthropic": "anthropic",
        "google": "gemini",
        "mistral": "mistral",
    }
    return mapping.get(provider_type, "openai")


async def register_model_in_litellm(
    litellm_url: str,
    litellm_key: str,
    provider_type: str,
    model_id: str,
    api_key: str | None = None,
    base_url: str | None = None,
) -> bool:
    """Enregistre un modele dans LiteLLM via POST /model/new."""
    ll_provider = _litellm_provider(provider_type)
    litellm_model_name = f"{ll_provider}/{model_id}"
    # model_name = ce qu'on appelle cote Kerpta (provider_type/model_id)
    kerpta_model_name = f"{provider_type}/{model_id}"
    body: dict = {
        "model_name": kerpta_model_name,
        "litellm_params": {
            "model": litellm_model_name,
        },
    }
    # LiteLLM/OpenAI SDK exige toujours une api_key, meme si le provider n'en a pas
    body["litellm_params"]["api_key"] = api_key or "no-key-required"
    if base_url:
        body["litellm_params"]["api_base"] = base_url

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{litellm_url.rstrip('/')}/model/new",
                json=body,
                headers={"Authorization": f"Bearer {litellm_key}"},
            )
            if resp.status_code in (200, 201):
                return True
            _log.warning("LiteLLM /model/new %s: %s", resp.status_code, resp.text[:200])
            return False
    except Exception as exc:
        _log.warning("Erreur LiteLLM register model %s: %s", litellm_model_name, exc)
        return False


async def _purge_provider_models_from_litellm(
    litellm_url: str,
    litellm_key: str,
    provider_type: str,
) -> int:
    """Supprime TOUS les modeles d'un provider dans LiteLLM.

    Essaie plusieurs endpoints et formats d'ID car LiteLLM varie
    selon les versions.
    """
    ll_provider = _litellm_provider(provider_type)
    base = litellm_url.rstrip("/")
    headers = {"Authorization": f"Bearer {litellm_key}"}
    deleted = 0

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Essayer /model/info (sans /v1/) puis /v1/model/info
            all_models = []
            for endpoint in ["/model/info", "/v1/model/info"]:
                resp = await client.get(f"{base}{endpoint}", headers=headers)
                if resp.status_code == 200:
                    all_models = resp.json().get("data", [])
                    _log.info("LiteLLM %s : %d modeles trouves", endpoint, len(all_models))
                    break

            if not all_models:
                _log.warning("LiteLLM : aucun modele trouve pour purge")
                return 0

            # Filtrer les modeles de ce provider et collecter tous les IDs possibles
            to_delete = []
            for m in all_models:
                litellm_model = m.get("litellm_params", {}).get("model", "")
                model_name = m.get("model_name", "")

                # Matcher par le prefixe provider dans litellm_params.model ou model_name
                is_match = (
                    litellm_model.startswith(f"{ll_provider}/")
                    or model_name.startswith(f"{provider_type}/")
                    or model_name.startswith(f"{ll_provider}/")
                )
                if not is_match:
                    continue

                # Collecter tous les identifiants possibles pour la suppression
                ids_to_try = []
                model_info_id = m.get("model_info", {}).get("id")
                if model_info_id:
                    ids_to_try.append(model_info_id)
                if litellm_model:
                    ids_to_try.append(litellm_model)
                if model_name and model_name != litellm_model:
                    ids_to_try.append(model_name)

                to_delete.append({"display": litellm_model or model_name, "ids": ids_to_try})

            _log.info("LiteLLM purge %s : %d modeles a supprimer", provider_type, len(to_delete))

            # Supprimer chaque modele en essayant chaque ID
            for item in to_delete:
                success = False
                for try_id in item["ids"]:
                    del_resp = await client.post(
                        f"{base}/model/delete",
                        json={"id": try_id},
                        headers=headers,
                    )
                    if del_resp.status_code in (200, 201):
                        deleted += 1
                        success = True
                        _log.info("LiteLLM supprime : %s (id=%s)", item["display"], try_id)
                        break
                if not success:
                    _log.warning("LiteLLM echec suppression : %s (ids=%s)", item["display"], item["ids"])

    except Exception as exc:
        _log.warning("Erreur purge LiteLLM provider %s: %s", provider_type, exc)

    _log.info("LiteLLM purge terminee : %d/%d modeles supprimes pour %s", deleted, len(to_delete) if 'to_delete' in dir() else 0, provider_type)
    return deleted


async def remove_model_from_litellm(
    litellm_url: str,
    litellm_key: str,
    litellm_model_name: str,
) -> bool:
    """Supprime un modele de LiteLLM via POST /model/delete."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{litellm_url.rstrip('/')}/model/delete",
                json={"id": litellm_model_name},
                headers={"Authorization": f"Bearer {litellm_key}"},
            )
            return resp.status_code in (200, 201)
    except Exception as exc:
        _log.warning("Erreur LiteLLM delete model %s: %s", litellm_model_name, exc)
        return False
