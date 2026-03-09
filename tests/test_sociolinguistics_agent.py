from __future__ import annotations

from text.agents.sociolinguistics import SociolinguisticsAgent
from text.ingest.schema import AgentFinding


def test_sociolinguistics_marks_subjective_social_hypotheses() -> None:
    agent = SociolinguisticsAgent(model="demo-model")
    findings = [
        AgentFinding(
            discipline="sociolinguistics",
            category="identity_performance",
            description="文本可能在表演某种专业化身份姿态。",
            confidence=0.57,
            evidence=["反复使用面向观众的自我定位句式。"],
        ),
        AgentFinding(
            discipline="sociolinguistics",
            category="ingroup_language",
            description="出现较稳定的圈层内部表达。",
            confidence=0.75,
            evidence=["术语和缩略语默认不做解释。"],
        ),
    ]

    normalized = agent._normalize_findings(findings)

    subjective = normalized[0]
    assert subjective.opinion_kind == "interpretive_opinion"
    assert subjective.metadata["inference_mode"] == "subjective_social_hypothesis"
    assert subjective.metadata["display_label"] == "主观推测"
    assert "AI 主观推测" in subjective.metadata["caution"]

    observable = normalized[1]
    assert observable.opinion_kind == "interpretive_opinion"
    assert observable.metadata["inference_mode"] == "observable_social_signal"
    assert observable.metadata["display_label"] == "可观察线索"


def test_sociolinguistics_summary_counts_subjective_and_observable_findings() -> None:
    agent = SociolinguisticsAgent(model="demo-model")
    findings = agent._normalize_findings(
        [
            AgentFinding(
                discipline="sociolinguistics",
                category="register_formality",
                description="正式度在样本间较稳定。",
                confidence=0.71,
                evidence=["敬语和说明式句法占比较高。"],
            ),
            AgentFinding(
                discipline="sociolinguistics",
                category="audience_design",
                description="作者可能在对特定圈内受众说话。",
                confidence=0.49,
                evidence=["大量默认共享背景知识的表达。"],
            ),
        ]
    )

    summary = agent._build_summary(findings)

    assert "1 项为可观察线索" in summary
    assert "1 项为已标识的主观推测" in summary
