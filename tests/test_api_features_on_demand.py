from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

import text.api.deps as deps
from text.api.app import create_app
from text.api.models import AnalysisStatus
from text.features.cache import FeatureCache
from text.features.embeddings import EmbeddingEngine
from text.features import extractor as extractor_mod
from text.ingest.schema import AnalysisRequest, ForensicReport, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[
            TextEntry(id="t1", author="alice", content="hello world"),
            TextEntry(id="t2", author="bob", content="another sample"),
        ],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


def test_features_endpoint_recomputes_and_populates_cache(monkeypatch, tmp_path) -> None:
    deps.get_settings.cache_clear()
    monkeypatch.setenv("TEXT_DB_DIR", str(tmp_path))
    monkeypatch.setattr(FeatureCache, "DEFAULT_DB_DIR", tmp_path / "cache")
    # Keep test lightweight.
    monkeypatch.setattr(extractor_mod, "HAS_RUST", False)
    monkeypatch.setattr(extractor_mod, "_SPACY_AVAILABLE", False)
    monkeypatch.setattr(extractor_mod, "_NLP_MODELS", {})
    monkeypatch.setattr(EmbeddingEngine, "embed", lambda self, text: [])
    monkeypatch.setattr(EmbeddingEngine, "embed_batch", lambda self, texts: [[] for _ in texts])

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
                author_count=2,
            )
        )
        report = ForensicReport(request=request)
        asyncio.run(
            store.update_status(
                analysis_id,
                AnalysisStatus.COMPLETED,
                report_json=report.model_dump_json(),
            )
        )

        response = client.get(f"/api/v1/analyses/{analysis_id}/features")
        assert response.status_code == 200
        body = response.json()
        assert len(body["features"]) == 2

        cache = FeatureCache()
        try:
            chash = FeatureCache.content_hash(request.texts[0].content)
            cached = asyncio.run(cache.get(chash))
        finally:
            asyncio.run(cache.close())
        assert cached is not None
