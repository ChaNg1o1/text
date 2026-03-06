"""Synthesis agent constrained by deterministic forensic decisions."""

from __future__ import annotations

import logging

from text.app_settings import apply_prompt_override
from text.ingest.schema import AnalysisRequest, ForensicReport, ResultRecord

from .json_utils import parse_json_object_loose
from .stylometry import _call_llm

logger = logging.getLogger(__name__)


class SynthesisAgent:
    """Produces constrained interpretive summaries over deterministic outputs."""

    SYSTEM_PROMPT = """\
You are a senior forensic analyst writing a court-aware summary for non-expert users.

Strict rules:
1. Do NOT invent or upgrade any deterministic conclusion grade.
2. Treat deterministic conclusions and evidence as the primary record.
3. Your role is limited to:
   - plain-language summary that a non-technical reader can understand
   - explanation of how multiple signals fit together
   - explicit limitations
4. Use cautious language such as "当前证据支持", "当前证据不支持", "无法判断".
5. Never state or imply an open-world identity claim unless the deterministic result already says so.
6. Put the bottom-line conclusion first.
7. Avoid raw metric names or formulas in the opening summary unless they are essential.
8. When mentioning a metric, immediately explain it in plain Chinese.

Output JSON object with:
- "summary": string
- "interpretive_results": array of objects with:
  - "key": string
  - "title": string
  - "body": string
  - "evidence_ids": array of strings
  - "supporting_agents": array of strings
- "additional_limitations": array of strings

Return ONLY JSON.
"""

    def __init__(
        self,
        model: str | None = None,
        api_base: str | None = None,
        api_key: str | None = None,
        prompt_override: str | None = None,
    ) -> None:
        self.model = model
        self.api_base = api_base
        self.api_key = api_key
        self.prompt_override = prompt_override

    async def synthesize(
        self,
        base_report: ForensicReport,
        agent_reports: list,
        request: AnalysisRequest,
    ) -> ForensicReport:
        report = base_report.model_copy(deep=True)
        report.agent_reports = list(agent_reports)
        if report.provenance is not None:
            for agent_report in report.agent_reports:
                if agent_report.llm_call is not None:
                    report.provenance.llm_calls.append(agent_report.llm_call)

        model = self.model
        if not model:
            report.results.extend(self._fallback_results(agent_reports))
            return report

        user_prompt = self._build_prompt(report, request)
        try:
            raw_response, llm_call = await _call_llm(
                apply_prompt_override(self.SYSTEM_PROMPT, self.prompt_override),
                user_prompt,
                model,
                api_base=self.api_base,
                api_key=self.api_key,
                agent_name="synthesis",
            )
        except Exception:
            logger.exception("SynthesisAgent LLM call failed")
            report.results.extend(self._fallback_results(agent_reports))
            return report

        parsed_report = self._parse_synthesis(
            raw_response,
            base_report=report,
            agent_reports=agent_reports,
            request=request,
        )
        if parsed_report is None:
            report.results.extend(self._fallback_results(agent_reports))
            return report
        report = parsed_report

        if report.provenance is not None:
            report.provenance.llm_calls.append(llm_call)
        report.reproducibility.model_id = llm_call.model_id
        return report

    def _parse_synthesis(
        self,
        raw_response: str,
        *,
        base_report: ForensicReport | None = None,
        agent_reports: list | None = None,
        request: AnalysisRequest | None = None,
    ) -> ForensicReport | None:
        report = (
            base_report.model_copy(deep=True)
            if base_report is not None
            else ForensicReport(request=request or AnalysisRequest(texts=[]))
        )
        if agent_reports is not None:
            report.agent_reports = list(agent_reports)

        parsed = parse_json_object_loose(raw_response)
        if parsed is None:
            return None

        data = parsed.value
        summary = str(data.get("summary", "")).strip()
        if summary:
            report.summary = summary

        for item in data.get("interpretive_results", []) or []:
            if not isinstance(item, dict):
                continue
            report.results.append(
                ResultRecord(
                    key=str(item.get("key") or f"interpretive_{len(report.results)+1}"),
                    title=str(item.get("title") or "解释性意见"),
                    body=str(item.get("body") or "").strip(),
                    evidence_ids=[str(eid) for eid in item.get("evidence_ids", []) if str(eid).strip()],
                    interpretive_opinion=True,
                    supporting_agents=[
                        str(agent) for agent in item.get("supporting_agents", []) if str(agent).strip()
                    ],
                )
            )

        extra_limits = [
            str(item) for item in data.get("additional_limitations", []) if str(item).strip()
        ]
        if extra_limits:
            report.limitations.extend(extra_limits)
        return report

    def _build_prompt(self, report: ForensicReport, request: AnalysisRequest) -> str:
        sections = [
            "## Deterministic Conclusions",
        ]
        for conclusion in report.conclusions:
            sections.append(
                (
                    f"- key={conclusion.key} | task={conclusion.task.value} | grade={conclusion.grade.value} "
                    f"| score={conclusion.score if conclusion.score is not None else 'n/a'}\n"
                    f"  statement={conclusion.statement}\n"
                    f"  limitations={'；'.join(conclusion.limitations) if conclusion.limitations else '无'}\n"
                    f"  evidence_ids={', '.join(conclusion.evidence_ids) if conclusion.evidence_ids else '无'}"
                )
            )

        sections.append("\n## Evidence Items")
        for evidence in report.evidence_items[:12]:
            sections.append(
                f"- {evidence.evidence_id}: {evidence.summary} | excerpts={'；'.join(evidence.excerpts[:3])}"
            )

        sections.append("\n## Agent Reports")
        for agent_report in report.agent_reports:
            sections.append(
                f"- {agent_report.agent_name} ({agent_report.discipline}): {agent_report.summary}"
            )
        sections.append(
            "\nWrite concise Chinese for a non-expert desktop app user. Start with the bottom line, "
            "then explain why, then mention risks or limits."
        )
        return "\n".join(sections)

    def _fallback_results(self, agent_reports: list) -> list[ResultRecord]:
        results: list[ResultRecord] = []
        for agent_report in agent_reports:
            if not getattr(agent_report, "summary", "").strip():
                continue
            results.append(
                ResultRecord(
                    key=f"agent_{agent_report.agent_name}",
                    title=f"{agent_report.agent_name} 解释性摘要",
                    body=agent_report.summary,
                    interpretive_opinion=True,
                    supporting_agents=[agent_report.agent_name],
                )
            )
        return results
