"""Orchestrator Agent -- coordinates the multi-agent forensic analysis pipeline."""

from __future__ import annotations

import asyncio
import logging
import numpy as np

from text.ingest.schema import (
    AgentReport,
    AgentFinding,
    AnalysisRequest,
    AnomalySample,
    FeatureVector,
    ForensicReport,
    TaskType,
)
from text.llm.backend import LLMBackend, load_backends_config

from .computational import ComputationalAgent
from .psycholinguistics import PsycholinguisticsAgent
from .sociolinguistics import SociolinguisticsAgent
from .stylometry import (
    MAX_PROMPT_SAMPLES,
    StylometryAgent,
    _build_corpus_summary,
    _sample_representative,
)
from .synthesis import SynthesisAgent

logger = logging.getLogger(__name__)


def _resolve_model(llm_backend: str) -> str:
    """Resolve a user-facing backend name to a litellm model string.

    Uses the canonical mapping from LLMBackend.MODEL_MAP. If the value
    is not found, it is passed through as-is, allowing callers to supply
    arbitrary litellm model identifiers.
    """
    return LLMBackend.MODEL_MAP.get(llm_backend, llm_backend)


class OrchestratorAgent:
    """Coordinates the multi-agent forensic analysis pipeline.

    The orchestrator:
    1. Creates discipline-specific agents with the chosen LLM backend.
    2. Dispatches all 4 discipline agents in parallel via ``asyncio.gather``.
    3. Passes collected ``AgentReport`` objects to the Synthesis agent.
    4. Returns the final ``ForensicReport``.
    """

    def __init__(
        self,
        llm_backend: str = "claude",
        config_path: str | None = None,
    ) -> None:
        # Resolve model name + optional api_base/api_key for custom backends.
        api_base: str | None = None
        api_key: str | None = None

        custom_backends = load_backends_config(config_path)
        if llm_backend in custom_backends:
            cb = custom_backends[llm_backend]
            api_base = cb.api_base
            api_key = cb.resolve_api_key()
            # Resolve model with the same logic as LLMBackend.__init__
            if cb.provider == "openai_compatible":
                model = f"openai/{cb.model}"
            elif cb.provider == "anthropic_compatible":
                model = f"anthropic/{cb.model}"
            else:
                model = cb.model
        else:
            model = _resolve_model(llm_backend)

        agent_kwargs = {"model": model, "api_base": api_base, "api_key": api_key}
        self.stylometry = StylometryAgent(**agent_kwargs)
        self.psycholinguistics = PsycholinguisticsAgent(**agent_kwargs)
        self.computational = ComputationalAgent(**agent_kwargs)
        self.sociolinguistics = SociolinguisticsAgent(**agent_kwargs)
        self.synthesis = SynthesisAgent(**agent_kwargs)

    async def analyze(
        self,
        features: list[FeatureVector],
        request: AnalysisRequest,
    ) -> ForensicReport:
        """Run the full analysis pipeline and return a ``ForensicReport``."""
        task_context = self._build_task_context(request)

        # For large corpora, enrich task_context with aggregate statistics
        # and prepare a representative sample subset for LLM prompts.
        prompt_features = features
        if len(features) > MAX_PROMPT_SAMPLES:
            author_map = {t.id: t.author for t in request.texts}
            task_context += "\n\n" + _build_corpus_summary(features, author_map)
            prompt_features = _sample_representative(features, MAX_PROMPT_SAMPLES)
            logger.info(
                "Large corpus (%d samples): using %d representative samples for agent prompts",
                len(features),
                len(prompt_features),
            )

        # --- Phase 1: discipline agents in parallel ---
        # Computational agent receives ALL features for local statistical
        # computation (similarity matrix, clustering, outlier detection).
        # It also receives raw texts for compression-based methods (NCD).
        # The other three agents only need features for LLM prompt building,
        # so they receive the (possibly sampled) subset.
        raw_texts = [t.content for t in request.texts]
        discipline_coros = [
            self._run_agent("stylometry", self.stylometry.analyze, prompt_features, task_context),
            self._run_agent(
                "psycholinguistics", self.psycholinguistics.analyze, prompt_features, task_context
            ),
            self._run_agent(
                "computational", self.computational.analyze, features, task_context,
                raw_texts=raw_texts,
            ),
            self._run_agent(
                "sociolinguistics", self.sociolinguistics.analyze, prompt_features, task_context
            ),
        ]

        agent_reports: list[AgentReport] = await asyncio.gather(*discipline_coros)

        # Filter out completely failed (empty) reports if desired, but keep
        # them for transparency -- the synthesis agent can note failures.
        successful = [r for r in agent_reports if r.findings]
        logger.info(
            "Discipline phase complete: %d/%d agents produced findings",
            len(successful),
            len(agent_reports),
        )

        # --- Phase 1.5: temporal drift detection (needs timestamps) ---
        drift_findings = self._detect_temporal_drift(features, request)
        if drift_findings:
            # Inject into computational agent's report.
            for ar in agent_reports:
                if ar.agent_name == "computational":
                    ar.findings.extend(drift_findings)
                    break

        # --- Phase 2: synthesis ---
        report = await self.synthesis.synthesize(agent_reports, request)

        # --- Phase 3: attach anomaly samples with original text ---
        report.anomaly_samples = self._collect_anomaly_samples(request)

        return report

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_temporal_drift(
        features: list[FeatureVector],
        request: AnalysisRequest,
    ) -> list[AgentFinding]:
        """Detect writing style changepoints using sliding-window z-scores on timestamped texts."""
        # Build (timestamp, feature_vector) pairs for texts that have timestamps.
        ts_map = {t.id: t.timestamp for t in request.texts if t.timestamp is not None}
        if len(ts_map) < 6:
            return []

        pairs = [(ts_map[fv.text_id], fv) for fv in features if fv.text_id in ts_map]
        if len(pairs) < 6:
            return []

        # Sort by timestamp.
        pairs.sort(key=lambda x: x[0])

        # Extract scalar features for drift analysis.
        dim_names = [
            "type_token_ratio", "yules_k", "avg_sentence_length",
            "formality_score", "code_switching_ratio", "sentiment_valence",
        ]
        matrix = np.array([
            [
                fv.rust_features.type_token_ratio,
                fv.rust_features.yules_k,
                fv.rust_features.avg_sentence_length,
                fv.rust_features.formality_score,
                fv.rust_features.code_switching_ratio,
                fv.nlp_features.sentiment_valence,
            ]
            for _, fv in pairs
        ])

        n = len(matrix)
        window = max(3, n // 4)
        findings: list[AgentFinding] = []

        # Sliding window: compare each window's mean to the global mean.
        global_mean = matrix.mean(axis=0)
        global_std = matrix.std(axis=0)
        global_std[global_std == 0] = 1.0

        drift_points: list[tuple[int, float, list[str]]] = []
        for start in range(0, n - window + 1):
            local_mean = matrix[start:start + window].mean(axis=0)
            z = np.abs((local_mean - global_mean) / global_std)
            drifted_dims = [(dim_names[i], float(z[i])) for i in range(len(dim_names)) if z[i] > 1.5]
            if len(drifted_dims) >= 2:
                max_z = max(zz for _, zz in drifted_dims)
                drift_points.append((start, max_z, [f"{d} (z={zz:.2f})" for d, zz in drifted_dims]))

        if not drift_points:
            return []

        # Find the most significant drift point.
        best = max(drift_points, key=lambda x: x[1])
        idx, max_z, dim_strs = best
        ts_str = pairs[idx][0].strftime("%Y-%m-%d") if pairs[idx][0] else f"sample {idx}"

        findings.append(AgentFinding(
            discipline="computational_linguistics",
            category="temporal_drift",
            description=(
                f"在 {ts_str} 附近检测到写作风格显著漂移，"
                f"涉及 {len(dim_strs)} 个特征维度同时偏离全局均值（窗口大小={window}）。"
                f"这可能表明作者身份变更、写作目的转变或外部影响因素。"
            ),
            confidence=min(0.9, 0.5 + max_z * 0.1),
            evidence=[f"drift at window starting index {idx}"] + dim_strs,
        ))

        return findings

    def _collect_anomaly_samples(
        self,
        request: AnalysisRequest,
    ) -> list[AnomalySample]:
        """Build anomaly sample list from computational outlier data + original text."""
        outlier_dims = self.computational.outlier_dims
        if not outlier_dims:
            return []

        text_map = {t.id: t.content for t in request.texts}
        samples = [
            AnomalySample(
                text_id=text_id,
                content=text_map.get(text_id, ""),
                outlier_dimensions={name: score for name, score in dims},
            )
            for text_id, dims in outlier_dims.items()
            if text_id in text_map
        ]
        # Most anomalous first (by number of outlier dimensions).
        samples.sort(key=lambda s: len(s.outlier_dimensions), reverse=True)
        return samples

    @staticmethod
    async def _run_agent(
        name: str,
        coro_fn,  # noqa: ANN001 -- callable returning Awaitable[AgentReport]
        features: list[FeatureVector],
        task_context: str,
        **kwargs,
    ) -> AgentReport:
        """Run a single discipline agent with error isolation."""
        try:
            return await coro_fn(features, task_context, **kwargs)
        except Exception as exc:
            logger.exception("Agent '%s' raised an unhandled exception", name)
            return AgentReport(
                agent_name=name,
                discipline=name,
                summary=f"Agent '{name}' failed: {type(exc).__name__}: {exc}",
            )

    @staticmethod
    def _build_task_context(request: AnalysisRequest) -> str:
        """Produce a human-readable task description for agent prompts."""
        text_ids = [t.id for t in request.texts]
        authors = sorted({t.author for t in request.texts})

        # Truncate long ID lists to avoid wasting context.
        max_ids = 30
        if len(text_ids) > max_ids:
            id_str = ", ".join(text_ids[:max_ids]) + f" ... ({len(text_ids)} total)"
        else:
            id_str = ", ".join(text_ids)

        # Truncate long author lists to avoid wasting context.
        max_authors = 30
        if len(authors) > max_authors:
            author_str = ", ".join(authors[:max_authors]) + f" ... ({len(authors)} total)"
        else:
            author_str = ", ".join(authors)

        lines = [
            f"Task type: {request.task.value}",
            f"Texts under analysis: {id_str}",
            f"Claimed authors: {author_str}",
        ]

        if request.task == TaskType.ATTRIBUTION:
            lines.append(
                "Goal: determine whether the texts share authorship and, if so, "
                "identify distinctive authorial markers that could support attribution."
            )
        elif request.task == TaskType.PROFILING:
            lines.append(
                "Goal: build a linguistic profile of the author(s) including "
                "demographic estimates, psychological traits, and social context."
            )
        elif request.task == TaskType.SOCKPUPPET:
            lines.append(
                "Goal: determine whether texts attributed to different authors "
                "were actually written by the same person operating multiple accounts."
            )
        else:  # FULL
            lines.append(
                "Goal: perform comprehensive forensic analysis covering attribution, "
                "profiling, and sockpuppet detection as applicable."
            )

        if request.compare_groups:
            for i, group in enumerate(request.compare_groups, 1):
                lines.append(f"Comparison group {i}: [{', '.join(group)}]")

        return "\n".join(lines)
