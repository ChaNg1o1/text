"""SSE QA endpoint for asking questions about completed analysis reports."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from uuid import uuid4
from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from text.agents.json_utils import parse_json_object_loose
from text.app_settings import AppSettingsStore, apply_prompt_override
from text.api.config import Settings
from text.api.deps import get_settings, get_store
from text.api.models import AnalysisStatus, QaSuggestionsRequest, QaSuggestionsResponse
from text.api.services.analysis_store import AnalysisStore
from text.ingest.schema import AgentFinding, AgentReport, ForensicReport
from text.llm.backend import LLMBackend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["qa"])
STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}
UI_MESSAGE_STREAM_HEADERS = {
    **STREAM_HEADERS,
    "x-vercel-ai-ui-message-stream": "v1",
}
GENERATION_HEARTBEAT_SECONDS = 5.0

# ---------------------------------------------------------------------------
# Visualization tool definitions (OpenAI function-calling format)
# ---------------------------------------------------------------------------

QA_VISUALIZATION_TOOLS: list[dict[str, object]] = [
    {
        "type": "function",
        "function": {
            "name": "displayChart",
            "description": (
                "Display a line chart or bar chart. Use bar charts for categorical "
                "comparisons (e.g. feature values per author), line charts for trends "
                "or ordered sequences."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "chartType": {
                        "type": "string",
                        "enum": ["line", "bar"],
                    },
                    "title": {"type": "string"},
                    "data": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "Array of data points with xKey and yKeys fields",
                    },
                    "xKey": {"type": "string", "description": "Key for x-axis labels"},
                    "yKeys": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Keys for y-axis numeric series",
                    },
                    "yLabels": {
                        "type": "object",
                        "additionalProperties": {"type": "string"},
                        "description": "Optional display labels for yKeys",
                    },
                },
                "required": ["chartType", "title", "data", "xKey", "yKeys"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "displayRadar",
            "description": (
                "Display a radar chart for multi-dimensional profile comparison. "
                "Ideal for comparing writing style dimensions across authors."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "dimensions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Dimension labels around the radar",
                    },
                    "series": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "values": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                },
                            },
                            "required": ["name", "values"],
                        },
                        "description": "One entry per subject/author",
                    },
                },
                "required": ["title", "dimensions", "series"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "displayTable",
            "description": (
                "Display structured data in a table. Ideal for evidence lists, "
                "feature comparisons, or any multi-column data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "headers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": {"type": "string"},
                                "label": {"type": "string"},
                            },
                            "required": ["key", "label"],
                        },
                    },
                    "rows": {
                        "type": "array",
                        "items": {"type": "object"},
                    },
                },
                "required": ["title", "headers", "rows"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "displayHeatmap",
            "description": (
                "Display a heatmap for similarity or correlation matrices. "
                "Ideal for pairwise text similarity or feature correlation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "rowLabels": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "colLabels": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "matrix": {
                        "type": "array",
                        "items": {
                            "type": "array",
                            "items": {"type": "number"},
                        },
                        "description": "2D numeric matrix [rows][cols]",
                    },
                    "minValue": {"type": "number", "description": "Optional scale minimum"},
                    "maxValue": {"type": "number", "description": "Optional scale maximum"},
                },
                "required": ["title", "rowLabels", "colLabels", "matrix"],
            },
        },
    },
]

TOOL_SYSTEM_PROMPT = (
    "You are a text investigation assistant. "
    "Answer the user's question based ONLY on the provided analysis report context. "
    "If the context is insufficient, say so explicitly.\n\n"
    "When your answer involves numerical comparisons, feature distributions, score "
    "comparisons, writing profile dimensions, similarity relationships, or structured "
    "lists of data, use the available visualization tools to present the information "
    "graphically. Always provide a text explanation alongside any visualization.\n\n"
    "Guidelines for tool usage:\n"
    "- displayChart (bar): compare values across categories or authors\n"
    "- displayChart (line): show trends or ordered sequences\n"
    "- displayRadar: compare multi-dimensional writing profiles\n"
    "- displayTable: structured lists with multiple columns\n"
    "- displayHeatmap: similarity or correlation matrices\n"
    "- Derive all data values from the report context; do not invent numbers\n"
    "- Use the same language as the user's question\n"
    "- Cite agent names or evidence IDs when relevant"
)

# Fallback prompt for providers that do not support native tool/function calling.
# Instructs the LLM to embed visualization data as fenced JSON code blocks.
JSON_FALLBACK_SYSTEM_PROMPT = (
    "You are a text investigation assistant. "
    "Answer the user's question based ONLY on the provided analysis report context. "
    "If the context is insufficient, say so explicitly.\n\n"
    "VISUALIZATION INSTRUCTIONS:\n"
    "When your answer involves numerical data, comparisons, profiles, or structured data, "
    "embed visualization data as fenced JSON code blocks (triple backtick json). "
    'Each JSON block must contain a "toolName" field. '
    "Do NOT generate Python code, matplotlib, or any programming code — ONLY JSON blocks.\n\n"
    "Available visualization types and their required JSON fields:\n\n"
    "displayChart — bar or line chart:\n"
    '  toolName, chartType ("bar" or "line"), title, data (array of objects), '
    "xKey (string), yKeys (array of strings), yLabels (optional object)\n\n"
    "displayRadar — radar/spider chart:\n"
    "  toolName, title, dimensions (array of strings), "
    "series (array of {name, values})\n\n"
    "displayTable — data table:\n"
    "  toolName, title, headers (array of {key, label}), rows (array of objects)\n\n"
    "displayHeatmap — heatmap matrix:\n"
    "  toolName, title, rowLabels, colLabels, matrix (2D number array)\n\n"
    "Guidelines:\n"
    "- Derive all data values from the report context; do not invent numbers\n"
    "- Always provide text explanation alongside visualizations\n"
    "- Use the same language as the user's question\n"
    "- Cite agent names or evidence IDs when relevant"
)

_VALID_TOOL_NAMES = frozenset(
    {
        "displayChart",
        "displayRadar",
        "displayTable",
        "displayHeatmap",
    }
)
_JSON_FENCE_RE = re.compile(r"```json\s*\n(.*?)```", re.DOTALL)


def _extract_embedded_tools(text: str) -> tuple[str, list[dict[str, object]]]:
    """Extract JSON visualization blocks embedded in LLM text response.

    Scans for fenced ``json`` code blocks whose parsed content includes a
    recognised ``toolName``.  Matched blocks are removed from the text and
    returned as tool-result dicts compatible with the streaming protocol.
    """
    tool_results: list[dict[str, object]] = []

    def _replace(match: re.Match[str]) -> str:
        raw_json = match.group(1).strip()
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError:
            return match.group(0)

        if not isinstance(data, dict) or data.get("toolName") not in _VALID_TOOL_NAMES:
            return match.group(0)

        tool_name = str(data.pop("toolName"))
        tool_results.append(
            {
                "toolCallId": f"call_{uuid4().hex[:12]}",
                "toolName": tool_name,
                "input": data,
                "output": data,
            }
        )
        return ""

    cleaned = _JSON_FENCE_RE.sub(_replace, text).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned, tool_results


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _ui_stream_part(data: object) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _truncate(text: str, limit: int = 220) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "..."


def _finding_lines(finding: AgentFinding) -> list[str]:
    lines = [
        f"- [{finding.discipline}] {finding.category} "
        f"(confidence={finding.confidence:.2f}): {_truncate(finding.description)}"
    ]
    if finding.evidence:
        evidence_preview = "; ".join(_truncate(item, 140) for item in finding.evidence[:2])
        lines.append(f"  evidence: {evidence_preview}")
    return lines


def _agent_section(report: AgentReport) -> str:
    lines: list[str] = [
        f"## Agent: {report.agent_name} ({report.discipline})",
        f"Summary: {_truncate(report.summary, 320)}" if report.summary else "Summary: (none)",
        f"Findings: {len(report.findings)}",
    ]
    for finding in report.findings[:8]:
        lines.extend(_finding_lines(finding))
    return "\n".join(lines)


def _build_report_context(report: ForensicReport) -> str:
    lines: list[str] = [
        "# Analysis Context",
        f"Task: {report.request.task.value}",
        f"Texts: {len(report.request.texts)}",
        f"LLM Backend: {report.request.llm_backend}",
        "",
        "# Summary",
        _truncate(report.summary or "(none)", 1200),
        "",
    ]

    if report.narrative:
        lines.append("# Narrative")
        lines.append(_truncate(report.narrative.lead, 400))
        for section in report.narrative.sections[:5]:
            lines.append(f"- [{section.key}] {section.title}: {_truncate(section.summary, 260)}")
        if report.narrative.action_items:
            lines.append("- action_items: " + "; ".join(report.narrative.action_items[:5]))
        if report.narrative.contradictions:
            lines.append("- contradictions: " + "; ".join(report.narrative.contradictions[:5]))
        lines.append("")

    if report.conclusions:
        lines.append("# Conclusions")
        for conclusion in report.conclusions[:10]:
            lines.append(
                f"- [{conclusion.grade.value}] {conclusion.statement} "
                f"(task={conclusion.task.value}, score={conclusion.score if conclusion.score is not None else 'n/a'})"
            )
        lines.append("")

    if report.limitations:
        lines.append("# Limitations")
        lines.extend(f"- {_truncate(item, 240)}" for item in report.limitations[:10])
        lines.append("")

    if report.evidence_items:
        lines.append("# Evidence Items")
        for item in report.evidence_items[:10]:
            lines.append(
                f"- {item.evidence_id}: {_truncate(item.summary, 180)} | "
                f"finding={_truncate(item.finding or item.summary, 180)} | "
                f"why={_truncate(item.why_it_matters, 180)}"
            )
        lines.append("")

    if report.anomaly_samples:
        lines.append("# Anomaly Samples")
        for sample in report.anomaly_samples[:5]:
            lines.append(
                f"- text_id={sample.text_id}, outlier_dims={len(sample.outlier_dimensions)}"
            )
        lines.append("")

    if report.results:
        lines.append("# Results")
        for result in report.results[:10]:
            marker = "interpretive" if result.interpretive_opinion else "deterministic"
            lines.append(f"- [{marker}] {result.title}: {_truncate(result.body, 220)}")
        lines.append("")

    if report.writing_profiles:
        lines.append("# Writing Profiles")
        for profile in report.writing_profiles[:5]:
            lines.append(
                f"- {profile.subject}: {_truncate(profile.headline or profile.summary, 120)}"
            )
            if profile.observable_summary:
                lines.append(f"  observable={_truncate(profile.observable_summary, 240)}")
            if profile.stable_habits:
                lines.append(
                    "  stable_habits="
                    + "; ".join(_truncate(item, 100) for item in profile.stable_habits[:3])
                )
            if profile.process_clues:
                lines.append(
                    "  process_clues="
                    + "; ".join(_truncate(item, 100) for item in profile.process_clues[:2])
                )
        lines.append("")

    if report.cluster_view and report.cluster_view.clusters:
        lines.append("# Cluster View")
        for cluster in report.cluster_view.clusters[:6]:
            lines.append(
                f"- {cluster.label}: {_truncate(cluster.theme_summary, 220)} "
                f"(members={', '.join(cluster.member_aliases[:8])})"
            )
            if cluster.separation_summary:
                lines.append(f"  separation={_truncate(cluster.separation_summary, 200)}")
        lines.append("")

    lines.append("# Agent Reports")
    if report.agent_reports:
        for agent_report in report.agent_reports:
            lines.append(_agent_section(agent_report))
            lines.append("")
    else:
        lines.append("(no agent reports)")

    return "\n".join(lines).strip()


def _chunk_text(text: str, target_size: int = 64) -> Iterator[str]:
    words = text.split()
    if not words:
        return

    buf: list[str] = []
    size = 0
    for word in words:
        next_size = size + len(word) + (1 if buf else 0)
        if buf and next_size > target_size:
            yield " ".join(buf) + " "
            buf = [word]
            size = len(word)
            continue

        buf.append(word)
        size = next_size

    if buf:
        yield " ".join(buf)


def _extract_text_from_ui_message(message: object) -> str:
    if not isinstance(message, dict):
        return ""

    parts = message.get("parts")
    if isinstance(parts, list):
        text_parts: list[str] = []
        for part in parts:
            if not isinstance(part, dict) or part.get("type") != "text":
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())
        if text_parts:
            return "\n".join(text_parts).strip()

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    return ""


def _extract_latest_question(messages: object) -> str:
    if not isinstance(messages, list):
        return ""

    for message in reversed(messages):
        if not isinstance(message, dict):
            continue
        if message.get("role") != "user":
            continue
        text = _extract_text_from_ui_message(message)
        if text:
            return text
    return ""


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


def _qa_snapshot_data(*, report: ForensicReport, backend_name: str) -> dict[str, object]:
    top_conclusion = report.conclusions[0].statement if report.conclusions else None
    return {
        "summary": _truncate(report.summary or "(none)", 280),
        "topConclusion": _truncate(top_conclusion, 180) if top_conclusion else None,
        "backend": backend_name,
        "evidenceCount": len(report.evidence_items),
        "limitationCount": len(report.limitations),
        "agentCount": len(report.agent_reports),
    }


def _qa_focus_data(report: ForensicReport, question: str) -> dict[str, object] | None:
    if (
        _contains_any(
            question, ("limit", "risk", "uncertain", "careful", "caution", "限制", "风险", "小心")
        )
        and report.limitations
    ):
        return {
            "mode": "limitations",
            "items": [
                {"label": f"#{index}", "detail": _truncate(item, 180)}
                for index, item in enumerate(report.limitations[:3], start=1)
            ],
        }

    if _contains_any(question, ("anomaly", "outlier", "异常", "偏离")) and report.anomaly_samples:
        items: list[dict[str, str]] = []
        for sample in report.anomaly_samples[:3]:
            top_dimensions = list(sample.outlier_dimensions.items())[:2]
            detail = ", ".join(f"{key}={value:.2f}" for key, value in top_dimensions)
            items.append(
                {
                    "label": sample.text_id,
                    "detail": detail or _truncate(sample.content, 140),
                    "accent": str(len(sample.outlier_dimensions)),
                }
            )
        return {"mode": "anomalies", "items": items}

    if (
        _contains_any(
            question,
            ("evidence", "support", "why", "basis", "依据", "证据", "支撑", "为什么"),
        )
        and report.evidence_items
    ):
        return {
            "mode": "evidence",
            "items": [
                {
                    "label": item.label or item.evidence_id,
                    "detail": _truncate(item.why_it_matters or item.summary, 180),
                    "accent": item.strength or "supporting",
                }
                for item in report.evidence_items[:3]
            ],
        }

    if (
        _contains_any(question, ("profile", "habit", "style", "画像", "习惯", "风格"))
        and report.writing_profiles
    ):
        return {
            "mode": "profiles",
            "items": [
                {
                    "label": profile.subject,
                    "detail": _truncate(
                        profile.headline or profile.observable_summary or profile.summary,
                        180,
                    ),
                }
                for profile in report.writing_profiles[:3]
            ],
        }

    if report.conclusions:
        return {
            "mode": "conclusions",
            "items": [
                {
                    "label": f"#{index}",
                    "detail": _truncate(conclusion.statement, 180),
                    "accent": conclusion.grade.value.replace("_", " "),
                }
                for index, conclusion in enumerate(report.conclusions[:3], start=1)
            ],
        }

    if report.results:
        return {
            "mode": "summary",
            "items": [
                {
                    "label": result.title,
                    "detail": _truncate(result.body, 180),
                    "accent": "interpretive" if result.interpretive_opinion else "deterministic",
                }
                for result in report.results[:3]
            ],
        }

    return None


def _fallback_suggestions(report: ForensicReport, *, count: int, exclude: list[str]) -> list[str]:
    excluded = {item.strip() for item in exclude if item.strip()}
    suggestions: list[str] = []

    if report.conclusions:
        suggestions.append("先用最简单的话告诉我，这次结论到底偏向什么？")
        suggestions.append("这个结果更像是‘有线索’还是‘基本能确定’？")
    if report.evidence_items:
        suggestions.append("最关键的三条依据分别是什么？")
    if report.limitations:
        suggestions.append("这份结果最需要小心的地方是什么？")
    if report.writing_profiles:
        suggestions.append("从写作习惯上看，这个人最明显的特征是什么？")
    if report.anomaly_samples:
        suggestions.append("有哪些异常文本值得我单独再看一遍？")
    suggestions.append("如果我要把这份报告讲给非专业同事听，应该怎么说？")

    unique: list[str] = []
    for item in suggestions:
        normalized = item.strip()
        if not normalized or normalized in excluded or normalized in unique:
            continue
        unique.append(normalized)
        if len(unique) >= count:
            break
    return unique


async def _generate_suggestions(
    *,
    backend_name: str,
    report: ForensicReport,
    settings: Settings,
    count: int,
    exclude: list[str],
) -> list[str]:
    backend = LLMBackend(backend=backend_name, config_path=settings.backends_config)
    app_settings = AppSettingsStore(settings.app_settings_config).load()
    context = _build_report_context(report)
    cleaned_exclude = [item.strip() for item in exclude if item.strip()]
    system_prompt = (
        "You generate concise, user-friendly follow-up questions for a completed text forensics report. "
        "The audience is non-expert users. Questions must be easy to understand, actionable, and answerable "
        "using only the current report context. Avoid raw metric names unless necessary. Prefer Chinese unless "
        "the report is clearly in another language. Return ONLY JSON with a top-level key 'suggestions'."
    )
    system_prompt = apply_prompt_override(system_prompt, app_settings.prompt_overrides.qa)
    user_prompt = (
        "Based on the following report context, generate fresh follow-up questions.\n\n"
        f"{context}\n\n"
        f"Need exactly {count} short questions.\n"
        f"Avoid repeating these questions: {cleaned_exclude or ['(none)']}.\n"
        'Return JSON in the form {"suggestions": ["...", "..."]}.'
    )
    raw = await backend.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=max(app_settings.analysis_defaults.qa_temperature, 0.7),
        max_tokens=min(app_settings.analysis_defaults.qa_max_tokens, 400),
    )
    parsed = parse_json_object_loose(raw)
    if parsed is None:
        return _fallback_suggestions(report, count=count, exclude=exclude)

    suggestions_raw = parsed.value.get("suggestions", [])
    if not isinstance(suggestions_raw, list):
        return _fallback_suggestions(report, count=count, exclude=exclude)

    normalized: list[str] = []
    excluded = {item.strip() for item in exclude if item.strip()}
    for item in suggestions_raw:
        text = str(item).strip()
        if not text or text in excluded or text in normalized:
            continue
        normalized.append(text)
        if len(normalized) >= count:
            break

    return normalized or _fallback_suggestions(report, count=count, exclude=exclude)


async def _generate_answer(
    question: str,
    backend_name: str,
    report: ForensicReport,
    settings: Settings,
) -> str:
    backend = LLMBackend(backend=backend_name, config_path=settings.backends_config)
    app_settings = AppSettingsStore(settings.app_settings_config).load()
    context = _build_report_context(report)
    system_prompt = (
        "You are a forensic analysis assistant. "
        "Answer only using the provided analysis context from agent results. "
        "If context is insufficient, say so explicitly. "
        "Use concise, factual language and cite agent names or evidence snippets when relevant."
    )
    system_prompt = apply_prompt_override(system_prompt, app_settings.prompt_overrides.qa)
    user_prompt = (
        "Use the following analysis context to answer the question.\n\n"
        f"{context}\n\n"
        f"Question: {question}\n"
        "Answer in the same language as the question when possible."
    )
    answer = await backend.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=app_settings.analysis_defaults.qa_temperature,
        max_tokens=app_settings.analysis_defaults.qa_max_tokens,
    )
    return answer.strip() or "I could not derive an answer from the current analysis context."


async def _generate_answer_with_tools(
    question: str,
    backend_name: str,
    report: ForensicReport,
    settings: Settings,
) -> tuple[str, list[dict[str, object]]]:
    """Call LLM with visualization tools. Returns (text, tool_results).

    Each tool_results entry:
    {"toolCallId": str, "toolName": str, "input": dict, "output": dict}.
    Tries native tool-calling first; falls back to JSON-in-text extraction
    when the provider does not support function calling.
    """
    backend = LLMBackend(backend=backend_name, config_path=settings.backends_config)
    app_settings = AppSettingsStore(settings.app_settings_config).load()
    context = _build_report_context(report)
    user_prompt = "Analysis report context:\n\n" f"{context}\n\n" f"Question: {question}"

    # --- Attempt 1: native tool-calling ---
    try:
        system_prompt = apply_prompt_override(
            TOOL_SYSTEM_PROMPT,
            app_settings.prompt_overrides.qa,
        )
        response = await backend.complete_with_tools(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=QA_VISUALIZATION_TOOLS,
            temperature=app_settings.analysis_defaults.qa_temperature,
            max_tokens=app_settings.analysis_defaults.qa_max_tokens,
        )
        message = response.choices[0].message
        text_content = (message.content or "").strip()
        tool_results: list[dict[str, object]] = []

        if message.tool_calls:
            for tool_call in message.tool_calls:
                try:
                    args = json.loads(tool_call.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    continue
                tool_results.append(
                    {
                        "toolCallId": tool_call.id,
                        "toolName": tool_call.function.name,
                        "input": args,
                        "output": args,
                    }
                )

        if not text_content and not tool_results:
            text_content = "I could not derive an answer from the current analysis context."
        return text_content, tool_results
    except Exception:
        logger.debug("Native tool-calling unavailable, using JSON fallback", exc_info=True)

    # --- Attempt 2: JSON-in-text fallback ---
    fallback_prompt = apply_prompt_override(
        JSON_FALLBACK_SYSTEM_PROMPT,
        app_settings.prompt_overrides.qa,
    )
    try:
        raw_answer = await backend.complete(
            system_prompt=fallback_prompt,
            user_prompt=user_prompt,
            temperature=app_settings.analysis_defaults.qa_temperature,
            max_tokens=app_settings.analysis_defaults.qa_max_tokens,
        )
    except Exception:
        raw_answer = await _generate_answer(question, backend_name, report, settings)
        return raw_answer, []

    cleaned_text, embedded_tools = _extract_embedded_tools(raw_answer)
    if not cleaned_text and not embedded_tools:
        cleaned_text = "I could not derive an answer from the current analysis context."
    return cleaned_text, embedded_tools


@router.post("/analyses/{analysis_id}/qa/chat")
async def chat_report_qa(
    analysis_id: str,
    payload: dict[str, object] = Body(...),
    store: AnalysisStore = Depends(get_store),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if detail.status != AnalysisStatus.COMPLETED or detail.report is None:
        raise HTTPException(status_code=409, detail="Analysis report is not available for QA")

    raw_messages = payload.get("messages")
    question = _extract_latest_question(raw_messages)
    clean_question = question.strip()
    if not clean_question:
        raise HTTPException(status_code=422, detail="Question cannot be empty")
    if len(clean_question) > 1200:
        raise HTTPException(status_code=422, detail="Question is too long")

    async def _stream() -> AsyncIterator[str]:
        message_id = f"msg_{uuid4().hex}"
        generation_task: asyncio.Task[tuple[str, list[dict[str, object]]]] | None = None

        yield _ui_stream_part({"type": "start", "messageId": message_id})
        yield _ui_stream_part(
            {
                "type": "data-reportSnapshot",
                "data": _qa_snapshot_data(
                    report=detail.report,
                    backend_name=detail.llm_backend,
                ),
            }
        )
        focus_data = _qa_focus_data(detail.report, clean_question)
        if focus_data is not None:
            yield _ui_stream_part({"type": "data-reportFocus", "data": focus_data})

        try:
            generation_task = asyncio.create_task(
                _generate_answer_with_tools(
                    question=clean_question,
                    backend_name=detail.llm_backend,
                    report=detail.report,
                    settings=settings,
                )
            )

            while True:
                try:
                    text_content, tool_results = await asyncio.wait_for(
                        asyncio.shield(generation_task),
                        timeout=GENERATION_HEARTBEAT_SECONDS,
                    )
                    break
                except asyncio.TimeoutError:
                    await asyncio.sleep(0)

            # Emit tool frames (UI Message Stream v1 protocol)
            for tool in tool_results:
                yield _ui_stream_part(
                    {
                        "type": "tool-input-start",
                        "toolCallId": tool["toolCallId"],
                        "toolName": tool["toolName"],
                    }
                )
                yield _ui_stream_part(
                    {
                        "type": "tool-input-available",
                        "toolCallId": tool["toolCallId"],
                        "toolName": tool["toolName"],
                        "input": tool["input"],
                    }
                )
                yield _ui_stream_part(
                    {
                        "type": "tool-output-available",
                        "toolCallId": tool["toolCallId"],
                        "output": tool["output"],
                    }
                )

            # Emit text content
            if text_content:
                text_id = f"text_{uuid4().hex}"
                yield _ui_stream_part({"type": "text-start", "id": text_id})
                for chunk in _chunk_text(text_content):
                    yield _ui_stream_part({"type": "text-delta", "id": text_id, "delta": chunk})
                    await asyncio.sleep(0)
                yield _ui_stream_part({"type": "text-end", "id": text_id})

            yield _ui_stream_part({"type": "finish", "finishReason": "stop"})
        except Exception as exc:
            yield _ui_stream_part({"type": "error", "errorText": str(exc)})
            yield _ui_stream_part({"type": "finish", "finishReason": "error"})
        finally:
            if generation_task is not None and not generation_task.done():
                generation_task.cancel()
                try:
                    await generation_task
                except asyncio.CancelledError:
                    pass
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers=UI_MESSAGE_STREAM_HEADERS,
    )


@router.get("/analyses/{analysis_id}/qa/stream")
async def stream_report_qa(
    analysis_id: str,
    question: str = Query(..., min_length=1, max_length=1200),
    store: AnalysisStore = Depends(get_store),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """Stream QA answer chunks for a completed analysis report via SSE."""
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if detail.status != AnalysisStatus.COMPLETED or detail.report is None:
        raise HTTPException(status_code=409, detail="Analysis report is not available for QA")

    clean_question = question.strip()
    if not clean_question:
        raise HTTPException(status_code=422, detail="Question cannot be empty")

    async def _stream() -> AsyncIterator[str]:
        yield _sse(
            "qa_started",
            {
                "analysis_id": analysis_id,
                "question": clean_question,
                "timestamp": time.time(),
            },
        )

        generation_task: asyncio.Task[str] | None = None
        try:
            generation_task = asyncio.create_task(
                _generate_answer(
                    question=clean_question,
                    backend_name=detail.llm_backend,
                    report=detail.report,
                    settings=settings,
                )
            )
            while True:
                try:
                    answer = await asyncio.wait_for(
                        asyncio.shield(generation_task),
                        timeout=GENERATION_HEARTBEAT_SECONDS,
                    )
                    break
                except asyncio.TimeoutError:
                    yield _sse(
                        "qa_heartbeat",
                        {
                            "analysis_id": analysis_id,
                            "timestamp": time.time(),
                        },
                    )

            for chunk in _chunk_text(answer):
                yield _sse(
                    "qa_chunk",
                    {
                        "analysis_id": analysis_id,
                        "delta": chunk,
                        "timestamp": time.time(),
                    },
                )
                await asyncio.sleep(0)

            yield _sse(
                "qa_completed",
                {
                    "analysis_id": analysis_id,
                    "answer": answer,
                    "timestamp": time.time(),
                },
            )
        except Exception as exc:
            yield _sse(
                "qa_error",
                {
                    "analysis_id": analysis_id,
                    "detail": str(exc),
                    "timestamp": time.time(),
                },
            )
        finally:
            if generation_task is not None and not generation_task.done():
                generation_task.cancel()
                try:
                    await generation_task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )


@router.post("/analyses/{analysis_id}/qa/suggestions", response_model=QaSuggestionsResponse)
async def generate_report_qa_suggestions(
    analysis_id: str,
    body: QaSuggestionsRequest,
    store: AnalysisStore = Depends(get_store),
    settings: Settings = Depends(get_settings),
) -> QaSuggestionsResponse:
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if detail.status != AnalysisStatus.COMPLETED or detail.report is None:
        raise HTTPException(status_code=409, detail="Analysis report is not available for QA")

    try:
        suggestions = await _generate_suggestions(
            backend_name=detail.llm_backend,
            report=detail.report,
            settings=settings,
            count=body.count,
            exclude=body.exclude,
        )
    except Exception:
        suggestions = _fallback_suggestions(detail.report, count=body.count, exclude=body.exclude)

    return QaSuggestionsResponse(suggestions=suggestions)
