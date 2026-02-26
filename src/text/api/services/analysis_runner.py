"""Background analysis runner with progress instrumentation.

Wraps the existing pipeline (FeatureExtractor + OrchestratorAgent) and emits
SSE events via ``ProgressManager`` without modifying the core modules.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import text.api.deps as deps
from text.api.models import AnalysisStatus
from text.api.services.analysis_store import AnalysisStore
from text.api.services.progress_manager import progress_manager
from text.ingest.schema import (
    AgentReport,
    AnalysisRequest,
    FeatureVector,
    ForensicReport,
)

logger = logging.getLogger(__name__)
_analysis_semaphore: asyncio.Semaphore | None = None


def _get_analysis_semaphore() -> asyncio.Semaphore:
    """Global analysis concurrency limiter (process-local)."""
    global _analysis_semaphore
    if _analysis_semaphore is None:
        settings = deps.get_settings()
        max_concurrent = max(1, settings.max_concurrent_analyses)
        _analysis_semaphore = asyncio.Semaphore(max_concurrent)
    return _analysis_semaphore


def _emit_log(
    analysis_id: str,
    message: str,
    *,
    level: str = "info",
    source: str = "runner",
) -> None:
    progress_manager.emit(
        analysis_id,
        "log",
        {
            "level": level,
            "source": source,
            "message": message,
        },
    )


class AnalysisRunner:
    """Orchestrate an analysis in the background, emitting progress events."""

    def __init__(self, store: AnalysisStore) -> None:
        self._store = store

    async def _is_canceled(self, analysis_id: str) -> bool:
        detail = await self._store.get(analysis_id)
        return detail is not None and detail.status == AnalysisStatus.CANCELED

    async def _raise_if_canceled(self, analysis_id: str) -> None:
        if await self._is_canceled(analysis_id):
            raise asyncio.CancelledError("analysis canceled by user")

    async def run(self, analysis_id: str, request: AnalysisRequest) -> None:
        pm = progress_manager
        t0 = time.perf_counter()
        text_count = len(request.texts)
        author_count = len({entry.author for entry in request.texts})
        perf_summary: dict[str, float | int] = {}

        semaphore = _get_analysis_semaphore()
        async with semaphore:
            try:
                if await self._is_canceled(analysis_id):
                    return

                started = await self._store.update_status(
                    analysis_id,
                    AnalysisStatus.RUNNING,
                    only_if_current={AnalysisStatus.PENDING},
                )
                if not started:
                    return

                pm.emit(
                    analysis_id,
                    "analysis_started",
                    {
                        "analysis_id": analysis_id,
                        "text_count": text_count,
                        "author_count": author_count,
                        "task_type": request.task.value,
                        "llm_backend": request.llm_backend,
                    },
                )
                _emit_log(
                    analysis_id,
                    (
                        f"Analysis started: {text_count} texts, {author_count} authors, "
                        f"task={request.task.value}, backend={request.llm_backend}."
                    ),
                )

                # ----- Feature extraction -----
                pm.emit(analysis_id, "phase_changed", {"phase": "feature_extraction"})
                _emit_log(
                    analysis_id,
                    f"Feature extraction started for {text_count} texts.",
                    source="features",
                )
                features_started = time.perf_counter()
                features, feature_perf = await self._extract_features(analysis_id, request)
                feature_extraction_ms = (time.perf_counter() - features_started) * 1000.0
                perf_summary["feature_extraction_ms"] = feature_extraction_ms
                perf_summary.update(feature_perf)
                await self._raise_if_canceled(analysis_id)
                _emit_log(
                    analysis_id,
                    f"Feature extraction completed ({len(features)}/{text_count}).",
                    source="features",
                )

                # ----- Agent analysis -----
                pm.emit(analysis_id, "phase_changed", {"phase": "agent_analysis"})
                _emit_log(analysis_id, "Agent analysis started.", source="agents")
                report, agent_perf = await self._run_agents(analysis_id, features, request)
                perf_summary.update(agent_perf)
                await self._raise_if_canceled(analysis_id)

                # ----- Persist results -----
                total_ms = (time.perf_counter() - t0) * 1000.0
                perf_summary["total_ms"] = total_ms
                # Normalize integer counters for API output.
                for key in ("cache_hits", "cache_misses", "texts_total"):
                    if key in perf_summary:
                        perf_summary[key] = int(round(float(perf_summary[key])))

                completed = await self._store.update_status(
                    analysis_id,
                    AnalysisStatus.COMPLETED,
                    report_json=report.model_dump_json(),
                    perf_json=json.dumps(perf_summary),
                    only_if_current={AnalysisStatus.RUNNING},
                )
                if not completed:
                    return

                findings_total = sum(len(agent.findings) for agent in report.agent_reports)
                _emit_log(
                    analysis_id,
                    (
                        f"Analysis completed in {total_ms / 1000.0:.2f}s. "
                        f"Agents={len(report.agent_reports)}, findings={findings_total}."
                    ),
                )
                _emit_log(
                    analysis_id,
                    (
                        "Performance(ms): "
                        f"total={total_ms:.2f}, "
                        f"feature={float(perf_summary.get('feature_extraction_ms', 0.0)):.2f}, "
                        f"agent={float(perf_summary.get('agent_analysis_ms', 0.0)):.2f}, "
                        f"synthesis={float(perf_summary.get('synthesis_ms', 0.0)):.2f}, "
                        f"rust={float(perf_summary.get('rust_ms', 0.0)):.2f}, "
                        f"spacy={float(perf_summary.get('spacy_ms', 0.0)):.2f}, "
                        f"embedding={float(perf_summary.get('embedding_ms', 0.0)):.2f}, "
                        f"cache_get={float(perf_summary.get('cache_get_ms', 0.0)):.2f}, "
                        f"cache_put={float(perf_summary.get('cache_put_ms', 0.0)):.2f}."
                    ),
                    source="perf",
                )
                pm.emit(
                    analysis_id,
                    "analysis_completed",
                    {
                        "analysis_id": analysis_id,
                        "duration_seconds": round(total_ms / 1000.0, 2),
                        "status": "completed",
                    },
                )
            except asyncio.CancelledError:
                updated = await self._store.update_status(
                    analysis_id,
                    AnalysisStatus.CANCELED,
                    error_message="Canceled by user",
                    perf_json=json.dumps(perf_summary) if perf_summary else None,
                    only_if_current={AnalysisStatus.PENDING, AnalysisStatus.RUNNING},
                )
                if updated:
                    _emit_log(analysis_id, "Analysis canceled by user.", level="warning")
                    pm.emit(
                        analysis_id,
                        "analysis_cancelled",
                        {"analysis_id": analysis_id, "reason": "canceled_by_user"},
                    )
            except Exception as exc:
                logger.exception("Analysis %s failed", analysis_id)
                _emit_log(analysis_id, f"Analysis failed: {exc}", level="error")
                failed = await self._store.update_status(
                    analysis_id,
                    AnalysisStatus.FAILED,
                    error_message=str(exc),
                    perf_json=json.dumps(perf_summary) if perf_summary else None,
                    only_if_current={AnalysisStatus.PENDING, AnalysisStatus.RUNNING},
                )
                if failed:
                    pm.emit(
                        analysis_id,
                        "analysis_failed",
                        {"analysis_id": analysis_id, "error": str(exc), "phase": "unknown"},
                    )
            finally:
                pm.complete(analysis_id)

    async def _extract_features(
        self, analysis_id: str, request: AnalysisRequest
    ) -> tuple[list[FeatureVector], dict[str, float]]:
        from text.features.cache import FeatureCache
        from text.features.extractor import FeatureExtractor

        pm = progress_manager
        cache = FeatureCache()
        extractor = FeatureExtractor(cache=cache)
        total = len(request.texts)

        try:
            pm.emit(
                analysis_id,
                "feature_extraction_progress",
                {"completed": 0, "total": total, "current_text_id": ""},
            )

            def _on_progress(completed: int, total_count: int, text_id: str) -> None:
                pm.emit(
                    analysis_id,
                    "feature_extraction_progress",
                    {
                        "completed": completed,
                        "total": total_count,
                        "current_text_id": text_id,
                    },
                )
                _emit_log(
                    analysis_id,
                    f"Extracted {text_id} ({completed}/{total_count}).",
                    source="features",
                )

            features = await extractor.extract_batch(request.texts, progress_hook=_on_progress)
        finally:
            await cache.close()

        return features, extractor.last_perf

    async def _run_agents(
        self,
        analysis_id: str,
        features: list[FeatureVector],
        request: AnalysisRequest,
    ) -> tuple[ForensicReport, dict[str, float]]:
        """Run orchestrator with progress hooks by subclassing _run_agent."""
        from text.agents.orchestrator import OrchestratorAgent

        pm = progress_manager
        synthesis_ms = 0.0
        phase_started = time.perf_counter()

        class InstrumentedOrchestrator(OrchestratorAgent):
            """Wraps _run_agent to emit SSE events."""

            @staticmethod
            async def _run_agent(
                name: str,
                coro_fn,  # noqa: ANN001
                features: list[FeatureVector],
                task_context: str,
                **kwargs,
            ) -> AgentReport:
                pm.emit(analysis_id, "agent_started", {"agent": name})
                _emit_log(analysis_id, f"Agent {name} started.", source="agents")
                t_start = time.time()
                try:
                    report = await OrchestratorAgent._run_agent(
                        name, coro_fn, features, task_context, **kwargs
                    )
                    duration = round(time.time() - t_start, 2)
                    status = "completed" if report.findings else "empty"
                    pm.emit(
                        analysis_id,
                        "agent_completed",
                        {
                            "agent": name,
                            "findings_count": len(report.findings),
                            "duration_seconds": duration,
                            "status": status,
                        },
                    )
                    _emit_log(
                        analysis_id,
                        (
                            f"Agent {name} {status} in {duration:.2f}s "
                            f"with {len(report.findings)} findings."
                        ),
                        source="agents",
                    )
                    return report
                except Exception:
                    duration = round(time.time() - t_start, 2)
                    pm.emit(
                        analysis_id,
                        "agent_completed",
                        {
                            "agent": name,
                            "findings_count": 0,
                            "duration_seconds": duration,
                            "status": "failed",
                        },
                    )
                    _emit_log(
                        analysis_id,
                        f"Agent {name} failed after {duration:.2f}s.",
                        level="error",
                        source="agents",
                    )
                    raise

        # Synthesis hooks
        pm.emit(analysis_id, "phase_changed", {"phase": "agent_analysis"})
        settings = deps.get_settings()
        orchestrator = InstrumentedOrchestrator(
            llm_backend=request.llm_backend,
            config_path=str(settings.backends_config),
        )

        # Override synthesize to emit synthesis events
        original_synthesize = orchestrator.synthesis.synthesize

        async def _instrumented_synthesize(
            agent_reports: list[AgentReport],
            req: AnalysisRequest,
        ) -> ForensicReport:
            nonlocal synthesis_ms
            pm.emit(analysis_id, "phase_changed", {"phase": "synthesis"})
            pm.emit(analysis_id, "synthesis_started", {})
            _emit_log(analysis_id, "Synthesis started.", source="synthesis")
            t_start = time.perf_counter()
            report = await original_synthesize(agent_reports, req)
            synthesis_ms = (time.perf_counter() - t_start) * 1000.0
            duration = round(synthesis_ms / 1000.0, 2)
            pm.emit(analysis_id, "synthesis_completed", {"duration_seconds": duration})
            _emit_log(
                analysis_id,
                f"Synthesis completed in {duration:.2f}s.",
                source="synthesis",
            )
            return report

        orchestrator.synthesis.synthesize = _instrumented_synthesize  # type: ignore[assignment]

        report = await orchestrator.analyze(features, request)
        total_phase_ms = (time.perf_counter() - phase_started) * 1000.0
        agent_analysis_ms = max(total_phase_ms - synthesis_ms, 0.0)
        return report, {
            "agent_analysis_ms": agent_analysis_ms,
            "synthesis_ms": synthesis_ms,
        }
