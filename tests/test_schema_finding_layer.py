"""Tests for FindingLayer enum and new TaskType values."""

from text.ingest.schema import AgentFinding, FindingLayer, TaskType


class TestFindingLayer:
    def test_enum_values(self):
        assert FindingLayer.CLUE.value == "clue"
        assert FindingLayer.PORTRAIT.value == "portrait"
        assert FindingLayer.EVIDENCE.value == "evidence"

    def test_default_layer_is_clue(self):
        finding = AgentFinding(
            discipline="stylometry",
            category="vocab",
            description="test finding",
            confidence=0.8,
        )
        assert finding.layer == FindingLayer.CLUE

    def test_explicit_layer_setting(self):
        for layer in FindingLayer:
            finding = AgentFinding(
                discipline="stylometry",
                category="vocab",
                description="test finding",
                confidence=0.8,
                layer=layer,
            )
            assert finding.layer is layer

    def test_layer_from_string(self):
        finding = AgentFinding(
            discipline="stylometry",
            category="vocab",
            description="test finding",
            confidence=0.8,
            layer="evidence",
        )
        assert finding.layer == FindingLayer.EVIDENCE


class TestNewTaskTypes:
    def test_self_discovery_exists(self):
        assert TaskType.SELF_DISCOVERY.value == "self_discovery"

    def test_clue_extraction_exists(self):
        assert TaskType.CLUE_EXTRACTION.value == "clue_extraction"

    def test_total_task_type_count(self):
        assert len(TaskType) == 9
