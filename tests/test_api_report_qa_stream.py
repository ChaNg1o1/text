from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app
from text.api.models import AnalysisStatus
from text.ingest.schema import (
    AgentFinding,
    AgentReport,
    AnalysisRequest,
    ForensicReport,
    TaskType,
    TextEntry,
)


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


def _create_analysis(store, status: AnalysisStatus, with_report: bool = False) -> tuple[str, AnalysisRequest]:
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

    report_json: str | None = None
    if with_report:
        report = ForensicReport(
            request=request,
            synthesis="综合结论：文本风格存在高度一致性。",
            agent_reports=[
                AgentReport(
                    agent_name="computational",
                    discipline="computational_linguistics",
                    summary="特征空间中聚类高度紧密。",
                    findings=[
                        AgentFinding(
                            discipline="computational_linguistics",
                            category="semantic_similarity",
                            description="语义相似度显著偏高。",
                            confidence=0.82,
                            evidence=["cosine_similarity=0.91", "pair_count=3"],
                        )
                    ],
                )
            ],
            recommendations=["建议复核账户之间的行为链路。"],
        )
        report_json = report.model_dump_json()

    asyncio.run(
        store.update_status(
            analysis_id,
            status,
            report_json=report_json,
        )
    )

    return analysis_id, request


def _parse_events(raw: str) -> list[tuple[str, dict[str, object]]]:
    blocks = [block.strip() for block in raw.split("\n\n") if block.strip()]
    events: list[tuple[str, dict[str, object]]] = []
    for block in blocks:
        event_line = next((line for line in block.splitlines() if line.startswith("event: ")), None)
        data_line = next((line for line in block.splitlines() if line.startswith("data: ")), None)
        if not event_line or not data_line:
            continue
        event_name = event_line.removeprefix("event: ").strip()
        payload = json.loads(data_line.removeprefix("data: ").strip())
        events.append((event_name, payload))
    return events


def test_given_unknown_analysis_when_requesting_qa_stream_then_returns_404(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/v1/analyses/not-found/qa/stream", params={"question": "hello"})
        assert response.status_code == 404
        assert response.json()["detail"] == "Analysis not found"


def test_given_non_completed_analysis_when_requesting_qa_stream_then_returns_409(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id, _ = _create_analysis(deps._store, AnalysisStatus.RUNNING, with_report=False)

        response = client.get(
            f"/api/v1/analyses/{analysis_id}/qa/stream",
            params={"question": "请总结"},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "Analysis report is not available for QA"


def test_given_completed_analysis_when_requesting_qa_stream_then_returns_stream_events(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    class _FakeLLMBackend:
        def __init__(self, backend: str, config_path=None) -> None:
            self.backend = backend
            self.config_path = config_path

        async def complete(self, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
            assert "Question:" in user_prompt
            return "这是流式回答示例。"

    import text.api.routers.qa as qa_router

    monkeypatch.setattr(qa_router, "LLMBackend", _FakeLLMBackend)

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id, _ = _create_analysis(deps._store, AnalysisStatus.COMPLETED, with_report=True)

        response = client.get(
            f"/api/v1/analyses/{analysis_id}/qa/stream",
            params={"question": "这份报告最关键证据是什么？"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        events = _parse_events(response.text)
        names = [name for name, _ in events]
        assert "qa_started" in names
        assert "qa_chunk" in names
        assert "qa_completed" in names

        completed_payload = next(payload for name, payload in events if name == "qa_completed")
        assert completed_payload["analysis_id"] == analysis_id
        assert completed_payload["answer"] == "这是流式回答示例。"
