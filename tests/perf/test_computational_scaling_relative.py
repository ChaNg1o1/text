from __future__ import annotations

import time

from numpy.random import default_rng

from text.agents.computational import ComputationalAgent
from text.ingest.schema import FeatureVector, NlpFeatures, RustFeatures


def _feature(i: int, rng) -> FeatureVector:
    rust = RustFeatures(
        type_token_ratio=float(rng.random()),
        hapax_legomena_ratio=float(rng.random()),
        yules_k=float(rng.random() * 100),
        avg_word_length=float(4.0 + rng.random()),
        avg_sentence_length=float(10.0 + rng.random() * 5),
        sentence_length_variance=float(rng.random() * 3),
        cjk_ratio=float(rng.random()),
        emoji_density=float(rng.random() * 0.2),
        formality_score=float(rng.random()),
        code_switching_ratio=float(rng.random()),
        brunets_w=float(10.0 + rng.random() * 4),
        honores_r=float(80.0 + rng.random() * 70),
        simpsons_d=float(rng.random()),
        mtld=float(20.0 + rng.random() * 40),
        hd_d=float(rng.random()),
        coleman_liau_index=float(6.0 + rng.random() * 8),
        char_ngrams={f"c3:{j}": 1 / 30 for j in range(30)},
        function_word_freq={f"fw{j}": float(rng.random() / 100) for j in range(40)},
    )
    nlp = NlpFeatures(
        embedding=[float(x) for x in rng.random(128)],
        sentiment_valence=float(rng.random() * 2 - 1),
        emotional_tone=float(rng.random()),
        cognitive_complexity=float(rng.random()),
        clause_depth_avg=float(1.0 + rng.random() * 3),
    )
    return FeatureVector(
        text_id=f"t{i}",
        content_hash=f"h{i}",
        rust_features=rust,
        nlp_features=nlp,
    )


def _measure(agent: ComputationalAgent, n: int) -> float:
    rng = default_rng(42 + n)
    features = [_feature(i, rng) for i in range(n)]
    raw_texts = ["alpha beta gamma delta " * 100 for _ in range(n)]

    started = time.perf_counter()
    agent._compute_statistics(features, raw_texts=raw_texts)
    return time.perf_counter() - started


def test_compute_statistics_scaling_is_reasonable() -> None:
    agent = ComputationalAgent()
    small = min(_measure(agent, 40), _measure(agent, 40))
    large = min(_measure(agent, 120), _measure(agent, 120))

    # n grows by 3x; quadratic growth would be ~9x. Keep a safety budget below that.
    assert large < small * 8
