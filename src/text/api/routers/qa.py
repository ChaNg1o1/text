"""SSE QA endpoint for asking questions about completed analysis reports."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from text.agents.json_utils import parse_json_object_loose
from text.app_settings import AppSettingsStore, apply_prompt_override
from text.api.config import Settings
from text.api.deps import get_settings, get_store
from text.api.models import AnalysisStatus, QaSuggestionsRequest, QaSuggestionsResponse
from text.api.services.analysis_store import AnalysisStore
from text.ingest.schema import AgentFinding, AgentReport, ForensicReport
from text.llm.backend import LLMBackend

router = APIRouter(prefix="/api/v1", tags=["qa"])
STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}
GENERATION_HEARTBEAT_SECONDS = 5.0


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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
            lines.append(f"- {item.evidence_id}: {_truncate(item.summary, 200)}")
        lines.append("")

    if report.anomaly_samples:
        lines.append("# Anomaly Samples")
        for sample in report.anomaly_samples[:5]:
            lines.append(f"- text_id={sample.text_id}, outlier_dims={len(sample.outlier_dimensions)}")
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
            lines.append(f"- {profile.subject}: {_truncate(profile.summary, 200)}")
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
        "Return JSON in the form {\"suggestions\": [\"...\", \"...\"]}."
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
