from __future__ import annotations

from text.features import embeddings as emb_mod


def test_embedding_engine_reuses_process_level_model(monkeypatch) -> None:
    calls: list[str] = []

    class _FakeModel:
        pass

    def _fake_loader(name: str):
        calls.append(name)
        return _FakeModel()

    monkeypatch.setattr(emb_mod, "_HAS_SBERT", True)
    monkeypatch.setattr(emb_mod, "_MODEL_CACHE", {})
    monkeypatch.setattr(emb_mod, "SentenceTransformer", _fake_loader)

    first = emb_mod.EmbeddingEngine(model_name="demo-model")
    second = emb_mod.EmbeddingEngine(model_name="demo-model")

    model_a = first._ensure_model()
    model_b = second._ensure_model()

    assert model_a is not None
    assert model_a is model_b
    assert calls == ["demo-model"]


def test_preload_embedding_model_uses_same_cache(monkeypatch) -> None:
    calls: list[str] = []

    class _FakeModel:
        pass

    def _fake_loader(name: str):
        calls.append(name)
        return _FakeModel()

    monkeypatch.setattr(emb_mod, "_HAS_SBERT", True)
    monkeypatch.setattr(emb_mod, "_MODEL_CACHE", {})
    monkeypatch.setattr(emb_mod, "SentenceTransformer", _fake_loader)

    assert emb_mod.preload_embedding_model("demo-model") is True

    engine = emb_mod.EmbeddingEngine(model_name="demo-model")
    model = engine._ensure_model()
    assert model is not None
    assert calls == ["demo-model"]
