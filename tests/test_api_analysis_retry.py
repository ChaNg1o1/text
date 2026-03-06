from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app
from text.ingest.schema import (
    ActivityEvent,
    AnalysisRequest,
    ArtifactKind,
    ArtifactRecord,
    CaseMetadata,
    InteractionEdge,
    TaskParams,
    TaskType,
    TextEntry,
)


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[
            TextEntry(
                id="q1",
                author="alice",
                content="This is a questioned text sample for forensic retry tests.",
                metadata={"genre": "email"},
            ),
            TextEntry(
                id="r1",
                author="bob",
                content="This is a candidate author sample used to preserve request cloning.",
            ),
        ],
        task=TaskType.OPEN_SET_ID,
        task_params=TaskParams(
            questioned_text_ids=["q1"],
            candidate_author_ids=["alice", "bob", "charlie"],
            top_k=2,
        ),
        llm_backend="baseline-backend",
        case_metadata=CaseMetadata(
            case_id="CASE-001",
            client="Initial Client",
            analyst="Analyst A",
            notes="Original case notes",
        ),
        artifacts=[
            ArtifactRecord(
                artifact_id="art-1",
                kind=ArtifactKind.MANUAL_ENTRY,
                sha256="a" * 64,
                byte_count=128,
                source_name="bundle.json",
                transform_chain=["upload"],
            )
        ],
        activity_events=[
            ActivityEvent(
                event_id="evt-1",
                account_id="acct-1",
                event_type="post",
                occurred_at=datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc),
                topic="forensics",
            )
        ],
        interaction_edges=[
            InteractionEdge(
                source_account_id="acct-1",
                target_account_id="acct-2",
                relation_type="reply",
                weight=2.0,
            )
        ],
    )


def _create_analysis(store, request: AnalysisRequest) -> str:
    return asyncio.run(
        store.create(
            request_json=request.model_dump_json(),
            task_type=request.task.value,
            llm_backend=request.llm_backend,
            text_count=len(request.texts),
            author_count=len({text.author for text in request.texts}),
        )
    )


def test_retry_analysis_clones_request_and_overrides_backend_and_case(monkeypatch, tmp_path: Path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        original_request = _request_payload()
        analysis_id = _create_analysis(deps._store, original_request)

        response = client.post(
            f"/api/v1/analyses/{analysis_id}/retry",
            json={
                "llm_backend": "alternate-backend",
                "case_metadata": {
                    "case_id": "CASE-RETRY-7",
                    "client": "Retry Client",
                    "analyst": "Analyst B",
                    "notes": "Override notes for second run",
                },
            },
        )

        assert response.status_code == 202
        body = response.json()
        assert body["id"] != analysis_id
        assert body["status"] == "pending"
        assert body["llm_backend"] == "alternate-backend"

        retried_request = asyncio.run(deps._store.get_request(body["id"]))
        persisted_original = asyncio.run(deps._store.get_request(analysis_id))

        assert retried_request is not None
        assert persisted_original is not None

        assert retried_request.llm_backend == "alternate-backend"
        assert retried_request.case_metadata == CaseMetadata(
            case_id="CASE-RETRY-7",
            client="Retry Client",
            analyst="Analyst B",
            notes="Override notes for second run",
        )
        assert retried_request.task == original_request.task
        assert retried_request.task_params == original_request.task_params
        assert retried_request.texts == original_request.texts
        assert retried_request.artifacts == original_request.artifacts
        assert retried_request.activity_events == original_request.activity_events
        assert retried_request.interaction_edges == original_request.interaction_edges

        assert persisted_original.llm_backend == "baseline-backend"
        assert persisted_original.case_metadata == original_request.case_metadata


def test_retry_analysis_preserves_case_metadata_when_override_omitted(
    monkeypatch,
    tmp_path: Path,
) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))

    app = create_app()
    with TestClient(app) as client:
        assert deps._store is not None
        original_request = _request_payload()
        analysis_id = _create_analysis(deps._store, original_request)

        response = client.post(
            f"/api/v1/analyses/{analysis_id}/retry",
            json={"llm_backend": "preserve-case-backend"},
        )

        assert response.status_code == 202
        retried_request = asyncio.run(deps._store.get_request(response.json()["id"]))

        assert retried_request is not None
        assert retried_request.llm_backend == "preserve-case-backend"
        assert retried_request.case_metadata == original_request.case_metadata
