from __future__ import annotations

import pytest

from text.api.models import AnalysisStatus
from text.api.services.analysis_runner import AnalysisRunner
from text.api.services.analysis_store import AnalysisStore
from text.ingest.schema import AnalysisRequest, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


@pytest.mark.asyncio
async def test_analysis_runner_skips_work_for_canceled_analysis(monkeypatch, tmp_path) -> None:
    async def _unexpected_extract(*_args, **_kwargs):
        raise AssertionError("feature extraction should not run for canceled analyses")

    monkeypatch.setattr(AnalysisRunner, "_extract_features", _unexpected_extract)

    store = AnalysisStore(db_dir=tmp_path / "db")
    await store._ensure_db()
    runner = AnalysisRunner(store)
    request = _request_payload()

    analysis_id = await store.create(
        request_json=request.model_dump_json(),
        task_type=request.task.value,
        llm_backend=request.llm_backend,
        text_count=len(request.texts),
        author_count=1,
    )
    await store.update_status(
        analysis_id,
        AnalysisStatus.CANCELED,
        error_message="Canceled by user",
    )

    await runner.run(analysis_id, request)
    detail = await store.get(analysis_id)

    assert detail is not None
    assert detail.status == AnalysisStatus.CANCELED
    assert detail.error_message == "Canceled by user"

    await store.close()
