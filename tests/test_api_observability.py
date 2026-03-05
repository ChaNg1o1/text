from __future__ import annotations

import re

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app


def test_health_request_id_roundtrip_and_observability_snapshot(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        request_id = "req-obsv-123"
        health = client.get("/api/v1/health", headers={"X-Request-ID": request_id})
        assert health.status_code == 200
        assert health.headers["x-request-id"] == request_id

        snapshot = client.get("/api/v1/observability?top_routes=20&recent=50")
        assert snapshot.status_code == 200
        body = snapshot.json()

        assert body["enabled"] is True
        routes = [
            item
            for item in body["routes"]
            if item["method"] == "GET" and item["route"] == "/api/v1/health"
        ]
        assert routes
        assert routes[0]["count"] >= 1

        health_events = [item for item in body["recent_requests"] if item["path"] == "/api/v1/health"]
        assert any(item["request_id"] == request_id for item in health_events)


def test_invalid_request_id_header_is_replaced(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/v1/health", headers={"X-Request-ID": "bad id with spaces"})
        assert response.status_code == 200

        normalized = response.headers["x-request-id"]
        assert normalized != "bad id with spaces"
        assert re.fullmatch(r"[A-Za-z0-9._-]{1,128}", normalized)
