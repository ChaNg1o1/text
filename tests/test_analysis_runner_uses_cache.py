from __future__ import annotations

import pytest

from text.api.models import AnalysisStatus
from text.api.services.analysis_runner import AnalysisRunner
from text.api.services.analysis_store import AnalysisStore
from text.features.cache import FeatureCache
from text.features.embeddings import EmbeddingEngine
from text.features import extractor as extractor_mod
from text.ingest.schema import AnalysisRequest, ForensicReport, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[
            TextEntry(id="t1", author="alice", content="hello world"),
            TextEntry(id="t2", author="alice", content="hello world again"),
            TextEntry(id="t3", author="bob", content="another sample input"),
        ],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


@pytest.mark.asyncio
async def test_analysis_runner_hits_cache_on_repeated_runs(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(FeatureCache, "DEFAULT_DB_DIR", tmp_path / "cache")
    monkeypatch.setattr(extractor_mod, "HAS_RUST", False)
    monkeypatch.setattr(extractor_mod, "_SPACY_AVAILABLE", False)
    monkeypatch.setattr(extractor_mod, "_NLP_MODELS", {})
    monkeypatch.setattr(EmbeddingEngine, "embed", lambda self, text: [])
    monkeypatch.setattr(EmbeddingEngine, "embed_batch", lambda self, texts: [[] for _ in texts])

    async def _fake_run_agents(self, analysis_id, features, request):
        return ForensicReport(request=request), {"agent_analysis_ms": 1.0, "synthesis_ms": 0.5}

    monkeypatch.setattr(AnalysisRunner, "_run_agents", _fake_run_agents)

    store = AnalysisStore(db_dir=tmp_path / "db")
    await store._ensure_db()
    runner = AnalysisRunner(store)
    request = _request_payload()

    first_id = await store.create(
        request_json=request.model_dump_json(),
        task_type=request.task.value,
        llm_backend=request.llm_backend,
        text_count=len(request.texts),
        author_count=2,
    )
    await runner.run(first_id, request)
    first = await store.get(first_id)
    assert first is not None
    assert first.status == AnalysisStatus.COMPLETED
    assert first.perf is not None
    assert first.perf.cache_misses == len(request.texts)

    second_id = await store.create(
        request_json=request.model_dump_json(),
        task_type=request.task.value,
        llm_backend=request.llm_backend,
        text_count=len(request.texts),
        author_count=2,
    )
    await runner.run(second_id, request)
    second = await store.get(second_id)
    assert second is not None
    assert second.status == AnalysisStatus.COMPLETED
    assert second.perf is not None
    assert second.perf.cache_hits == len(request.texts)
    assert second.perf.cache_misses == 0

    await store.close()
