from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app
from text.api.models import AnalysisStatus
from text.ingest.schema import AnalysisRequest, ForensicReport, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


def test_analysis_detail_excludes_features_and_includes_perf(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        store = deps._store
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
        report = ForensicReport(request=request)
        asyncio.run(
            store.update_status(
                analysis_id,
                AnalysisStatus.COMPLETED,
                report_json=report.model_dump_json(),
                perf_json=json.dumps({"total_ms": 123.4, "feature_extraction_ms": 45.6}),
            )
        )

        response = client.get(f"/api/v1/analyses/{analysis_id}")
        assert response.status_code == 200
        body = response.json()
        assert "features" not in body
        assert body["perf"]["total_ms"] == 123.4
