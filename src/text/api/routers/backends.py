"""LLM backend listing and management endpoints."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Mapping
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Response, status

import text.api.deps as deps
from text.api.config import Settings
from text.api.models import (
    BackendInfo,
    ProviderKeyStatus,
    ProviderKeyStatusResponse,
    BackendsResponse,
    BackendTestResponse,
    CustomBackendInfo,
    CustomBackendsResponse,
    UpdateProviderKeyRequest,
    UpsertCustomBackendRequest,
)
from text.api.services.backends_config_store import BackendsConfigStore
from text.llm.backend import LLMBackend, load_backends_config

router = APIRouter(prefix="/api/v1", tags=["backends"])

_BACKEND_NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_TEST_TIMEOUT_SECONDS = 20.0
_OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
_OLLAMA_PROBE_TIMEOUT_SECONDS = 0.8
_BUILTIN_PROVIDERS: tuple[str, ...] = ("openai", "anthropic")
_BUILTIN_ALIAS_NAMES: set[str] = {"gpt4", "gpt4-mini"}


def _get_config_path(settings: Settings) -> Path:
    return settings.backends_config


def _normalize_backend_name(name: str) -> str:
    normalized = name.strip()
    if not _BACKEND_NAME_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Backend name must match [A-Za-z0-9._-], 1-64 chars "
                "(example: deepseek-v3)."
            ),
        )
    return normalized


def _strip_ollama_tag(model_name: str) -> str:
    return model_name.split(":", 1)[0]


def _is_ollama_model_available(model_id: str) -> bool:
    """Check whether local Ollama service is reachable and model exists."""
    model_name = model_id.split("/", 1)[-1]
    request = Request(_OLLAMA_TAGS_URL, headers={"Accept": "application/json"})

    try:
        with urlopen(request, timeout=_OLLAMA_PROBE_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return False
            payload = response.read().decode("utf-8")
    except (OSError, TimeoutError, URLError, ValueError):
        return False

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return False

    models = data.get("models")
    if not isinstance(models, list):
        return False

    target_base = _strip_ollama_tag(model_name)
    for item in models:
        if not isinstance(item, Mapping):
            continue
        candidate = item.get("name")
        if not isinstance(candidate, str):
            continue
        if candidate == model_name or _strip_ollama_tag(candidate) == target_base:
            return True
    return False


def _resolve_custom_backend_info(
    name: str,
    raw: Mapping[str, Any],
    parsed: Mapping[str, Any],
) -> CustomBackendInfo:
    parsed_backend = parsed.get(name)
    has_api_key = False
    if hasattr(parsed_backend, "resolve_api_key"):
        try:
            has_api_key = bool(parsed_backend.resolve_api_key())
        except Exception:
            has_api_key = False
    elif isinstance(raw.get("api_key"), str) and raw.get("api_key"):
        has_api_key = True

    api_key_env = raw.get("api_key_env")
    if not isinstance(api_key_env, str) or not api_key_env.strip():
        api_key_env = None

    provider = str(raw.get("provider", "")).strip()
    model = str(raw.get("model", "")).strip()
    api_base = str(raw.get("api_base", "")).strip()

    return CustomBackendInfo(
        name=name,
        provider=provider,
        model=model,
        api_base=api_base,
        api_key_env=api_key_env,
        has_api_key=has_api_key,
    )


def _provider_key_status(provider: str, stored_keys: Mapping[str, str]) -> ProviderKeyStatus:
    env_var = LLMBackend._ENV_KEY_MAP[provider]
    if os.environ.get(env_var):
        return ProviderKeyStatus(provider=provider, env_var=env_var, has_api_key=True, source="env")
    if stored_keys.get(provider):
        return ProviderKeyStatus(
            provider=provider,
            env_var=env_var,
            has_api_key=True,
            source="stored",
        )
    return ProviderKeyStatus(provider=provider, env_var=env_var, has_api_key=False, source="none")


@router.get("/backends", response_model=BackendsResponse)
async def list_backends(settings: Settings = Depends(deps.get_settings)) -> BackendsResponse:
    """Return all available LLM backends (built-in + custom)."""
    backends: list[BackendInfo] = []
    config_path = _get_config_path(settings)

    for name, model_id in sorted(LLMBackend.MODEL_MAP.items()):
        if name in _BUILTIN_ALIAS_NAMES:
            continue
        is_available = True
        if model_id.startswith("ollama/"):
            is_available = _is_ollama_model_available(model_id)
        else:
            try:
                _ = LLMBackend(backend=name, config_path=config_path)
            except Exception:
                is_available = False
        backends.append(BackendInfo(name=name, model=model_id, has_api_key=is_available))

    custom = load_backends_config(config_path)
    for cname, cb in sorted(custom.items()):
        backends.append(
            BackendInfo(
                name=cname,
                model=cb.model,
                provider=cb.provider,
                has_api_key=cb.resolve_api_key() is not None,
            )
        )

    return BackendsResponse(backends=backends)


@router.get("/backends/custom", response_model=CustomBackendsResponse)
async def list_custom_backends(
    settings: Settings = Depends(deps.get_settings),
) -> CustomBackendsResponse:
    """Return custom backend definitions from managed `backends.json`."""
    config_path = _get_config_path(settings)
    store = BackendsConfigStore(config_path)
    raw_backends = store.list_raw_backends()
    parsed_backends = load_backends_config(config_path)

    items = [
        _resolve_custom_backend_info(name, raw_backends[name], parsed_backends)
        for name in sorted(raw_backends)
    ]
    return CustomBackendsResponse(backends=items)


@router.get("/backends/provider-keys", response_model=ProviderKeyStatusResponse)
async def list_provider_keys(
    settings: Settings = Depends(deps.get_settings),
) -> ProviderKeyStatusResponse:
    """List built-in provider key status (without exposing secrets)."""
    config_path = _get_config_path(settings)
    store = BackendsConfigStore(config_path)
    stored_keys = store.list_provider_keys()
    statuses = [_provider_key_status(provider, stored_keys) for provider in _BUILTIN_PROVIDERS]
    return ProviderKeyStatusResponse(providers=statuses)


@router.put("/backends/provider-keys/{provider}", response_model=ProviderKeyStatus)
async def update_provider_key(
    provider: str,
    body: UpdateProviderKeyRequest,
    settings: Settings = Depends(deps.get_settings),
) -> ProviderKeyStatus:
    """Set or clear API key for built-in provider."""
    normalized_provider = provider.strip().lower()
    if normalized_provider not in _BUILTIN_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unsupported provider '{provider}'.",
        )

    config_path = _get_config_path(settings)
    store = BackendsConfigStore(config_path)

    if body.clear:
        store.set_provider_key(normalized_provider, None)
    else:
        if body.api_key is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="api_key is required unless clear=true.",
            )
        store.set_provider_key(normalized_provider, body.api_key)

    stored_keys = store.list_provider_keys()
    return _provider_key_status(normalized_provider, stored_keys)


@router.put("/backends/custom/{backend_name}", response_model=CustomBackendInfo)
async def upsert_custom_backend(
    backend_name: str,
    body: UpsertCustomBackendRequest,
    settings: Settings = Depends(deps.get_settings),
) -> CustomBackendInfo:
    """Create or update a custom backend definition."""
    normalized_name = _normalize_backend_name(backend_name)
    if normalized_name in LLMBackend.MODEL_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{normalized_name}' is reserved for a built-in backend.",
        )

    config_path = _get_config_path(settings)
    store = BackendsConfigStore(config_path)
    update_payload: dict[str, object] = {
        "provider": body.provider,
        "model": body.model,
        "api_base": body.api_base,
    }

    if "api_key_env" in body.model_fields_set:
        update_payload["api_key_env"] = body.api_key_env

    if body.clear_api_key:
        update_payload["api_key"] = None
    elif "api_key" in body.model_fields_set:
        update_payload["api_key"] = body.api_key

    store.upsert_backend(normalized_name, update_payload)

    raw_backends = store.list_raw_backends()
    parsed_backends = load_backends_config(config_path)
    raw_backend = raw_backends.get(normalized_name)
    if raw_backend is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read saved backend configuration.",
        )

    return _resolve_custom_backend_info(normalized_name, raw_backend, parsed_backends)


@router.delete("/backends/custom/{backend_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_backend(
    backend_name: str,
    settings: Settings = Depends(deps.get_settings),
) -> Response:
    """Delete a custom backend definition."""
    normalized_name = _normalize_backend_name(backend_name)
    if normalized_name in LLMBackend.MODEL_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{normalized_name}' is a built-in backend and cannot be deleted.",
        )

    config_path = _get_config_path(settings)
    store = BackendsConfigStore(config_path)
    deleted = store.delete_backend(normalized_name)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Custom backend '{normalized_name}' was not found.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/backends/{backend_name}/test", response_model=BackendTestResponse)
async def test_backend_connectivity(
    backend_name: str,
    settings: Settings = Depends(deps.get_settings),
) -> BackendTestResponse:
    """Run a lightweight completion request to validate backend connectivity."""
    normalized_name = _normalize_backend_name(backend_name)
    config_path = _get_config_path(settings)
    started = time.perf_counter()

    try:
        backend = LLMBackend(backend=normalized_name, config_path=config_path)
    except Exception as exc:
        return BackendTestResponse(
            backend=normalized_name,
            success=False,
            detail=str(exc),
            latency_ms=0,
        )

    try:
        await asyncio.wait_for(
            backend.complete(
                system_prompt="You are a health check endpoint. Reply with OK.",
                user_prompt="Connectivity test",
                temperature=0,
                max_tokens=8,
            ),
            timeout=_TEST_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return BackendTestResponse(
            backend=normalized_name,
            success=False,
            detail=str(exc),
            latency_ms=elapsed_ms,
        )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return BackendTestResponse(
        backend=normalized_name,
        success=True,
        detail="Connection successful.",
        latency_ms=elapsed_ms,
    )
