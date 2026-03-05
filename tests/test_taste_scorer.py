from __future__ import annotations

from text.agents.taste import build_taste_outputs
from text.ingest.schema import AgentFinding, AgentReport


def _report(discipline: str, findings: list[AgentFinding]) -> AgentReport:
    return AgentReport(
        agent_name=discipline,
        discipline=discipline,
        findings=findings,
        summary=f"{discipline} summary",
    )


def test_build_taste_outputs_returns_ranked_insights_and_assessment() -> None:
    reports = [
        _report(
            "stylometry",
            [
                AgentFinding(
                    discipline="stylometry",
                    category="cross_sample_consistency",
                    description="多篇文本在功能词比例和句长节奏上保持稳定一致，指向同一写作习惯。",
                    confidence=0.82,
                    evidence=["type_token_ratio variance=0.03", "avg_sentence_length delta=1.2"],
                )
            ],
        ),
        _report(
            "computational_linguistics",
            [
                AgentFinding(
                    discipline="computational_linguistics",
                    category="semantic_similarity",
                    description="多篇文本在语义空间中高度接近，与文体学一致性结论相互支撑。",
                    confidence=0.87,
                    evidence=["cosine_similarity(t1,t2)=0.91", "cluster=1 size=4"],
                )
            ],
        ),
        _report(
            "sociolinguistics",
            [
                AgentFinding(
                    discipline="sociolinguistics",
                    category="identity_markers",
                    description="称谓选择和礼貌策略稳定，建议后续人工复核关键样本确认身份链路。",
                    confidence=0.71,
                    evidence=["politeness_marker_rate=0.18"],
                )
            ],
        ),
    ]

    assessment, insights = build_taste_outputs(reports, contradictions=[])

    assert assessment is not None
    assert 0.0 <= assessment.overall_score <= 100.0
    assert insights
    assert insights[0].rank == 1
    assert all(item.taste_score >= insights[-1].taste_score for item in insights[:-1])
    assert all("confidence" in item.dimension_scores for item in insights)


def test_build_taste_outputs_applies_contradiction_penalty() -> None:
    reports = [
        _report(
            "psycholinguistics",
            [
                AgentFinding(
                    discipline="psycholinguistics",
                    category="cognitive_profile",
                    description="认知复杂度指标稳定偏高，结论明确。",
                    confidence=0.8,
                    evidence=["cognitive_complexity=0.71"],
                )
            ],
        )
    ]

    plain_assessment, _ = build_taste_outputs(reports, contradictions=[])
    penalized_assessment, _ = build_taste_outputs(
        reports,
        contradictions=["计算语言学与心理语言学对同一结论存在分歧。"],
    )

    assert plain_assessment is not None
    assert penalized_assessment is not None
    assert penalized_assessment.overall_score < plain_assessment.overall_score
