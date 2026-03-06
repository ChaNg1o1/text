from __future__ import annotations

import json

from text.agents.stylometry import _parse_findings
from text.agents.synthesis import SynthesisAgent
from text.ingest.schema import AnalysisRequest, TaskType, TextEntry


def _request_payload() -> AnalysisRequest:
    return AnalysisRequest(
        texts=[TextEntry(id="t1", author="alice", content="示例文本")],
        task=TaskType.PROFILING,
        llm_backend="demo-backend",
    )


def test_parse_findings_recovers_fenced_json_with_prefix() -> None:
    raw = """分析如下，请使用结构化结果：
```json
[
  {
    "category": "punctuation_habits",
    "description": "作者对逗号和顿号的使用较为稳定。",
    "confidence": 0.82,
    "evidence": ["逗号频率集中，句间停顿模式稳定。"]
  }
]
```
"""

    findings = _parse_findings(raw, discipline="stylometry")

    assert len(findings) == 1
    assert findings[0].category == "punctuation_habits"
    assert findings[0].description == "作者对逗号和顿号的使用较为稳定。"


def test_parse_findings_recovers_truncated_json_array() -> None:
    raw = """```json
[
  {
    "category": "function_words",
    "description": "功能词分布显示出明显稳定性。",
    "confidence": 0.76,
    "evidence": ["介词和连词比例保持一致。"]
  },
  {
    "category": "sentence_structure",
    "description": "句式结构"""

    findings = _parse_findings(raw, discipline="stylometry")

    assert len(findings) == 2
    assert findings[0].category == "function_words"
    assert findings[1].category == "methodology"
    assert "截断" in findings[1].description


def test_parse_synthesis_recovers_fenced_json_with_prefix() -> None:
    payload = {
        "summary": "综合结论",
        "interpretive_results": [
            {
                "key": "interp_1",
                "title": "解释性意见",
                "body": "证据之间存在轻微张力，但不足以推翻主结论。",
                "evidence_ids": ["ev_0001"],
                "supporting_agents": ["stylometry"],
            }
        ],
        "additional_limitations": ["补充更多时间跨度样本。"],
    }
    raw = f"以下是综合结果：\n```json\n{json.dumps(payload, ensure_ascii=False)}\n```\n请继续。"

    agent = SynthesisAgent(model="demo-model")
    report = agent._parse_synthesis(raw, request=_request_payload())

    assert report is not None
    assert report.summary == "综合结论"
    assert report.results[0].body == "证据之间存在轻微张力，但不足以推翻主结论。"
    assert report.limitations == ["补充更多时间跨度样本。"]


def test_parse_synthesis_recovers_truncated_json_object() -> None:
    raw = """```json
{
  "summary": "综合结论",
  "interpretive_results": [
    {
      "key": "interp_1",
      "title": "解释性意见",
      "body": "部分证据受样本量限制",
      "evidence_ids": ["ev_0001"],
      "supporting_agents": ["computational"]
    }
  ],
  "additional_limitations": ["继续补充样本"]
"""

    agent = SynthesisAgent(model="demo-model")
    report = agent._parse_synthesis(raw, request=_request_payload())

    assert report is not None
    assert report.summary == "综合结论"
    assert report.results[0].body == "部分证据受样本量限制"
    assert report.limitations == ["继续补充样本"]
