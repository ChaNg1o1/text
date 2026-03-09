"""Synthesis agent: detective summary writer constrained by deterministic decisions."""

from __future__ import annotations

import logging

from text.app_settings import apply_prompt_override
from text.decision.engine import DecisionEngine
from text.ingest.schema import (
    AnalysisRequest,
    ForensicReport,
    NarrativeBundle,
    NarrativeSection,
    ResultRecord,
)

from .json_utils import parse_json_object_loose
from .stylometry import _call_llm

logger = logging.getLogger(__name__)


class SynthesisAgent:
    """Produces constrained interpretive summaries over deterministic outputs."""

    SYSTEM_PROMPT = """\
You are a senior text detective writing a comprehensive investigation summary \
(综合调查总结). Your readers are non-expert users who need actionable, \
plain-language takeaways -- not a lab report. Write like a detective closing a \
case file: bottom-line first, then the reasoning, then what still needs checking.

Strict rules (non-negotiable):
1. Do NOT invent or upgrade any deterministic conclusion grade. The deterministic \
results are the primary record -- you interpret them, never override them.
2. Your role is limited to:
   - plain-language summary that a non-technical reader can understand
   - explanation of how multiple investigative signals fit together
   - explicit limitations and gaps
3. Use cautious language: "当前证据支持", "当前证据不支持", "无法判断". \
Never state or imply an identity claim beyond what deterministic results already say.
4. Put the bottom-line conclusion first.
5. Avoid raw metric names or formulas in the opening summary. When mentioning a \
metric anywhere, immediately explain it in plain Chinese.

Perspective (adapt to the task context you receive):
- For self_discovery tasks: write in 2nd person. The bottom_line should feel like a \
writing profile reveal -- speak to the writer about themselves. In profile_overrides, \
use language that addresses the writer directly (e.g. "你的写作显示…", \
"你倾向于…") rather than describing a third-party subject.
- For clue_extraction tasks: write in 3rd person as an intelligence brief -- concise, \
objective, emphasizing actionable clues. The opening should surface the best leads \
first (who/where/when/which community/which source pattern to follow next), and only \
then explain supporting forensic-style evidence and caveats. Do not frame the opening \
as a courtroom-style verdict unless the provided deterministic results already make \
that unavoidable.
- For all other tasks: use 3rd person investigative style, like a detective's case notes.

Output JSON object with:
- "summary": string
- "narrative": object with:
  - "version": "v1"
  - "lead": string
  - "sections": array of objects with:
    - "key": one of ["bottom_line","evidence_chain","conflicts","limitations","next_actions"]
    - "title": string
    - "summary": string
    - "detail": string
    - "evidence_ids": array of strings
    - "result_keys": array of strings
    - "default_expanded": boolean
  - "action_items": array of strings
  - "contradictions": array of strings
- "interpretive_results": array of objects with:
  - "key": string
  - "title": string
  - "body": string
  - "evidence_ids": array of strings
  - "supporting_agents": array of strings
- "profile_overrides": array of objects with:
  - "subject": string
  - "headline": string
  - "observable_summary": string
  - "stable_habits": array of strings
  - "process_clues": array of strings
  - "anomalies": array of strings
  - "confidence_note": string
- "cluster_overrides": array of objects with:
  - "cluster_id": integer
  - "label": string
  - "theme_summary": string
  - "separation_summary": string
  - "top_markers": array of strings
  - "confidence_note": string
- "evidence_overrides": array of objects with:
  - "evidence_id": string
  - "finding": string
  - "why_it_matters": string
  - "counter_readings": array of strings
  - "strength": one of ["core","supporting","conflicting"]
- "additional_limitations": array of strings

For clue_extraction tasks specifically:
- "lead" should read like a lead brief, not a verdict.
- "bottom_line" should summarize the highest-value OSINT pivots and linkage clues.
- "next_actions" should focus on concrete follow-up checks such as source tracing, alias pivoting, \
timeline verification, account correlation, and metadata confirmation.
- Keep "evidence_chain" as supporting detail behind the clues, not the front door of the narrative.

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
        self.decision_engine = DecisionEngine()

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
            self.decision_engine.ensure_story_surfaces(report)
            self.decision_engine.refresh_report_hash(report)
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
            self.decision_engine.ensure_story_surfaces(report)
            self.decision_engine.refresh_report_hash(report)
            return report

        parsed_report = self._parse_synthesis(
            raw_response,
            base_report=report,
            agent_reports=agent_reports,
            request=request,
        )
        if parsed_report is None:
            report.results.extend(self._fallback_results(agent_reports))
            self.decision_engine.ensure_story_surfaces(report)
            self.decision_engine.refresh_report_hash(report)
            return report
        report = parsed_report

        if report.provenance is not None:
            report.provenance.llm_calls.append(llm_call)
        report.reproducibility.model_id = llm_call.model_id
        self.decision_engine.ensure_story_surfaces(report)
        self.decision_engine.refresh_report_hash(report)
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

        narrative = self._parse_narrative(data.get("narrative"))
        if narrative is not None:
            report.narrative = narrative

        self._apply_profile_overrides(report, data.get("profile_overrides"))
        self._apply_cluster_overrides(report, data.get("cluster_overrides"))
        self._apply_evidence_overrides(report, data.get("evidence_overrides"))

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

    def _apply_profile_overrides(self, report: ForensicReport, raw: object) -> None:
        if not isinstance(raw, list):
            return
        by_subject = {profile.subject: profile for profile in report.writing_profiles}
        for item in raw:
            if not isinstance(item, dict):
                continue
            subject = str(item.get("subject", "")).strip()
            profile = by_subject.get(subject)
            if profile is None:
                continue
            headline = str(item.get("headline", "")).strip()
            observable_summary = str(item.get("observable_summary", "")).strip()
            confidence_note = str(item.get("confidence_note", "")).strip()
            stable_habits = [
                str(value).strip()
                for value in (item.get("stable_habits") or [])
                if str(value).strip()
            ]
            process_clues = [
                str(value).strip()
                for value in (item.get("process_clues") or [])
                if str(value).strip()
            ]
            anomalies = [
                str(value).strip()
                for value in (item.get("anomalies") or [])
                if str(value).strip()
            ]
            if headline:
                profile.headline = headline
            if observable_summary:
                profile.observable_summary = observable_summary
            if stable_habits:
                profile.stable_habits = stable_habits
            if process_clues:
                profile.process_clues = process_clues
            if anomalies:
                profile.anomalies = anomalies
            if confidence_note:
                profile.confidence_note = confidence_note

    def _apply_cluster_overrides(self, report: ForensicReport, raw: object) -> None:
        if not isinstance(raw, list) or report.cluster_view is None:
            return
        by_cluster = {cluster.cluster_id: cluster for cluster in report.cluster_view.clusters}
        for item in raw:
            if not isinstance(item, dict):
                continue
            try:
                cluster_id = int(item.get("cluster_id"))
            except (TypeError, ValueError):
                continue
            cluster = by_cluster.get(cluster_id)
            if cluster is None:
                continue
            for key in ["label", "theme_summary", "separation_summary", "confidence_note"]:
                value = str(item.get(key, "")).strip()
                if value:
                    setattr(cluster, key, value)
            top_markers = [
                str(value).strip()
                for value in (item.get("top_markers") or [])
                if str(value).strip()
            ]
            if top_markers:
                cluster.top_markers = top_markers[:4]

    def _apply_evidence_overrides(self, report: ForensicReport, raw: object) -> None:
        if not isinstance(raw, list):
            return
        by_evidence_id = {item.evidence_id: item for item in report.evidence_items}
        for item in raw:
            if not isinstance(item, dict):
                continue
            evidence_id = str(item.get("evidence_id", "")).strip()
            evidence = by_evidence_id.get(evidence_id)
            if evidence is None:
                continue
            for key in ["finding", "why_it_matters"]:
                value = str(item.get(key, "")).strip()
                if value:
                    setattr(evidence, key, value)
            counter_readings = [
                str(value).strip()
                for value in (item.get("counter_readings") or [])
                if str(value).strip()
            ]
            if counter_readings:
                evidence.counter_readings = counter_readings[:3]
            strength = str(item.get("strength", "")).strip()
            if strength in {"core", "supporting", "conflicting"}:
                evidence.strength = strength

    def _parse_narrative(self, raw: object) -> NarrativeBundle | None:
        if not isinstance(raw, dict):
            return None
        lead = str(raw.get("lead", "")).strip()
        action_items = [
            str(item).strip()
            for item in (raw.get("action_items") or [])
            if str(item).strip()
        ]
        contradictions = [
            str(item).strip()
            for item in (raw.get("contradictions") or [])
            if str(item).strip()
        ]
        sections: list[NarrativeSection] = []
        for section in raw.get("sections", []) or []:
            if not isinstance(section, dict):
                continue
            key = str(section.get("key", "")).strip()
            if key not in {
                "bottom_line",
                "evidence_chain",
                "conflicts",
                "limitations",
                "next_actions",
            }:
                continue
            sections.append(
                NarrativeSection(
                    key=key,
                    title=str(section.get("title", "")).strip() or key,
                    summary=str(section.get("summary", "")).strip(),
                    detail=str(section.get("detail", "")).strip(),
                    evidence_ids=[
                        str(item).strip()
                        for item in (section.get("evidence_ids") or [])
                        if str(item).strip()
                    ],
                    result_keys=[
                        str(item).strip()
                        for item in (section.get("result_keys") or [])
                        if str(item).strip()
                    ],
                    default_expanded=bool(section.get("default_expanded", False)),
                )
            )
        if not lead and not sections:
            return None
        return NarrativeBundle(
            version="v1",
            lead=lead,
            sections=sections,
            action_items=action_items,
            contradictions=contradictions,
        )

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

        if report.entity_aliases and report.entity_aliases.text_aliases:
            sections.append("\n## Text Aliases")
            for alias in report.entity_aliases.text_aliases[:24]:
                sections.append(
                    f"- {alias.alias} => {alias.text_id} | author={alias.author} | preview={alias.preview}"
                )

        if report.cluster_view and report.cluster_view.clusters:
            sections.append("\n## Cluster View")
            for cluster in report.cluster_view.clusters:
                sections.append(
                    (
                        f"- id={cluster.cluster_id} | label={cluster.label} | "
                        f"members={', '.join(cluster.member_aliases)}\n"
                        f"  theme={cluster.theme_summary}\n"
                        f"  separation={cluster.separation_summary}\n"
                        f"  markers={'；'.join(cluster.top_markers)}\n"
                        f"  confidence={cluster.confidence_note}"
                    )
                )
            if report.cluster_view.excluded_text_ids:
                sections.append(
                    f"- excluded_for_length={', '.join(report.cluster_view.excluded_text_ids)}"
                )

        if report.writing_profiles:
            sections.append("\n## Writing Profiles")
            for profile in report.writing_profiles:
                sections.append(
                    (
                        f"- subject={profile.subject}\n"
                        f"  headline={profile.headline}\n"
                        f"  observable_summary={profile.observable_summary or profile.summary}\n"
                        f"  stable_habits={'；'.join(profile.stable_habits[:4]) or '无'}\n"
                        f"  process_clues={'；'.join(profile.process_clues[:4]) or '无'}\n"
                        f"  anomalies={'；'.join(profile.anomalies[:4]) or '无'}\n"
                        f"  confidence_note={profile.confidence_note}"
                    )
                )

        sections.append("\n## Evidence Items")
        for evidence in report.evidence_items[:12]:
            sections.append(
                (
                    f"- {evidence.evidence_id}: {evidence.summary}\n"
                    f"  finding={evidence.finding}\n"
                    f"  why_it_matters={evidence.why_it_matters}\n"
                    f"  counter_readings={'；'.join(evidence.counter_readings[:3]) or '无'}\n"
                    f"  strength={evidence.strength}\n"
                    f"  linked_conclusions={', '.join(evidence.linked_conclusion_keys) or '无'}\n"
                    f"  excerpts={'；'.join(evidence.excerpts[:3]) or '无'}"
                )
            )

        sections.append("\n## Agent Reports")
        for agent_report in report.agent_reports:
            sections.append(
                f"- {agent_report.agent_name} ({agent_report.discipline}): {agent_report.summary}"
            )
        sections.append(
            "\nWrite polished Chinese for a non-expert desktop app user. Start with the bottom line, "
            "then explain why, then mention conflicts, then say what should be checked next. "
            "Use natural paragraphs, not metric dumps. Return narrative sections in the fixed key order. "
            "If the deterministic profile/cluster/evidence text is already useful, you may refine it but do not contradict it."
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
