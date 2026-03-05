from __future__ import annotations

import pytest
from pydantic import ValidationError

from text.api.models import UpsertCustomBackendRequest


def test_upsert_custom_backend_normalizes_api_base_paths() -> None:
    payload = UpsertCustomBackendRequest(
        provider="openai_compatible",
        model="deepseek-chat",
        api_base=" https://api.example.com/v1/chat/completions/ ",
    )

    assert payload.api_base == "https://api.example.com/v1"


def test_upsert_custom_backend_keeps_query_string() -> None:
    payload = UpsertCustomBackendRequest(
        provider="openai_compatible",
        model="demo-model",
        api_base="https://api.example.com/v1/?api-version=2025-01-01",
    )

    assert payload.api_base == "https://api.example.com/v1?api-version=2025-01-01"


def test_upsert_custom_backend_rejects_missing_host() -> None:
    with pytest.raises(ValidationError):
        UpsertCustomBackendRequest(
            provider="openai_compatible",
            model="demo-model",
            api_base="https://",
        )
