from __future__ import annotations

import asyncio
import json
import sqlite3

from fastapi.testclient import TestClient

import text.api.deps as deps
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


def test_analysis_detail_returns_forensic_report_sections(monkeypatch, tmp_path) -> None:
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
        legacy_report = ForensicReport(
            request=request,
            summary="综合结论：当前证据仅支持在候选集中作有限判断。",
            conclusions=[
                ReportConclusion(
                    key="closed_set_id",
                    task=TaskType.CLOSED_SET_ID,
                    statement="在候选集中，alice 的风格距离最近。",
                    grade=ConclusionGrade.MODERATE_SUPPORT,
                    score=1.2,
                    score_type="log10_lr",
                    evidence_ids=["ev_0001"],
                )
            ],
            results=[
                ResultRecord(
                    key="deterministic_result",
                    title="候选集排名",
                    body="1. alice | log10(LR)=1.20",
                    evidence_ids=["ev_0001"],
                    interpretive_opinion=False,
                )
            ],
            limitations=["样本长度有限，结论应结合题材差异审慎解读。"],
            agent_reports=[
                AgentReport(
                    agent_name="computational",
                    discipline="computational_linguistics",
                    findings=[
                        AgentFinding(
                            discipline="computational_linguistics",
                            category="semantic_similarity",
                            description="文本对之间语义相似度显著偏高，建议重点复核。",
                            confidence=0.86,
                            evidence=["cosine_similarity=0.92", "pair_count=3"],
                        )
                    ],
                    summary="legacy",
                )
            ],
        )
        asyncio.run(
            store.update_status(
                analysis_id,
                AnalysisStatus.COMPLETED,
                report_json=legacy_report.model_dump_json(),
            )
        )

        response = client.get(f"/api/v1/analyses/{analysis_id}")
        assert response.status_code == 200
        body = response.json()
        report = body["report"]
        assert report is not None
        assert report["summary"] == "综合结论：当前证据仅支持在候选集中作有限判断。"
        assert report["conclusions"][0]["task"] == "closed_set_id"
        assert report["results"][0]["title"] == "候选集排名"
        assert report["limitations"]

        db_path = tmp_path / "analyses.db"
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                "SELECT report_json FROM analyses WHERE id = ?",
                (analysis_id,),
            ).fetchone()
        assert row is not None
        stored_report = json.loads(row[0])
        assert stored_report["summary"] == report["summary"]
        assert stored_report["conclusions"][0]["grade"] == "moderate_support"
