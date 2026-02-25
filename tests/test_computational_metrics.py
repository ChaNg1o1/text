from __future__ import annotations

import numpy as np

from text.agents.computational import ComputationalAgent
from text.ingest.schema import FeatureVector, NlpFeatures, RustFeatures


def _feature(text_id: str, trigrams: dict[str, float]) -> FeatureVector:
    return FeatureVector(
        text_id=text_id,
        content_hash=f"hash-{text_id}",
        rust_features=RustFeatures(char_ngrams=trigrams),
        nlp_features=NlpFeatures(),
    )


def test_cross_entropy_generates_stable_perplexity_matrix() -> None:
    agent = ComputationalAgent()
    features = [
        _feature("t1", {"c3:aaa": 0.6, "c3:aab": 0.4}),
        _feature("t2", {"c3:aaa": 0.5, "c3:abb": 0.5}),
        _feature("t3", {"c3:bbb": 1.0}),
    ]

    results = agent._compute_statistics(features, raw_texts=["a a a.", "a b b.", "b b b."])

    ce = results.get("cross_entropy_matrix")
    pp = results.get("perplexity_matrix")
    assert isinstance(ce, np.ndarray)
    assert isinstance(pp, np.ndarray)
    assert ce.shape == (3, 3)
    assert pp.shape == (3, 3)

    assert np.all(np.isfinite(ce))
    assert np.all(np.isfinite(pp))
    assert np.allclose(np.diag(ce), 0.0)
    assert np.allclose(np.diag(pp), 1.0)

    off_diag = ~np.eye(3, dtype=bool)
    assert np.allclose(pp[off_diag], np.exp(ce[off_diag]), atol=1e-12)


def test_burstiness_prefers_irregular_sentence_lengths() -> None:
    agent = ComputationalAgent()
    features = [
        _feature("regular", {"c3:abc": 1.0}),
        _feature("bursty", {"c3:abc": 1.0}),
        _feature("mixed", {"c3:abc": 1.0}),
    ]
    regular = "alpha beta gamma. alpha beta gamma. alpha beta gamma. alpha beta gamma."
    bursty = (
        "alpha alpha alpha alpha alpha alpha alpha alpha alpha alpha alpha alpha. "
        "beta. gamma. delta."
    )
    mixed = "alpha beta. alpha alpha alpha beta beta beta gamma. alpha."

    results = agent._compute_statistics(features, raw_texts=[regular, bursty, mixed])
    burstiness = results.get("burstiness_by_text")
    assert isinstance(burstiness, dict)
    assert set(burstiness.keys()) == {"regular", "bursty", "mixed"}

    for metrics in burstiness.values():
        assert metrics["sentence_fano"] >= 0.0
        assert metrics["sentence_cv"] >= 0.0
        assert metrics["lexical_gap_cv"] >= 0.0
        assert np.isfinite(metrics["sentence_fano"])
        assert np.isfinite(metrics["sentence_cv"])
        assert np.isfinite(metrics["lexical_gap_cv"])

    assert burstiness["bursty"]["sentence_fano"] > burstiness["regular"]["sentence_fano"]
    assert burstiness["bursty"]["sentence_cv"] > burstiness["regular"]["sentence_cv"]
