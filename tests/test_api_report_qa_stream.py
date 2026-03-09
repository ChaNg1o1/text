from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.decision.engine import DecisionEngine
from text.api.app import create_app
from text.api.models import AnalysisStatus
from text.ingest.schema import (
    AgentFinding,
    AgentReport,
    AnalysisRequest,
    ConclusionGrade,
    ReportConclusion,
    ResultRecord,
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


def _create_analysis(
    store, status: AnalysisStatus, with_report: bool = False
) -> tuple[str, AnalysisRequest]:
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
            summary="综合结论：文本风格存在高度一致性。",
            conclusions=[
                ReportConclusion(
                    key="verification",
                    task=TaskType.VERIFICATION,
                    statement="当前证据支持目标文本与已知作者 alice 的写作指纹一致。",
                    grade=ConclusionGrade.MODERATE_SUPPORT,
                    score=1.1,
                    score_type="log10_lr",
                    evidence_ids=["ev_0001"],
                )
            ],
            results=[
                ResultRecord(
                    key="deterministic_result",
                    title="Verification 确定性结果",
                    body="log10(LR)=1.10",
                    evidence_ids=["ev_0001"],
                    interpretive_opinion=False,
                )
            ],
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
            limitations=["建议复核账户之间的行为链路。"],
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


def _parse_ui_message_chunks(raw: str) -> tuple[list[dict[str, object]], bool]:
    blocks = [block.strip() for block in raw.split("\n\n") if block.strip()]
    chunks: list[dict[str, object]] = []
    saw_done = False
    for block in blocks:
        if not block.startswith("data: "):
            continue
        payload = block.removeprefix("data: ").strip()
        if payload == "[DONE]":
            saw_done = True
            continue
        chunks.append(json.loads(payload))
    return chunks, saw_done


def test_given_unknown_analysis_when_requesting_qa_stream_then_returns_404(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/v1/analyses/not-found/qa/stream", params={"question": "hello"})
        assert response.status_code == 404
        assert response.json()["detail"] == "Analysis not found"


def test_given_non_completed_analysis_when_requesting_qa_stream_then_returns_409(
    monkeypatch, tmp_path
) -> None:
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

        async def complete(
            self, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
        ) -> str:
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


def test_given_completed_analysis_when_requesting_ai_sdk_chat_then_returns_ui_message_stream(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    class _FakeLLMBackend:
        def __init__(self, backend: str, config_path=None) -> None:
            self.backend = backend
            self.config_path = config_path

        async def complete(
            self, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
        ) -> str:
            assert "Question:" in user_prompt
            return "这是 AI SDK chat 回答。"

    import text.api.routers.qa as qa_router

    monkeypatch.setattr(qa_router, "LLMBackend", _FakeLLMBackend)

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id, _ = _create_analysis(deps._store, AnalysisStatus.COMPLETED, with_report=True)

        response = client.post(
            f"/api/v1/analyses/{analysis_id}/qa/chat",
            json={
                "id": "chat-1",
                "messages": [
                    {
                        "id": "user-1",
                        "role": "user",
                        "parts": [{"type": "text", "text": "这份报告最关键的证据是什么？"}],
                    }
                ],
                "trigger": "submit-message",
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"

        chunks, saw_done = _parse_ui_message_chunks(response.text)
        assert saw_done is True
        assert chunks[0]["type"] == "start"
        assert any(chunk["type"] == "data-reportSnapshot" for chunk in chunks)
        assert any(chunk["type"] == "data-reportFocus" for chunk in chunks)
        assert any(chunk["type"] == "text-start" for chunk in chunks)
        assert any(
            chunk["type"] == "text-delta" and chunk["delta"] == "这是 AI SDK chat 回答。"
            for chunk in chunks
        )
        assert chunks[-1] == {"type": "finish", "finishReason": "stop"}


def test_given_completed_analysis_when_requesting_ai_sdk_chat_with_tool_then_returns_tool_chunks(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    class _FakeLLMBackend:
        def __init__(self, backend: str, config_path=None) -> None:
            self.backend = backend
            self.config_path = config_path

        async def complete_with_tools(
            self,
            system_prompt: str,
            user_prompt: str,
            tools: list[dict[str, object]],
            temperature: float,
            max_tokens: int,
        ) -> SimpleNamespace:
            assert "Question:" in user_prompt
            assert any(tool["function"]["name"] == "displayRadar" for tool in tools)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content="用雷达图展示写作画像维度。",
                            tool_calls=[
                                SimpleNamespace(
                                    id="functions.displayRadar:0",
                                    function=SimpleNamespace(
                                        name="displayRadar",
                                        arguments=json.dumps(
                                            {
                                                "title": "Unknown写作画像",
                                                "dimensions": ["词汇丰富度", "句式多样性"],
                                                "series": [
                                                    {
                                                        "name": "Unknown写作画像",
                                                        "values": [0.72, 0.75],
                                                    }
                                                ],
                                            },
                                            ensure_ascii=False,
                                        ),
                                    ),
                                )
                            ],
                        )
                    )
                ]
            )

        async def complete(
            self, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
        ) -> str:
            raise AssertionError("JSON fallback should not be used when tool calls succeed")

    import text.api.routers.qa as qa_router

    monkeypatch.setattr(qa_router, "LLMBackend", _FakeLLMBackend)

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id, _ = _create_analysis(deps._store, AnalysisStatus.COMPLETED, with_report=True)

        response = client.post(
            f"/api/v1/analyses/{analysis_id}/qa/chat",
            json={
                "id": "chat-1",
                "messages": [
                    {
                        "id": "user-1",
                        "role": "user",
                        "parts": [{"type": "text", "text": "用雷达图展示写作画像维度"}],
                    }
                ],
                "trigger": "submit-message",
            },
        )
        assert response.status_code == 200

        chunks, saw_done = _parse_ui_message_chunks(response.text)
        assert saw_done is True
        assert any(
            chunk
            == {
                "type": "tool-input-start",
                "toolCallId": "functions.displayRadar:0",
                "toolName": "displayRadar",
            }
            for chunk in chunks
        )
        assert any(
            chunk["type"] == "tool-input-available"
            and chunk["toolName"] == "displayRadar"
            and chunk["input"]["title"] == "Unknown写作画像"
            for chunk in chunks
        )
        assert any(
            chunk["type"] == "tool-output-available"
            and chunk["output"]["dimensions"] == ["词汇丰富度", "句式多样性"]
            for chunk in chunks
        )
        assert any(
            chunk["type"] == "text-delta" and chunk["delta"] == "用雷达图展示写作画像维度。"
            for chunk in chunks
        )
        assert chunks[-1] == {"type": "finish", "finishReason": "stop"}


def test_given_completed_analysis_when_requesting_qa_suggestions_then_returns_llm_generated_items(
    monkeypatch, tmp_path
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    class _FakeLLMBackend:
        def __init__(self, backend: str, config_path=None) -> None:
            self.backend = backend
            self.config_path = config_path

        async def complete(
            self, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
        ) -> str:
            assert "suggestions" in system_prompt
            assert "Need exactly 3 short questions." in user_prompt
            return json.dumps(
                {
                    "suggestions": [
                        "先用最简单的话告诉我，这次结论到底说明了什么？",
                        "如果只看最关键依据，应该先看哪几条？",
                        "这份结果最可能在哪些地方出错？",
                    ]
                },
                ensure_ascii=False,
            )

    import text.api.routers.qa as qa_router

    monkeypatch.setattr(qa_router, "LLMBackend", _FakeLLMBackend)

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        analysis_id, _ = _create_analysis(deps._store, AnalysisStatus.COMPLETED, with_report=True)

        response = client.post(
            f"/api/v1/analyses/{analysis_id}/qa/suggestions",
            json={"count": 3, "exclude": ["不要重复这句"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["suggestions"] == [
            "先用最简单的话告诉我，这次结论到底说明了什么？",
            "如果只看最关键依据，应该先看哪几条？",
            "这份结果最可能在哪些地方出错？",
        ]


def test_build_report_context_includes_narrative_sections() -> None:
    import text.api.routers.qa as qa_router

    report = ForensicReport(request=_request_payload(), summary="综合结论")
    DecisionEngine().ensure_story_surfaces(report, refresh_hash=True)
    context = qa_router._build_report_context(report)

    assert "# Narrative" in context
    assert "action_items" in context
