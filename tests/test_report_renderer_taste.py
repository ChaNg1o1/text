from __future__ import annotations

from text.ingest.schema import (
    AnalysisRequest,
    InsightItem,
    TasteAssessment,
    TaskType,
    TextEntry,
    ForensicReport,
)
from text.report.renderer import ReportRenderer


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


def test_markdown_renderer_includes_taste_section_and_insights() -> None:
    report = ForensicReport(
        request=_request_payload(),
        synthesis="综合结论示例。",
        taste_assessment=TasteAssessment(
            overall_score=78.5,
            dimension_scores={"evidence": 82.0, "clarity": 76.0},
            strengths=["证据强度较强（82.0）"],
            risks=["清晰度偏弱（76.0）"],
            methodology="测试方法",
        ),
        insights=[
            InsightItem(
                rank=1,
                discipline="computational_linguistics",
                category="semantic_similarity",
                insight="文本间语义相似度高。",
                confidence=0.85,
                taste_score=81.2,
                dimension_scores={"evidence": 85.0, "confidence": 85.0},
                supporting_disciplines=["stylometry"],
                evidence=["cosine_similarity=0.91"],
            )
        ],
    )

    rendered = ReportRenderer.to_markdown(report)
    assert "## 品味量化（Taste）" in rendered
    assert "总体品味分" in rendered
    assert "## 高质量洞见（Top Insights）" in rendered
    assert "文本间语义相似度高。" in rendered
