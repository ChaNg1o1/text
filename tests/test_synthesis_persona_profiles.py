from __future__ import annotations

import json

from text.agents.synthesis import SynthesisAgent
from text.ingest.schema import AnalysisRequest, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="示例文本")],
        task=TaskType.PROFILING,
        llm_backend="demo-backend",
    )


def test_synthesis_parse_persona_profiles() -> None:
    raw = json.dumps(
        {
            "summary": "综合结论",
            "confidence_scores": {"profiling_overall": 0.72},
            "contradictions": [],
            "recommendations": ["补充样本"],
            "persona_profiles": [
                {
                    "subject": "alice",
                    "summary": "风格偏稳健。",
                    "overall_confidence": 0.81,
                    "dimensions": [
                        {
                            "key": "communication_style",
                            "label": "沟通风格",
                            "score": 78,
                            "confidence": 0.75,
                            "evidence_spans": ["句式简洁，命令句比例低。"],
                            "counter_evidence": ["个别文本情绪用词较强。"],
                        }
                    ],
                }
            ],
            "findings": [],
        },
        ensure_ascii=False,
    )

    agent = SynthesisAgent(model="demo-model")
    report = agent._parse_synthesis(raw, [], _request_payload())

    assert report.persona_profiles
    profile = report.persona_profiles[0]
    assert profile.subject == "alice"
    assert profile.summary == "风格偏稳健。"
    assert profile.overall_confidence == 0.81
    assert profile.dimensions[0].key == "communication_style"
    assert profile.dimensions[0].score == 78


def test_synthesis_parse_persona_profiles_clamps_values() -> None:
    raw = json.dumps(
        {
            "summary": "x",
            "confidence_scores": {},
            "contradictions": [],
            "recommendations": [],
            "persona_profiles": [
                {
                    "subject": "overall",
                    "summary": "",
                    "overall_confidence": 2,
                    "dimensions": [
                        {
                            "key": "risk_preference",
                            "label": "风险偏好",
                            "score": 140,
                            "confidence": -1,
                            "evidence_spans": [],
                            "counter_evidence": [],
                        }
                    ],
                }
            ],
            "findings": [],
        },
        ensure_ascii=False,
    )

    agent = SynthesisAgent(model="demo-model")
    report = agent._parse_synthesis(raw, [], _request_payload())

    profile = report.persona_profiles[0]
    assert profile.overall_confidence == 1.0
    assert profile.dimensions[0].score == 100.0
    assert profile.dimensions[0].confidence == 0.0
