"""Orchestrator agent for the forensic analysis pipeline."""

from __future__ import annotations

import asyncio
import logging

from text.app_settings import PromptOverrides
from text.decision import DecisionEngine
from text.ingest.schema import AgentReport, AnalysisRequest, FeatureVector, ForensicReport, TaskType
from text.llm.backend import load_backends_config

from .computational import ComputationalAgent
from .psycholinguistics import WritingProcessAgent
from .sociolinguistics import SociolinguisticsAgent
from .stylometry import MAX_PROMPT_SAMPLES, StylometryAgent
from .synthesis import SynthesisAgent

logger = logging.getLogger(__name__)


class OrchestratorAgent:
    """Coordinates deterministic decisions, agent analysis, and synthesis."""

    def __init__(
        self,
        llm_backend: str = "default",
        config_path: str | None = None,
        prompt_overrides: PromptOverrides | None = None,
    ) -> None:
        api_base: str | None = None
        api_key: str | None = None
        prompt_overrides = prompt_overrides or PromptOverrides()

        custom_backends = load_backends_config(config_path)
        selected_backend = llm_backend.strip()
        if selected_backend in {"", "default"}:
            if not custom_backends:
                raise ValueError(
                    "No custom backends configured. Add at least one backend in backends.json."
                )
            selected_backend = sorted(custom_backends)[0]

        cb = custom_backends.get(selected_backend)
        if cb is None:
            available = ", ".join(sorted(custom_backends)) or "(none)"
            raise ValueError(
                f"Unknown backend '{llm_backend}'. Available custom backends: {available}."
            )

        api_base = cb.api_base
        api_key = cb.resolve_api_key()
        if cb.provider == "openai_compatible":
            model = f"openai/{cb.model}"
        elif cb.provider == "anthropic_compatible":
            model = f"anthropic/{cb.model}"
        else:
            model = cb.model

        agent_kwargs = {"model": model, "api_base": api_base, "api_key": api_key}
        self.stylometry = StylometryAgent(
            **agent_kwargs, prompt_override=prompt_overrides.stylometry
        )
        self.writing_process = WritingProcessAgent(
            **agent_kwargs, prompt_override=prompt_overrides.writing_process
        )
        self.computational = ComputationalAgent(
            **agent_kwargs, prompt_override=prompt_overrides.computational
        )
        self.sociolinguistics = SociolinguisticsAgent(
            **agent_kwargs, prompt_override=prompt_overrides.sociolinguistics
        )
        self.synthesis = SynthesisAgent(
            **agent_kwargs, prompt_override=prompt_overrides.synthesis
        )
        self.decision_engine = DecisionEngine()

    async def analyze(
        self,
        features: list[FeatureVector],
        request: AnalysisRequest,
    ) -> ForensicReport:
        task_context = self._build_task_context(request)

        deterministic_report = await asyncio.to_thread(
            self.decision_engine.build_report, request, features
        )

        prompt_features = features[:MAX_PROMPT_SAMPLES] if len(features) > MAX_PROMPT_SAMPLES else features
        raw_texts = [text.content for text in request.texts]
        discipline_coros = [
            self._run_agent("stylometry", self.stylometry.analyze, prompt_features, task_context),
            self._run_agent(
                "writing_process", self.writing_process.analyze, prompt_features, task_context
            ),
            self._run_agent(
                "computational",
                self.computational.analyze,
                features,
                task_context,
                raw_texts=raw_texts,
            ),
            self._run_agent(
                "sociolinguistics", self.sociolinguistics.analyze, prompt_features, task_context
            ),
        ]
        agent_reports: list[AgentReport] = await asyncio.gather(*discipline_coros)
        report = await self.synthesis.synthesize(deterministic_report, agent_reports, request)
        return report

    @staticmethod
    async def _run_agent(
        name: str,
        coro_fn,
        features: list[FeatureVector],
        task_context: str,
        **kwargs,
    ) -> AgentReport:
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
        text_ids = [text.id for text in request.texts]
        authors = sorted({text.author for text in request.texts})
        lines = [
            f"Task type: {request.task.value}",
            f"Texts under analysis: {', '.join(text_ids[:30])}",
            f"Claimed authors/accounts: {', '.join(authors[:30])}",
        ]
        if request.task == TaskType.VERIFICATION:
            lines.append("Goal: compare questioned texts against one or more known reference authors.")
        elif request.task == TaskType.CLOSED_SET_ID:
            lines.append("Goal: rank candidates within a closed candidate set only.")
        elif request.task == TaskType.OPEN_SET_ID:
            lines.append("Goal: rank candidates and determine whether none-of-the-above should be retained.")
        elif request.task == TaskType.CLUSTERING:
            lines.append("Goal: group texts by robust writing fingerprints without proving authorship.")
        elif request.task == TaskType.PROFILING:
            lines.append("Goal: describe observable writing habits and process-level clues.")
        elif request.task == TaskType.SOCKPUPPET:
            lines.append("Goal: assess possible common control using text, time, and interaction evidence.")
        else:
            lines.append("Goal: run a court-aware composite analysis without collapsing all tasks into one identity claim.")

        params = request.task_params
        if params.questioned_text_ids:
            lines.append(f"Questioned text ids: {', '.join(params.questioned_text_ids)}")
        if params.reference_author_ids:
            lines.append(f"Reference author ids: {', '.join(params.reference_author_ids)}")
        if params.candidate_author_ids:
            lines.append(f"Candidate author ids: {', '.join(params.candidate_author_ids)}")
        if params.account_ids:
            lines.append(f"Account ids: {', '.join(params.account_ids)}")
        return "\n".join(lines)
