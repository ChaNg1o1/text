from __future__ import annotations

import json
from pathlib import Path

import pytest

from text.llm.backend import LLMBackend


def _write_config(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "backends": {
                    "demo": {
                        "provider": "openai_compatible",
                        "model": "demo-model",
                        "api_base": "https://api.example.com/v1",
                        "api_key": "demo-key",
                    }
                }
            }
        ),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_llm_backend_retries_api_connection_error(monkeypatch, tmp_path) -> None:
    config_path = tmp_path / "backends.json"
    _write_config(config_path)

    import text.llm.backend as backend_mod

    class _APIConnectionError(Exception):
        pass

    class _Message:
        content = "OK"

    class _Choice:
        message = _Message()

    class _Response:
        choices = [_Choice()]
        usage = None

    attempts = {"count": 0}

    async def _fake_sleep(_: float) -> None:
        return None

    async def _fake_completion(**_: object) -> _Response:
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise _APIConnectionError("connection reset by peer")
        return _Response()

    monkeypatch.setattr(backend_mod.litellm, "APIConnectionError", _APIConnectionError)
    monkeypatch.setattr(backend_mod.litellm, "acompletion", _fake_completion)
    monkeypatch.setattr(backend_mod.asyncio, "sleep", _fake_sleep)

    backend = LLMBackend(backend="demo", config_path=config_path)
    result = await backend.complete("system", "user")

    assert result == "OK"
    assert attempts["count"] == 3


@pytest.mark.asyncio
async def test_llm_backend_retry_error_includes_original_reason(monkeypatch, tmp_path) -> None:
    config_path = tmp_path / "backends.json"
    _write_config(config_path)

    import text.llm.backend as backend_mod

    class _APIConnectionError(Exception):
        pass

    async def _fake_sleep(_: float) -> None:
        return None

    async def _fake_completion(**_: object) -> object:
        raise _APIConnectionError("network unreachable")

    monkeypatch.setattr(backend_mod.litellm, "APIConnectionError", _APIConnectionError)
    monkeypatch.setattr(backend_mod.litellm, "acompletion", _fake_completion)
    monkeypatch.setattr(backend_mod.asyncio, "sleep", _fake_sleep)

    backend = LLMBackend(backend="demo", config_path=config_path)
    with pytest.raises(RuntimeError, match="network unreachable"):
        await backend.complete("system", "user")
