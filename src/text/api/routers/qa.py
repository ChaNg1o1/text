"""SSE QA endpoint for asking questions about completed analysis reports."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from text.api.config import Settings
from text.api.deps import get_settings, get_store
from text.api.models import AnalysisStatus
from text.api.services.analysis_store import AnalysisStore
from text.ingest.schema import AgentFinding, AgentReport, ForensicReport
from text.llm.backend import LLMBackend

router = APIRouter(prefix="/api/v1", tags=["qa"])
STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


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
        "# Synthesis",
        _truncate(report.synthesis or "(none)", 1200),
        "",
    ]

    if report.contradictions:
        lines.append("# Contradictions")
        lines.extend(f"- {_truncate(item, 240)}" for item in report.contradictions[:10])
        lines.append("")

    if report.recommendations:
        lines.append("# Recommendations")
        lines.extend(f"- {_truncate(item, 240)}" for item in report.recommendations[:10])
        lines.append("")

    if report.confidence_scores:
        lines.append("# Confidence Scores")
        for key, value in sorted(report.confidence_scores.items()):
            lines.append(f"- {key}: {value:.2f}")
        lines.append("")

    if report.anomaly_samples:
        lines.append("# Anomaly Samples")
        for sample in report.anomaly_samples[:5]:
            lines.append(f"- text_id={sample.text_id}, outlier_dims={len(sample.outlier_dimensions)}")
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


async def _generate_answer(
    question: str,
    backend_name: str,
    report: ForensicReport,
    settings: Settings,
) -> str:
    backend = LLMBackend(backend=backend_name, config_path=settings.backends_config)
    context = _build_report_context(report)
    system_prompt = (
        "You are a forensic analysis assistant. "
        "Answer only using the provided analysis context from agent results. "
        "If context is insufficient, say so explicitly. "
        "Use concise, factual language and cite agent names or evidence snippets when relevant."
    )
    user_prompt = (
        "Use the following analysis context to answer the question.\n\n"
        f"{context}\n\n"
        f"Question: {question}\n"
        "Answer in the same language as the question when possible."
    )
    answer = await backend.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=1200,
    )
    return answer.strip() or "I could not derive an answer from the current analysis context."


_QA_HEARTBEAT_INTERVAL: float = 8.0


async def _generate_with_heartbeat(
    question: str,
    backend_name: str,
    report: ForensicReport,
    settings: Settings,
    heartbeat_queue: asyncio.Queue[str | None],
) -> str:
    """Run LLM generation while emitting heartbeat sentinels into *heartbeat_queue*.

    The queue receives empty strings as heartbeat ticks, and ``None`` as the
    completion sentinel.
    """
    generation_task = asyncio.create_task(
        _generate_answer(question, backend_name, report, settings)
    )

    async def _heartbeat_loop() -> None:
        while not generation_task.done():
            await asyncio.sleep(_QA_HEARTBEAT_INTERVAL)
            if not generation_task.done():
                try:
                    heartbeat_queue.put_nowait("")
                except asyncio.QueueFull:
                    pass

    heartbeat_task = asyncio.create_task(_heartbeat_loop())
    try:
        answer = await generation_task
    finally:
        heartbeat_task.cancel()
        try:
            heartbeat_queue.put_nowait(None)
        except asyncio.QueueFull:
            pass
    return answer


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

        try:
            heartbeat_queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=8)
            gen_task = asyncio.create_task(
                _generate_with_heartbeat(
                    question=clean_question,
                    backend_name=detail.llm_backend,
                    report=detail.report,
                    settings=settings,
                    heartbeat_queue=heartbeat_queue,
                )
            )

            # Drain heartbeat queue while LLM is working.
            while True:
                sentinel = await heartbeat_queue.get()
                if sentinel is None:
                    break
                yield _sse("qa_heartbeat", {"timestamp": time.time()})

            answer = await gen_task

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

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )
