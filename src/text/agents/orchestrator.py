"""Orchestrator Agent -- coordinates the multi-agent forensic analysis pipeline."""

from __future__ import annotations

import asyncio
import logging

from text.ingest.schema import (
    AgentReport,
    AnalysisRequest,
    FeatureVector,
    ForensicReport,
    TaskType,
)
from text.llm.backend import LLMBackend, load_backends_config

from .computational import ComputationalAgent
from .psycholinguistics import PsycholinguisticsAgent
from .sociolinguistics import SociolinguisticsAgent
from .stylometry import StylometryAgent
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

        # --- Phase 1: discipline agents in parallel ---
        discipline_coros = [
            self._run_agent("stylometry", self.stylometry.analyze, features, task_context),
            self._run_agent(
                "psycholinguistics", self.psycholinguistics.analyze, features, task_context
            ),
            self._run_agent("computational", self.computational.analyze, features, task_context),
            self._run_agent(
                "sociolinguistics", self.sociolinguistics.analyze, features, task_context
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

        # --- Phase 2: synthesis ---
        report = await self.synthesis.synthesize(agent_reports, request)
        return report

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _run_agent(
        name: str,
        coro_fn,  # noqa: ANN001 -- callable returning Awaitable[AgentReport]
        features: list[FeatureVector],
        task_context: str,
    ) -> AgentReport:
        """Run a single discipline agent with error isolation."""
        try:
            return await coro_fn(features, task_context)
        except Exception:
            logger.exception("Agent '%s' raised an unhandled exception", name)
            return AgentReport(
                agent_name=name,
                discipline=name,
                summary=f"Agent '{name}' failed with an unhandled error.",
            )

    @staticmethod
    def _build_task_context(request: AnalysisRequest) -> str:
        """Produce a human-readable task description for agent prompts."""
        text_ids = [t.id for t in request.texts]
        authors = sorted({t.author for t in request.texts})

        lines = [
            f"Task type: {request.task.value}",
            f"Texts under analysis: {', '.join(text_ids)}",
            f"Claimed authors: {', '.join(authors)}",
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
