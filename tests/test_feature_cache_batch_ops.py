from __future__ import annotations

import pytest

from text.features.cache import FeatureCache
from text.ingest.schema import FeatureVector, NlpFeatures, RustFeatures


def _vector(text_id: str, content_hash: str) -> FeatureVector:
    return FeatureVector(
        text_id=text_id,
        content_hash=content_hash,
        rust_features=RustFeatures(type_token_ratio=0.42),
        nlp_features=NlpFeatures(sentiment_valence=0.1),
    )


@pytest.mark.asyncio
async def test_put_many_and_get_many_roundtrip(tmp_path) -> None:
    cache = FeatureCache(db_path=tmp_path / "features.db")
    vectors = [
        _vector("t1", "h1"),
        _vector("t2", "h2"),
        _vector("t3", "h3"),
    ]

    try:
        await cache.put_many(vectors)
        found = await cache.get_many(["h1", "h3", "missing"])
    finally:
        await cache.close()

    assert set(found.keys()) == {"h1", "h3"}
    assert found["h1"].text_id == "t1"
    assert found["h3"].text_id == "t3"


@pytest.mark.asyncio
async def test_put_many_updates_existing_rows(tmp_path) -> None:
    cache = FeatureCache(db_path=tmp_path / "features.db")
    original = _vector("old", "same-hash")
    updated = _vector("new", "same-hash")

    try:
        await cache.put_many([original])
        await cache.put_many([updated])
        found = await cache.get_many(["same-hash"])
    finally:
        await cache.close()

    assert found["same-hash"].text_id == "new"


@pytest.mark.asyncio
async def test_get_many_empty_input_returns_empty_dict(tmp_path) -> None:
    cache = FeatureCache(db_path=tmp_path / "features.db")
    try:
        found = await cache.get_many([])
    finally:
        await cache.close()
    assert found == {}
