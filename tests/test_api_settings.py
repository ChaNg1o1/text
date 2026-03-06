from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app


def test_get_settings_returns_default_document(monkeypatch, tmp_path: Path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path / "db"))
    settings_path = tmp_path / "config" / "settings.json"
    monkeypatch.setenv("TEXT_APP_SETTINGS_CONFIG", str(settings_path))

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/v1/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_defaults"] == {
        "default_llm_backend": None,
        "default_task": "full",
        "default_top_k": 3,
        "default_case_analyst": "",
        "default_case_client": "",
        "qa_temperature": 0.2,
        "qa_max_tokens": 1200,
    }
    assert body["prompt_overrides"] == {
        "stylometry": "",
        "writing_process": "",
        "computational": "",
        "sociolinguistics": "",
        "synthesis": "",
        "qa": "",
    }
    assert not settings_path.exists()


def test_put_settings_persists_to_configured_path(monkeypatch, tmp_path: Path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path / "db"))
    settings_path = tmp_path / "custom" / "app-settings.json"
    monkeypatch.setenv("TEXT_APP_SETTINGS_CONFIG", str(settings_path))

    payload = {
        "analysis_defaults": {
            "default_llm_backend": "gpt-forensics",
            "default_task": "closed_set_id",
            "default_top_k": 5,
            "default_case_analyst": "Examiner Zhang",
            "default_case_client": "ACME Legal",
            "qa_temperature": 0.1,
            "qa_max_tokens": 2048,
        },
        "prompt_overrides": {
            "stylometry": "Use formal evidentiary phrasing.",
            "writing_process": "Flag machine-polishing indicators when present.",
            "computational": "Never overstate scores beyond deterministic grades.",
            "sociolinguistics": "Focus on observable register and code-switching.",
            "synthesis": "Write concise Chinese conclusions with limits.",
            "qa": "Always cite evidence IDs when available.",
        },
    }

    app = create_app()
    with TestClient(app) as client:
        response = client.put("/api/v1/settings", json=payload)
        assert response.status_code == 200
        assert response.json() == payload

        roundtrip = client.get("/api/v1/settings")
        assert roundtrip.status_code == 200
        assert roundtrip.json() == payload

    assert settings_path.exists()
    stored = json.loads(settings_path.read_text(encoding="utf-8"))
    assert stored == payload
