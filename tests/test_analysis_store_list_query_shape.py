from __future__ import annotations

import pytest

from text.api.models import AnalysisStatus
from text.api.services.analysis_store import AnalysisStore
from text.ingest.schema import AnalysisRequest, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


@pytest.mark.asyncio
async def test_list_uses_summary_projection_query(tmp_path, monkeypatch) -> None:
    store = AnalysisStore(db_dir=tmp_path / "db")
    request = _request_payload()
    analysis_id = await store.create(
        request_json=request.model_dump_json(),
        task_type=request.task.value,
        llm_backend=request.llm_backend,
        text_count=1,
        author_count=1,
    )
    await store.update_status(
        analysis_id,
        AnalysisStatus.COMPLETED,
        report_json='{"report":"x"}',
        features_json='{"features":[1,2,3]}',
        perf_json='{"total_ms":12.3}',
    )

    db = await store._ensure_db()
    executed_queries: list[str] = []
    original_execute = db.execute

    def tracking_execute(sql, parameters=()):
        normalized = " ".join(str(sql).split())
        if "FROM analyses" in normalized and "ORDER BY created_at DESC" in normalized:
            executed_queries.append(normalized)
        return original_execute(sql, parameters)

    monkeypatch.setattr(db, "execute", tracking_execute)

    response = await store.list(page=1, page_size=20)

    assert response.total == 1
    assert len(response.items) == 1
    assert executed_queries
    assert any(
        "SELECT id, status, task_type, llm_backend, text_count, author_count, created_at, "
        "completed_at, error_message FROM analyses" in query
        for query in executed_queries
    )
    assert all("SELECT * FROM analyses" not in query for query in executed_queries)

    await store.close()
