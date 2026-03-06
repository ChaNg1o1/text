"""LLM backend listing and management endpoints."""

from __future__ import annotations

import asyncio
import re
import time
from pathlib import Path
from typing import Any, Mapping

from fastapi import APIRouter, Depends, HTTPException, Response, status

import text.api.deps as deps
from text.api.config import Settings
from text.api.models import (
    BackendTestResponse,
    BackendInfo,
    BackendsResponse,
    CustomBackendInfo,
    CustomBackendsResponse,
    UpsertCustomBackendRequest,
)
from text.api.services.backends_config_store import BackendsConfigStore
from text.llm.backend import LLMBackend, load_backends_config

router = APIRouter(prefix="/api/v1", tags=["backends"])

_BACKEND_NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_TEST_TIMEOUT_SECONDS = 20.0


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


@router.get("/backends", response_model=BackendsResponse)
async def list_backends(settings: Settings = Depends(deps.get_settings)) -> BackendsResponse:
    """Return all available custom LLM backends."""
    config_path = _get_config_path(settings)
    store = BackendsConfigStore(config_path)
    raw_backends = store.list_raw_backends()
    parsed_backends = load_backends_config(config_path)

    backends = [
        BackendInfo(
            name=item.name,
            model=item.model,
            provider=item.provider,
            has_api_key=item.has_api_key,
        )
        for item in (
            _resolve_custom_backend_info(name, raw_backends[name], parsed_backends)
            for name in sorted(raw_backends)
        )
    ]
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


@router.put("/backends/custom/{backend_name}", response_model=CustomBackendInfo)
async def upsert_custom_backend(
    backend_name: str,
    body: UpsertCustomBackendRequest,
    settings: Settings = Depends(deps.get_settings),
) -> CustomBackendInfo:
    """Create or update a custom backend definition."""
    normalized_name = _normalize_backend_name(backend_name)

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

    # Support inheriting API key configuration from an existing backend entry,
    # so batch-created model variants can reuse the provider credentials.
    if (
        not body.clear_api_key
        and body.inherit_api_key_from
        and "api_key" not in body.model_fields_set
        and "api_key_env" not in body.model_fields_set
    ):
        source_raw = store.list_raw_backends().get(body.inherit_api_key_from)
        if isinstance(source_raw, Mapping):
            inherited_api_key = source_raw.get("api_key")
            inherited_api_key_env = source_raw.get("api_key_env")
            if isinstance(inherited_api_key, str) and inherited_api_key.strip():
                update_payload["api_key"] = inherited_api_key
            elif isinstance(inherited_api_key_env, str) and inherited_api_key_env.strip():
                update_payload["api_key_env"] = inherited_api_key_env

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
