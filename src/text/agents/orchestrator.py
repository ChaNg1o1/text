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
        elif request.task == TaskType.SELF_DISCOVERY:
            lines.append(
                "Narrative perspective: second person (address the writer as '你').\n"
                "Goal: Build a comprehensive 'Writing DNA' portrait of the author — "
                "writing style fingerprint, psychological tendencies, cognitive patterns, "
                "social identity clues, and emotional spectrum. "
                "Output all findings with clue, portrait, and evidence layers."
            )
        elif request.task == TaskType.CLUE_EXTRACTION:
            lines.append(
                "Narrative perspective: third person (refer to the author as '文本作者').\n"
                "Goal: Extract investigative clues from the text — "
                "trackable linguistic markers, author background signals, "
                "behavioral anomalies, and any patterns useful for open-source intelligence analysis. "
                "Prioritize OSINT-style leads first: traceable handles, source patterns, timeline signals, "
                "cross-text linkage pivots, community markers, and metadata that suggests where to look next. "
                "Treat deeper forensic interpretation as supporting detail that comes after actionable leads. "
                "Output all findings with clue, portrait, and evidence layers."
            )
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
        if request.task == TaskType.CLUE_EXTRACTION:
            lines.extend(
                [
                    "OSINT posture:",
                    "- Put actionable leads before evidentiary certainty.",
                    "- Prefer pivots an investigator can follow next: source, timestamp, topic, alias, community markers, linked texts/accounts.",
                    "- Use forensic language only after surfacing the best leads and caveats.",
                ]
            )
            scope_lines = OrchestratorAgent._build_text_scope_lines(request)
            if scope_lines:
                lines.append("Text source brief:")
                lines.extend(scope_lines)
            context_lines = OrchestratorAgent._build_request_signal_lines(request)
            if context_lines:
                lines.append("Supplementary request signals:")
                lines.extend(context_lines)
        return "\n".join(lines)

    @staticmethod
    def _build_text_scope_lines(request: AnalysisRequest) -> list[str]:
        lines: list[str] = []
        for text in request.texts[:12]:
            source = (text.source or str(text.metadata.get("source") or "")).strip() or "unknown_source"
            timestamp = text.timestamp.isoformat() if text.timestamp else "unknown_time"
            metadata_bits: list[str] = []
            for key in ("platform", "url", "channel", "topic", "thread_id", "language"):
                value = text.metadata.get(key)
                if value is None:
                    continue
                normalized = str(value).strip()
                if normalized:
                    metadata_bits.append(f"{key}={normalized}")
            metadata_part = f" | metadata: {', '.join(metadata_bits[:4])}" if metadata_bits else ""
            lines.append(
                f"- {text.id}: author/account={text.author}, source={source}, timestamp={timestamp}{metadata_part}"
            )
        if len(request.texts) > 12:
            lines.append(f"- ... {len(request.texts) - 12} more texts omitted from the brief")
        return lines

    @staticmethod
    def _build_request_signal_lines(request: AnalysisRequest) -> list[str]:
        lines: list[str] = []
        if request.artifacts:
            artifact_preview = ", ".join(
                f"{artifact.kind.value}:{artifact.source_name}" for artifact in request.artifacts[:5]
            )
            lines.append(
                f"- Artifacts available: {len(request.artifacts)} total"
                + (f" ({artifact_preview})" if artifact_preview else "")
            )
        if request.activity_events:
            event_types = sorted({event.event_type for event in request.activity_events if event.event_type})
            topic_preview = sorted(
                {
                    str(event.topic).strip()
                    for event in request.activity_events
                    if event.topic and str(event.topic).strip()
                }
            )
            lines.append(
                f"- Activity events: {len(request.activity_events)} total; "
                f"types={', '.join(event_types[:6]) or 'unknown'}; "
                f"topics={', '.join(topic_preview[:6]) or 'none'}"
            )
        if request.interaction_edges:
            relation_types = sorted(
                {edge.relation_type for edge in request.interaction_edges if edge.relation_type}
            )
            lines.append(
                f"- Interaction edges: {len(request.interaction_edges)} total; "
                f"relations={', '.join(relation_types[:6]) or 'unknown'}"
            )
        return lines
