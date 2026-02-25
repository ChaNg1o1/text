from __future__ import annotations

import time

import pytest

from text.features.cache import FeatureCache
from text.features.embeddings import EmbeddingEngine
from text.features import extractor as extractor_mod
from text.ingest.schema import TextEntry


@pytest.mark.asyncio
async def test_extract_batch_cache_hit_is_significantly_faster(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(extractor_mod, "HAS_RUST", False)
    monkeypatch.setattr(extractor_mod, "_SPACY_AVAILABLE", False)
    monkeypatch.setattr(extractor_mod, "_NLP_MODELS", {})
    monkeypatch.setattr(EmbeddingEngine, "embed", lambda self, text: [])
    monkeypatch.setattr(EmbeddingEngine, "embed_batch", lambda self, texts: [[] for _ in texts])

    entries = [
        TextEntry(
            id=f"t{i}",
            author="a",
            content="hello world this is a repeated benchmark sample " * 10,
        )
        for i in range(40)
    ]

    cache = FeatureCache(db_path=tmp_path / "features.db")
    extractor = extractor_mod.FeatureExtractor(cache=cache)
    try:
        start = time.perf_counter()
        await extractor.extract_batch(entries)
        first = time.perf_counter() - start

        start = time.perf_counter()
        await extractor.extract_batch(entries)
        second = time.perf_counter() - start
    finally:
        await cache.close()

    assert second < first * 0.3
    assert int(extractor.last_perf["cache_hits"]) == len(entries)
    assert int(extractor.last_perf["cache_misses"]) == 0
