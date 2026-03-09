from __future__ import annotations

from text.agents.psycholinguistics import WritingProcessAgent
from text.ingest.schema import AgentFinding


def test_writing_process_marks_subjective_hypotheses() -> None:
    agent = WritingProcessAgent(model="demo-model")
    findings = [
        AgentFinding(
            discipline="writing_process",
            category="affective_state",
            description="文本中出现较强的防御性表达。",
            confidence=0.63,
            evidence=["句末多次出现自我修正和缓冲语。"],
        ),
        AgentFinding(
            discipline="writing_process",
            category="process_limit",
            description="样本量限制了稳定判断。",
            confidence=0.81,
            evidence=["当前仅有 1 条短文本。"],
        ),
    ]

    normalized = agent._normalize_findings(findings)

    subjective = normalized[0]
    assert subjective.opinion_kind == "interpretive_opinion"
    assert subjective.metadata["inference_mode"] == "subjective_hypothesis"
    assert subjective.metadata["display_label"] == "主观推测"
    assert "AI 主观推测" in subjective.metadata["caution"]

    observable = normalized[1]
    assert observable.opinion_kind == "interpretive_opinion"
    assert observable.metadata["inference_mode"] == "observable_process"
    assert observable.metadata["display_label"] == "可观察线索"
    assert "解释边界" in observable.metadata["caution"]


def test_writing_process_summary_counts_subjective_and_observable_findings() -> None:
    agent = WritingProcessAgent(model="demo-model")
    findings = agent._normalize_findings(
        [
            AgentFinding(
                discipline="writing_process",
                category="machine_influence",
                description="存在轻微机器润色痕迹。",
                confidence=0.58,
                evidence=["句式平滑度异常一致。"],
            ),
            AgentFinding(
                discipline="writing_process",
                category="self_monitoring",
                description="作者可能在刻意控制措辞强度。",
                confidence=0.51,
                evidence=["多次出现降调和保留式表达。"],
            ),
        ]
    )

    summary = agent._build_summary(findings)

    assert "1 项为可观察线索" in summary
    assert "1 项为已标识的主观推测" in summary

