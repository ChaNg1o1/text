from __future__ import annotations

import pytest

from text.features import extractor as extractor_mod
from text.features.embeddings import EmbeddingEngine
from text.ingest.schema import TextEntry


@pytest.mark.asyncio
async def test_extract_batch_matches_single_extract_semantics(monkeypatch) -> None:
    # Keep this test deterministic and lightweight.
    monkeypatch.setattr(extractor_mod, "HAS_RUST", False)
    monkeypatch.setattr(extractor_mod, "_SPACY_AVAILABLE", False)
    monkeypatch.setattr(extractor_mod, "_NLP_MODELS", {})
    monkeypatch.setattr(EmbeddingEngine, "embed", lambda self, text: [])
    monkeypatch.setattr(EmbeddingEngine, "embed_batch", lambda self, texts: [[] for _ in texts])

    entries = [
        TextEntry(id="t1", author="a", content="hello world this is a test"),
        TextEntry(id="t2", author="a", content="another sample with repeated repeated tokens"),
        TextEntry(id="t3", author="b", content="mixed 中文 text and punctuation!"),
    ]

    extractor = extractor_mod.FeatureExtractor(cache=None)
    batch = await extractor.extract_batch(entries)

    singles = []
    for entry in entries:
        singles.append(await extractor.extract(entry.content, entry.id))

    assert [item.model_dump() for item in batch] == [item.model_dump() for item in singles]
