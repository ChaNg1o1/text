"""Tests for _parse_findings layer field extraction."""

import json

from text.agents.stylometry import _parse_findings
from text.ingest.schema import FindingLayer


def _make_raw(*items: dict) -> str:
    """Wrap dicts into a JSON array string."""
    return json.dumps(list(items))


class TestParseFindings_LayerExtraction:
    """Verify that _parse_findings correctly maps the 'layer' field to FindingLayer."""

    def test_explicit_layer_portrait(self):
        raw = _make_raw(
            {
                "category": "vocabulary_richness",
                "description": "Author shows diverse vocabulary.",
                "confidence": 0.8,
                "evidence": ["TTR = 0.72"],
                "layer": "portrait",
            }
        )
        findings = _parse_findings(raw, discipline="stylometry")
        assert len(findings) == 1
        assert findings[0].layer == FindingLayer.PORTRAIT

    def test_explicit_layer_evidence(self):
        raw = _make_raw(
            {
                "category": "semantic_similarity",
                "description": "High cosine similarity detected.",
                "confidence": 0.9,
                "evidence": ["cosine = 0.92"],
                "layer": "evidence",
            }
        )
        findings = _parse_findings(raw, discipline="computational_linguistics")
        assert len(findings) == 1
        assert findings[0].layer == FindingLayer.EVIDENCE

    def test_explicit_layer_clue(self):
        raw = _make_raw(
            {
                "category": "punctuation_habits",
                "description": "Unusual semicolon usage.",
                "confidence": 0.6,
                "evidence": ["semicolon_rate = 0.05"],
                "layer": "clue",
            }
        )
        findings = _parse_findings(raw, discipline="stylometry")
        assert len(findings) == 1
        assert findings[0].layer == FindingLayer.CLUE

    def test_missing_layer_defaults_to_clue(self):
        raw = _make_raw(
            {
                "category": "function_words",
                "description": "Pronoun distribution is notable.",
                "confidence": 0.7,
                "evidence": ["I/we ratio = 3.2"],
            }
        )
        findings = _parse_findings(raw, discipline="stylometry")
        assert len(findings) == 1
        assert findings[0].layer == FindingLayer.CLUE

    def test_invalid_layer_falls_back_to_clue(self):
        raw = _make_raw(
            {
                "category": "ngram_fingerprint",
                "description": "Distinctive trigram pattern.",
                "confidence": 0.75,
                "evidence": ["top trigram: 'the'"],
                "layer": "nonexistent_layer_value",
            }
        )
        findings = _parse_findings(raw, discipline="stylometry")
        assert len(findings) == 1
        assert findings[0].layer == FindingLayer.CLUE

    def test_multiple_findings_mixed_layers(self):
        raw = _make_raw(
            {
                "category": "vocabulary_richness",
                "description": "Finding A",
                "confidence": 0.8,
                "evidence": [],
                "layer": "portrait",
            },
            {
                "category": "semantic_similarity",
                "description": "Finding B",
                "confidence": 0.9,
                "evidence": [],
                "layer": "evidence",
            },
            {
                "category": "punctuation_habits",
                "description": "Finding C (no layer)",
                "confidence": 0.5,
                "evidence": [],
            },
            {
                "category": "anomaly_detection",
                "description": "Finding D (bad layer)",
                "confidence": 0.6,
                "evidence": [],
                "layer": "bogus",
            },
        )
        findings = _parse_findings(raw, discipline="test")
        assert len(findings) == 4
        assert findings[0].layer == FindingLayer.PORTRAIT
        assert findings[1].layer == FindingLayer.EVIDENCE
        assert findings[2].layer == FindingLayer.CLUE
        assert findings[3].layer == FindingLayer.CLUE
