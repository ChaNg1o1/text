from __future__ import annotations

import asyncio
import json

from text.agents.synthesis import SynthesisAgent
from text.ingest.schema import AnalysisRequest, ForensicReport, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="示例文本"), TextEntry(id="t2", author="alice", content="补充文本")],
        task=TaskType.PROFILING,
        llm_backend="demo-backend",
    )


def test_synthesis_parse_interpretive_results() -> None:
    base_report = ForensicReport(request=_request_payload())
    agent = SynthesisAgent(model="demo-model")
    agent.decision_engine.ensure_story_surfaces(base_report)
    raw = json.dumps(
        {
            "summary": "综合结论",
            "narrative": {
                "version": "v1",
                "lead": "这是一句话结论",
                "sections": [
                    {
                        "key": "bottom_line",
                        "title": "结论先看",
                        "summary": "当前证据支持。",
                        "detail": "细节描述",
                        "evidence_ids": ["ev_0001"],
                        "result_keys": ["verification_deterministic"],
                        "default_expanded": True,
                    }
                ],
                "action_items": ["补充样本复核。"],
                "contradictions": [],
            },
            "interpretive_results": [
                {
                    "key": "interp_1",
                    "title": "解释性意见",
                    "body": "多个视角都提示风格较稳定。",
                    "evidence_ids": ["ev_0001"],
                    "supporting_agents": ["stylometry", "computational"],
                }
            ],
            "profile_overrides": [
                {
                    "subject": "alice",
                    "headline": "正式长篇分析写法",
                    "observable_summary": "alice 的写法更像长篇分析说明文，句子延展充分，正式度偏高。",
                    "stable_habits": ["偏好先铺背景，再落判断。"],
                    "process_clues": ["术语切换更多像行业表达，而不是随机漂移。"],
                    "anomalies": ["样本量仍有限。"],
                    "confidence_note": "当前画像来自 2 条样本，结论适合辅助解释。",
                }
            ],
            "evidence_overrides": [
                {
                    "evidence_id": "ev_0001",
                    "finding": "核心证据显示多个风格维度同步收敛。",
                    "why_it_matters": "这是解释主结论的第一锚点。",
                    "counter_readings": ["题材差异仍可能带来局部偏移。"],
                    "strength": "core",
                }
            ],
            "additional_limitations": ["题材跨度较大，需谨慎解读。"],
        },
        ensure_ascii=False,
    )

    report = agent._parse_synthesis(
        raw,
        base_report=base_report,
        request=_request_payload(),
    )

    assert report is not None
    assert report.summary == "综合结论"
    assert report.narrative is not None
    assert report.narrative.lead == "这是一句话结论"
    assert report.results[0].title == "解释性意见"
    assert report.results[0].interpretive_opinion is True
    assert report.results[0].supporting_agents == ["stylometry", "computational"]
    assert report.limitations == ["题材跨度较大，需谨慎解读。"]
    assert report.writing_profiles[0].headline == "正式长篇分析写法"
    assert report.writing_profiles[0].stable_habits == ["偏好先铺背景，再落判断。"]
    assert report.evidence_items[0].strength == "core"
    assert report.evidence_items[0].finding == "核心证据显示多个风格维度同步收敛。"


def test_synthesis_parse_interpretive_results_recovers_truncated_json() -> None:
    raw = """```json
{
  "summary": "x",
  "interpretive_results": [
    {
      "key": "interp_1",
      "title": "解释性意见",
      "body": "输出被截断前的部分内容",
      "evidence_ids": ["ev_0001"],
      "supporting_agents": ["stylometry"]
    }
  ],
  "additional_limitations": ["JSON 截断"]
"""

    agent = SynthesisAgent(model="demo-model")
    report = agent._parse_synthesis(
        raw,
        base_report=ForensicReport(request=_request_payload()),
        request=_request_payload(),
    )

    assert report is not None
    assert report.summary == "x"
    assert report.results[0].body == "输出被截断前的部分内容"
    assert report.limitations == ["JSON 截断"]


def test_synthesis_fallback_populates_narrative_when_model_missing() -> None:
    agent = SynthesisAgent(model=None)
    request = _request_payload()
    base_report = ForensicReport(request=request)
    report = asyncio.run(agent.synthesize(base_report, agent_reports=[], request=request))

    assert report.narrative is not None
    assert report.narrative.version == "v1"
    assert len(report.narrative.sections) == 5
