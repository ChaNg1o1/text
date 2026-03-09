from __future__ import annotations

from text.decision.engine import DecisionEngine
from text.ingest.schema import (
    AnalysisRequest,
    ConclusionGrade,
    EvidenceItem,
    ForensicReport,
    ReportConclusion,
    ReportMaterial,
    ResultRecord,
    TaskType,
    TextEntry,
    WritingProfile,
    WritingProfileDimension,
)
from text.report.renderer import ReportRenderer


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="hello world")],
        task=TaskType.FULL,
        llm_backend="demo-backend",
    )


def test_markdown_renderer_includes_investigation_sections() -> None:
    report = ForensicReport(
        request=_request_payload(),
        summary="综合结论：当前证据仅支持有限判断。",
        materials=[
            ReportMaterial(
                artifact_id="art-1",
                source_name="sample.txt",
                sha256="abc123",
                byte_count=42,
                text_ids=["t1"],
            )
        ],
        conclusions=[
            ReportConclusion(
                key="verification",
                task=TaskType.VERIFICATION,
                statement="当前证据支持目标文本与已知作者 alice 的写作指纹一致。",
                grade=ConclusionGrade.MODERATE_SUPPORT,
                score=1.2,
                score_type="log10_lr",
                evidence_ids=["ev_0001"],
            )
        ],
        results=[
            ResultRecord(
                key="verification_deterministic",
                title="Verification 确定性结果",
                body="log10(LR)=1.20",
                evidence_ids=["ev_0001"],
                interpretive_opinion=False,
            )
        ],
        evidence_items=[
            EvidenceItem(
                evidence_id="ev_0001",
                label="verification_core",
                summary="verification 的核心比较结果",
                source_text_ids=["t1"],
                excerpts=["log10(LR)=1.20"],
            )
        ],
        writing_profiles=[
            WritingProfile(
                subject="alice",
                summary="写作风格相对稳定。",
                dimensions=[
                    WritingProfileDimension(
                        key="lexical_richness",
                        label="词汇丰富度",
                        score=72,
                        confidence=0.81,
                        evidence_spans=["type-token ratio 较高"],
                    )
                ],
            )
        ],
        limitations=["样本量偏小。"],
    )
    DecisionEngine().ensure_story_surfaces(report, refresh_hash=True)

    rendered = ReportRenderer.to_markdown(report)
    assert "# 文本调查报告" in rendered
    assert "## 调查摘要与结论分级" in rendered
    assert "## 叙事章节" in rendered
    assert "## 别名图例" in rendered
    assert "## 材料清单" in rendered
    assert "## 分析结果" in rendered
    assert "### 证据摘要" in rendered
    assert "### 写作画像" in rendered
    assert "## 可复现信息" in rendered
    assert "当前证据支持目标文本与已知作者 alice 的写作指纹一致。" in rendered
