from __future__ import annotations

import json

from text.agents.synthesis import SynthesisAgent
from text.ingest.schema import AnalysisRequest, ForensicReport, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="示例文本")],
        task=TaskType.PROFILING,
        llm_backend="demo-backend",
    )


def test_synthesis_parse_interpretive_results() -> None:
    raw = json.dumps(
        {
            "summary": "综合结论",
            "interpretive_results": [
                {
                    "key": "interp_1",
                    "title": "解释性意见",
                    "body": "多个视角都提示风格较稳定。",
                    "evidence_ids": ["ev_0001"],
                    "supporting_agents": ["stylometry", "computational"],
                }
            ],
            "additional_limitations": ["题材跨度较大，需谨慎解读。"],
        },
        ensure_ascii=False,
    )

    agent = SynthesisAgent(model="demo-model")
    report = agent._parse_synthesis(
        raw,
        base_report=ForensicReport(request=_request_payload()),
        request=_request_payload(),
    )

    assert report is not None
    assert report.summary == "综合结论"
    assert report.results[0].title == "解释性意见"
    assert report.results[0].interpretive_opinion is True
    assert report.results[0].supporting_agents == ["stylometry", "computational"]
    assert report.limitations == ["题材跨度较大，需谨慎解读。"]


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
