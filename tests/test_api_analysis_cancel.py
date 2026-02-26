from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app
from text.api.models import AnalysisStatus
from text.ingest.schema import AnalysisRequest, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


def _create_analysis(store, status: AnalysisStatus = AnalysisStatus.PENDING) -> str:
    request = _request_payload()
    analysis_id = asyncio.run(
        store.create(
            request_json=request.model_dump_json(),
            task_type=request.task.value,
            llm_backend=request.llm_backend,
            text_count=len(request.texts),
            author_count=1,
        )
    )
    if status != AnalysisStatus.PENDING:
        asyncio.run(
            store.update_status(
                analysis_id,
                status,
                error_message="existing terminal state" if status != AnalysisStatus.RUNNING else None,
            )
        )
    return analysis_id


def test_cancel_pending_analysis(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id = _create_analysis(deps._store, status=AnalysisStatus.PENDING)

        response = client.post(f"/api/v1/analyses/{analysis_id}/cancel")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == AnalysisStatus.CANCELED.value

        detail = asyncio.run(deps._store.get(analysis_id))
        assert detail is not None
        assert detail.status == AnalysisStatus.CANCELED
        assert detail.error_message == "Canceled by user"
        assert detail.completed_at is not None


def test_cancel_completed_analysis_returns_conflict(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id = _create_analysis(deps._store, status=AnalysisStatus.COMPLETED)

        response = client.post(f"/api/v1/analyses/{analysis_id}/cancel")
        assert response.status_code == 409
        assert "Cannot cancel analysis" in response.json()["detail"]


def test_cancel_already_canceled_analysis_is_idempotent(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id = _create_analysis(deps._store, status=AnalysisStatus.CANCELED)

        response = client.post(f"/api/v1/analyses/{analysis_id}/cancel")
        assert response.status_code == 200
        assert response.json()["status"] == AnalysisStatus.CANCELED.value
