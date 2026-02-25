from __future__ import annotations

from text.features.extractor import _python_fallback_features


def test_python_fallback_extracts_char_trigrams_for_cross_entropy() -> None:
    feats = _python_fallback_features("hello world hello world")

    c3_keys = [k for k in feats.char_ngrams if k.startswith("c3:")]
    assert c3_keys
    assert all(feats.char_ngrams[k] > 0.0 for k in c3_keys)


def test_python_fallback_extracts_prefixed_word_ngrams() -> None:
    feats = _python_fallback_features("foo bar baz foo bar baz")

    assert any(k.startswith("w2:") for k in feats.word_ngrams)
    assert any(k.startswith("w3:") for k in feats.word_ngrams)
