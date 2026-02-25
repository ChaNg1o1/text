"""Background analysis runner with progress instrumentation.

Wraps the existing pipeline (FeatureExtractor + OrchestratorAgent) and emits
SSE events via ``ProgressManager`` without modifying the core modules.
"""

from __future__ import annotations

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

    async def run(self, analysis_id: str, request: AnalysisRequest) -> None:
        pm = progress_manager
        t0 = time.time()
        text_count = len(request.texts)
        author_count = len({entry.author for entry in request.texts})
        try:
            await self._store.update_status(analysis_id, AnalysisStatus.RUNNING)
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
            features = await self._extract_features(analysis_id, request)
            _emit_log(
                analysis_id,
                f"Feature extraction completed ({len(features)}/{text_count}).",
                source="features",
            )

            # ----- Agent analysis -----
            pm.emit(analysis_id, "phase_changed", {"phase": "agent_analysis"})
            _emit_log(analysis_id, "Agent analysis started.", source="agents")
            report = await self._run_agents(analysis_id, features, request)

            # ----- Persist results -----
            features_json = json.dumps([f.model_dump() for f in features], default=str)
            await self._store.update_status(
                analysis_id,
                AnalysisStatus.COMPLETED,
                report_json=report.model_dump_json(),
                features_json=features_json,
            )

            duration = time.time() - t0
            findings_total = sum(len(agent.findings) for agent in report.agent_reports)
            _emit_log(
                analysis_id,
                (
                    f"Analysis completed in {duration:.2f}s. "
                    f"Agents={len(report.agent_reports)}, findings={findings_total}."
                ),
            )
            pm.emit(
                analysis_id,
                "analysis_completed",
                {
                    "analysis_id": analysis_id,
                    "duration_seconds": round(duration, 2),
                    "status": "completed",
                },
            )
        except Exception as exc:
            logger.exception("Analysis %s failed", analysis_id)
            _emit_log(analysis_id, f"Analysis failed: {exc}", level="error")
            await self._store.update_status(
                analysis_id,
                AnalysisStatus.FAILED,
                error_message=str(exc),
            )
            pm.emit(
                analysis_id,
                "analysis_failed",
                {"analysis_id": analysis_id, "error": str(exc), "phase": "unknown"},
            )
        finally:
            pm.complete(analysis_id)

    async def _extract_features(
        self, analysis_id: str, request: AnalysisRequest
    ) -> list[FeatureVector]:
        from text.features.cache import FeatureCache
        from text.features.extractor import FeatureExtractor

        pm = progress_manager
        cache = FeatureCache()
        extractor = FeatureExtractor(cache=cache)
        total = len(request.texts)
        features: list[FeatureVector] = []

        try:
            for i, entry in enumerate(request.texts):
                _emit_log(
                    analysis_id,
                    f"Extracting features for text {i + 1}/{total} ({entry.id}).",
                    source="features",
                )
                pm.emit(
                    analysis_id,
                    "feature_extraction_progress",
                    {"completed": i, "total": total, "current_text_id": entry.id},
                )
                extract_started = time.time()
                fv = await extractor.extract(entry.content, entry.id)
                features.append(fv)
                _emit_log(
                    analysis_id,
                    f"Extracted {entry.id} in {time.time() - extract_started:.2f}s.",
                    source="features",
                )

            pm.emit(
                analysis_id,
                "feature_extraction_progress",
                {"completed": total, "total": total, "current_text_id": ""},
            )
        finally:
            await cache.close()

        return features

    async def _run_agents(
        self,
        analysis_id: str,
        features: list[FeatureVector],
        request: AnalysisRequest,
    ) -> ForensicReport:
        """Run orchestrator with progress hooks by subclassing _run_agent."""
        from text.agents.orchestrator import OrchestratorAgent

        pm = progress_manager

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
            pm.emit(analysis_id, "phase_changed", {"phase": "synthesis"})
            pm.emit(analysis_id, "synthesis_started", {})
            _emit_log(analysis_id, "Synthesis started.", source="synthesis")
            t_start = time.time()
            report = await original_synthesize(agent_reports, req)
            duration = round(time.time() - t_start, 2)
            pm.emit(analysis_id, "synthesis_completed", {"duration_seconds": duration})
            _emit_log(
                analysis_id,
                f"Synthesis completed in {duration:.2f}s.",
                source="synthesis",
            )
            return report

        orchestrator.synthesis.synthesize = _instrumented_synthesize  # type: ignore[assignment]

        return await orchestrator.analyze(features, request)
