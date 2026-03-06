from __future__ import annotations

import asyncio
import json

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


def _create_analysis_with_status(store, status: AnalysisStatus) -> str:
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
    asyncio.run(
        store.update_status(
            analysis_id,
            status,
            error_message="boom" if status == AnalysisStatus.FAILED else None,
        )
    )
    return analysis_id


def _parse_sse_data(response_text: str) -> tuple[str, dict[str, object]]:
    event_line = next(line for line in response_text.splitlines() if line.startswith("event: "))
    data_line = next(line for line in response_text.splitlines() if line.startswith("data: "))
    event_name = event_line.removeprefix("event: ").strip()
    payload = json.loads(data_line.removeprefix("data: ").strip())
    return event_name, payload


def test_given_unknown_analysis_when_requesting_progress_then_returns_404(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/v1/analyses/not-found/progress")
        assert response.status_code == 404
        assert response.json()["detail"] == "Analysis not found"


def test_given_completed_analysis_when_requesting_progress_then_stream_returns_terminal_event(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id = _create_analysis_with_status(deps._store, AnalysisStatus.COMPLETED)

        response = client.get(f"/api/v1/analyses/{analysis_id}/progress")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        event_name, payload = _parse_sse_data(response.text)
        assert event_name == "analysis_completed"
        assert payload["analysis_id"] == analysis_id
        assert payload["status"] == AnalysisStatus.COMPLETED.value


def test_given_failed_analysis_when_requesting_progress_then_stream_returns_failure_event(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id = _create_analysis_with_status(deps._store, AnalysisStatus.FAILED)

        response = client.get(f"/api/v1/analyses/{analysis_id}/progress")
        assert response.status_code == 200

        event_name, payload = _parse_sse_data(response.text)
        assert event_name == "analysis_failed"
        assert payload["analysis_id"] == analysis_id
        assert payload["status"] == AnalysisStatus.FAILED.value
        assert payload["error"] == "boom"


def test_given_running_analysis_with_persisted_events_when_requesting_snapshot_then_returns_history(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id = _create_analysis_with_status(deps._store, AnalysisStatus.RUNNING)
        asyncio.run(
            deps._store.append_progress_event(
                analysis_id,
                event="analysis_started",
                data_json=json.dumps(
                    {
                        "analysis_id": analysis_id,
                        "timestamp": 123.0,
                    }
                ),
                created_at=123.0,
            )
        )
        asyncio.run(
            deps._store.append_progress_event(
                analysis_id,
                event="log",
                data_json=json.dumps(
                    {
                        "message": "worker booted",
                        "source": "analysis_runner",
                        "timestamp": 124.0,
                    }
                ),
                created_at=124.0,
            )
        )

        response = client.get(f"/api/v1/analyses/{analysis_id}/progress/snapshot")
        assert response.status_code == 200

        payload = response.json()
        assert payload["analysis_id"] == analysis_id
        assert payload["events"] == [
            {
                "event": "analysis_started",
                "data": {
                    "analysis_id": analysis_id,
                    "timestamp": 123.0,
                },
            },
            {
                "event": "log",
                "data": {
                    "message": "worker booted",
                    "source": "analysis_runner",
                    "timestamp": 124.0,
                },
            },
        ]
