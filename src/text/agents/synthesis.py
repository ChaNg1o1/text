"""Synthesis Agent -- integrates findings from all discipline agents."""

from __future__ import annotations

import json
import logging
from typing import Any

from text.ingest.schema import (
    AgentFinding,
    AgentReport,
    AnalysisRequest,
    ForensicReport,
)

from .stylometry import _call_llm, _parse_findings

logger = logging.getLogger(__name__)


def _coerce_to_strings(items: list) -> list[str]:
    """Convert a list of mixed str/dict items into a list of plain strings."""
    result: list[str] = []
    for item in items:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            # Best-effort: use 'description', 'message', or 'action' key if present,
            # otherwise fall back to a compact JSON representation.
            text = (
                item.get("description")
                or item.get("message")
                or item.get("action")
                or json.dumps(item, ensure_ascii=False)
            )
            result.append(str(text))
        else:
            result.append(str(item))
    return result

_DEFAULT_MODEL = "claude-sonnet-4-20250514"


class SynthesisAgent:
    """Integrates multi-disciplinary findings into a coherent forensic report."""

    SYSTEM_PROMPT = """\
You are a senior forensic analyst specializing in synthesizing multi-disciplinary \
linguistic evidence into unified forensic conclusions. You have extensive experience \
serving as an expert witness and producing reports that meet evidentiary standards. \
Your role is to integrate findings from four specialist agents -- Stylometry, \
Psycholinguistics, Computational Linguistics, and Sociolinguistics -- into a single \
coherent assessment.

Your synthesis methodology follows these principles:

1. **Evidence Triangulation**
   - A conclusion is strongest when supported by independent evidence from multiple \
disciplines. For example, same-author attribution is most confident when stylometric \
fingerprinting, semantic similarity, psychological consistency, AND social identity \
markers all converge.
   - Single-discipline findings carry less weight and should be presented as \
suggestive rather than conclusive.
   - Quantify the degree of cross-discipline support for each major conclusion.

2. **Contradiction Resolution**
   - When agents disagree, do not simply average or ignore. Explicitly identify the \
contradiction, analyze possible explanations (e.g., genuine authorship vs topic shift \
vs deliberate disguise), and assign adjusted confidence.
   - Common legitimate explanations for contradictions include: genre/register shifts, \
temporal evolution of writing style, collaborative authorship, and translated content.
   - Flag unresolvable contradictions transparently.

3. **Confidence Calibration**
   - Overall confidence should reflect the WEAKEST link in the evidence chain, not \
the average. If three agents agree at 0.9 but one contradicts at 0.8, the true \
confidence is significantly reduced.
   - Consider the base rate: in most forensic contexts, false positives are more \
harmful than false negatives. Err on the side of caution.
   - Explicitly state what would increase or decrease your confidence.

4. **Task-Specific Synthesis**
   - ATTRIBUTION: Focus on distinctive authorial markers, cross-text consistency, \
and discriminating features. Provide a ranked list of attribution hypotheses.
   - PROFILING: Synthesize demographic and psychological indicators into a coherent \
author profile. Distinguish between high-confidence and speculative inferences.
   - SOCKPUPPET: Compare across alleged-different-author texts for hidden similarity. \
Look for stylistic DNA that persists despite surface-level disguise attempts.
   - FULL: Provide comprehensive analysis covering all angles.

5. **Report Structure**
   Your synthesis output must include:
   - A narrative summary (2-4 paragraphs) of the overall findings.
   - Confidence scores for each major conclusion (0.0-1.0).
   - A list of specific contradictions between agents (if any).
   - Actionable recommendations for the investigator.

6. **Epistemic Humility**
   - Clearly distinguish between what the evidence shows and what you infer. \
Use language like "the evidence is consistent with" rather than "the evidence proves."
   - Acknowledge limitations: small sample size, missing context, feature extraction \
errors, and the inherent probabilistic nature of linguistic analysis.
   - Never overstate the certainty of conclusions.

**Output Requirements:**
Provide your synthesis as a JSON object with the following fields:
- "summary": string -- the narrative synthesis (2-4 paragraphs)
- "confidence_scores": object -- { "conclusion_name": float } for each major conclusion
- "contradictions": array of strings -- each describing a specific inter-agent disagreement
- "recommendations": array of strings -- actionable next steps for the investigator
- "findings": array of finding objects, each with:
  - "category": one of "attribution", "profiling", "sockpuppet", "methodology", "limitation"
  - "description": string
  - "confidence": float
  - "evidence": array of strings (referencing specific agent findings)

Return ONLY the JSON object, no other text.

**IMPORTANT: Language Requirement**
You MUST write ALL text content (synthesis narrative, contradictions, recommendations, \
finding descriptions, evidence, and any other free-text fields) in Simplified Chinese \
(简体中文). Keep JSON keys, category identifiers, and confidence_scores dimension \
names in English. Numerical values remain as numbers. Only the human-readable text \
should be in Chinese.
"""

    def __init__(
        self,
        model: str = _DEFAULT_MODEL,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.model = model
        self.api_base = api_base
        self.api_key = api_key

    async def synthesize(
        self,
        agent_reports: list[AgentReport],
        request: AnalysisRequest,
    ) -> ForensicReport:
        """Synthesize all agent findings into a final forensic report."""
        user_prompt = self._build_prompt(agent_reports, request)

        try:
            raw_response = await _call_llm(
                self.SYSTEM_PROMPT, user_prompt, self.model,
                api_base=self.api_base, api_key=self.api_key,
            )
        except Exception:
            logger.exception("SynthesisAgent LLM call failed")
            return ForensicReport(
                request=request,
                agent_reports=agent_reports,
                synthesis="由于 LLM 调用失败，综合分析未完成。各代理的独立报告仍然可用。",
                confidence_scores={},
                contradictions=[],
                recommendations=["请人工审阅各代理的独立报告。"],
            )

        return self._parse_synthesis(raw_response, agent_reports, request)

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        agent_reports: list[AgentReport],
        request: AnalysisRequest,
    ) -> str:
        sections: list[str] = []

        # Task context.
        sections.append(
            f"## Analysis Task\n"
            f"- Task type: {request.task.value}\n"
            f"- Number of texts: {len(request.texts)}\n"
            f"- Text IDs: {', '.join(t.id for t in request.texts)}\n"
            f"- Authors claimed: {', '.join(sorted({t.author for t in request.texts}))}\n"
        )

        if request.compare_groups:
            groups_str = "; ".join(
                f"Group {i+1}: [{', '.join(g)}]" for i, g in enumerate(request.compare_groups)
            )
            sections.append(f"- Comparison groups: {groups_str}\n")

        # Agent reports.
        for report in agent_reports:
            lines = [
                f"## Agent Report: {report.agent_name} ({report.discipline})",
                f"**Summary:** {report.summary}",
                f"**Number of findings:** {len(report.findings)}",
            ]

            for j, finding in enumerate(report.findings, 1):
                evidence_str = "; ".join(finding.evidence[:5]) if finding.evidence else "(none)"
                lines.append(
                    f"\n### Finding {j}: [{finding.category}] "
                    f"(confidence: {finding.confidence:.2f})\n"
                    f"{finding.description}\n"
                    f"Evidence: {evidence_str}"
                )

            sections.append("\n".join(lines))

        # Instruction.
        sections.append(
            f"Synthesize the above {len(agent_reports)} agent reports into a unified "
            f"forensic assessment for the '{request.task.value}' task. "
            f"Identify convergences, contradictions, and overall conclusions. "
            f"Provide calibrated confidence scores and actionable recommendations. "
            f"Return your synthesis as a JSON object."
        )

        return "\n\n".join(sections)

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _parse_synthesis(
        self,
        raw: str,
        agent_reports: list[AgentReport],
        request: AnalysisRequest,
    ) -> ForensicReport:
        """Parse the LLM synthesis response into a ForensicReport."""
        text = raw.strip()
        if text.startswith("```"):
            first_newline = text.index("\n")
            last_fence = text.rfind("```")
            text = text[first_newline + 1 : last_fence].strip()

        try:
            data: dict[str, Any] = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse synthesis JSON; using raw text as summary")
            return ForensicReport(
                request=request,
                agent_reports=agent_reports,
                synthesis=raw[:3000],
                confidence_scores={},
                contradictions=[],
                recommendations=["综合分析输出无法结构化解析，请人工审阅原始文本。"],
            )

        # Extract synthesis fields.
        summary = data.get("summary", "")
        confidence_scores = data.get("confidence_scores", {})

        # LLM may return contradictions/recommendations as dicts or strings;
        # coerce everything to strings for the ForensicReport schema.
        contradictions = _coerce_to_strings(data.get("contradictions", []))
        recommendations = _coerce_to_strings(data.get("recommendations", []))

        # Parse nested findings if present.
        synthesis_findings: list[AgentFinding] = []
        for item in data.get("findings", []):
            try:
                synthesis_findings.append(
                    AgentFinding(
                        discipline="synthesis",
                        category=item.get("category", "unknown"),
                        description=item.get("description", ""),
                        confidence=float(item.get("confidence", 0.5)),
                        evidence=item.get("evidence", []),
                    )
                )
            except (ValueError, TypeError):
                logger.warning("Skipping malformed synthesis finding")

        # Build the synthesis agent's own report and include it.
        synthesis_report = AgentReport(
            agent_name="synthesis",
            discipline="synthesis",
            findings=synthesis_findings,
            summary=summary[:500] if summary else "综合分析完成。",
            raw_llm_response=raw,
        )

        all_reports = list(agent_reports) + [synthesis_report]

        return ForensicReport(
            request=request,
            agent_reports=all_reports,
            synthesis=summary,
            confidence_scores=confidence_scores,
            contradictions=contradictions,
            recommendations=recommendations,
        )
