"""Shared data models for the text forensics platform."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
import hashlib
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


PIPELINE_VERSION = "text-v0.2.0"
DEFAULT_THRESHOLD_PROFILE_VERSION = "default-v1"


class TaskType(str, Enum):
    VERIFICATION = "verification"
    CLOSED_SET_ID = "closed_set_id"
    OPEN_SET_ID = "open_set_id"
    CLUSTERING = "clustering"
    PROFILING = "profiling"
    SOCKPUPPET = "sockpuppet"
    FULL = "full"
    SELF_DISCOVERY = "self_discovery"
    CLUE_EXTRACTION = "clue_extraction"


class ConclusionGrade(str, Enum):
    STRONG_SUPPORT = "strong_support"
    MODERATE_SUPPORT = "moderate_support"
    INCONCLUSIVE = "inconclusive"
    MODERATE_AGAINST = "moderate_against"
    STRONG_AGAINST = "strong_against"


class ArtifactKind(str, Enum):
    RAW_TEXT = "raw_text"
    FILE_EXPORT = "file_export"
    SCREENSHOT_OCR = "screenshot_ocr"
    TRANSCRIPT = "transcript"
    MANUAL_ENTRY = "manual_entry"


class DerivationKind(str, Enum):
    ORIGINAL = "original"
    NORMALIZED = "normalized"
    OCR = "ocr"
    TRANSCRIBED = "transcribed"
    MANUAL_ENTRY = "manual_entry"


class CaseMetadata(BaseModel):
    case_id: str | None = None
    client: str | None = None
    analyst: str | None = None
    notes: str | None = None


class TaskParams(BaseModel):
    questioned_text_ids: list[str] = Field(default_factory=list)
    reference_author_ids: list[str] = Field(default_factory=list)
    candidate_author_ids: list[str] = Field(default_factory=list)
    cluster_text_ids: list[str] = Field(default_factory=list)
    subject_ids: list[str] = Field(default_factory=list)
    account_ids: list[str] = Field(default_factory=list)
    top_k: int = Field(default=3, ge=1, le=20)


class ArtifactRecord(BaseModel):
    artifact_id: str
    kind: ArtifactKind
    sha256: str
    byte_count: int = Field(ge=0)
    source_name: str
    acquisition_timestamp: datetime | None = None
    operator: str | None = None
    transform_chain: list[str] = Field(default_factory=list)
    notes: str | None = None


class TextEntry(BaseModel):
    """A single text document for analysis."""

    id: str
    author: str
    content: str
    timestamp: datetime | None = None
    source: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    artifact_id: str | None = None
    content_sha256: str | None = None
    derivation_kind: DerivationKind = DerivationKind.ORIGINAL

    @model_validator(mode="after")
    def ensure_content_hash(self) -> "TextEntry":
        if not self.content_sha256:
            self.content_sha256 = sha256_text(self.content)
        return self


class ActivityEvent(BaseModel):
    event_id: str
    account_id: str
    event_type: str
    occurred_at: datetime
    thread_id: str | None = None
    topic: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class InteractionEdge(BaseModel):
    source_account_id: str
    target_account_id: str
    relation_type: str
    weight: float = Field(default=1.0, ge=0.0)
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalysisRequest(BaseModel):
    """Top-level analysis request."""

    texts: list[TextEntry]
    task: TaskType = TaskType.FULL
    task_params: TaskParams = Field(default_factory=TaskParams)
    llm_backend: str = "default"
    case_metadata: CaseMetadata | None = None
    artifacts: list[ArtifactRecord] = Field(default_factory=list)
    activity_events: list[ActivityEvent] = Field(default_factory=list)
    interaction_edges: list[InteractionEdge] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_task_requirements(self) -> "AnalysisRequest":
        params = self.task_params
        if self.task == TaskType.VERIFICATION:
            _require(params.questioned_text_ids, "task_params.questioned_text_ids")
            _require(params.reference_author_ids, "task_params.reference_author_ids")
        elif self.task == TaskType.CLOSED_SET_ID:
            _require(params.questioned_text_ids, "task_params.questioned_text_ids")
            _require(params.candidate_author_ids, "task_params.candidate_author_ids")
        elif self.task == TaskType.OPEN_SET_ID:
            _require(params.questioned_text_ids, "task_params.questioned_text_ids")
            _require(params.candidate_author_ids, "task_params.candidate_author_ids")
        elif self.task == TaskType.SOCKPUPPET:
            _require(params.account_ids, "task_params.account_ids")
        return self


class RustFeatures(BaseModel):
    """Features computed by the Rust extraction layer."""

    token_count: int = 0
    type_token_ratio: float = 0.0
    hapax_legomena_ratio: float = 0.0
    yules_k: float = 0.0
    avg_word_length: float = 0.0
    avg_sentence_length: float = 0.0
    sentence_length_variance: float = 0.0
    char_ngrams: dict[str, float] = Field(default_factory=dict)
    word_ngrams: dict[str, float] = Field(default_factory=dict)
    punctuation_profile: dict[str, float] = Field(default_factory=dict)
    function_word_freq: dict[str, float] = Field(default_factory=dict)
    cjk_ratio: float = 0.0
    emoji_density: float = 0.0
    formality_score: float = 0.0
    code_switching_ratio: float = 0.0
    brunets_w: float = 0.0
    honores_r: float = 0.0
    simpsons_d: float = 0.0
    mtld: float = 0.0
    hd_d: float = 0.0
    coleman_liau_index: float = 0.0


class NlpFeatures(BaseModel):
    """Features computed by the Python NLP layer."""

    pos_tag_distribution: dict[str, float] = Field(default_factory=dict)
    clause_depth_avg: float = 0.0
    liwc_dimensions: dict[str, float] = Field(default_factory=dict)
    sentiment_valence: float = 0.0
    emotional_tone: float = 0.0
    cognitive_complexity: float = 0.0
    temporal_orientation: dict[str, float] = Field(default_factory=dict)
    embedding: list[float] = Field(default_factory=list)
    topic_distribution: list[float] = Field(default_factory=list)


class FeatureVector(BaseModel):
    """Combined feature vector for a single text entry."""

    text_id: str
    content_hash: str
    rust_features: RustFeatures = Field(default_factory=RustFeatures)
    nlp_features: NlpFeatures = Field(default_factory=NlpFeatures)


class AnomalySample(BaseModel):
    """A statistically anomalous text sample."""

    text_id: str
    content: str
    outlier_dimensions: dict[str, float] = Field(default_factory=dict)


class FindingLayer(str, Enum):
    CLUE = "clue"
    PORTRAIT = "portrait"
    EVIDENCE = "evidence"


class AgentFinding(BaseModel):
    """A single finding from a discipline agent."""

    discipline: str
    category: str
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    opinion_kind: Literal["deterministic_evidence", "interpretive_opinion"] = "interpretive_opinion"
    interpretation: str = ""  # Plain-language explanation for non-expert readers
    layer: FindingLayer = FindingLayer.CLUE


class LLMCallRecord(BaseModel):
    agent: str
    model_id: str
    timestamp: datetime
    prompt_hash: str
    response_hash: str
    token_count_in: int | None = None
    token_count_out: int | None = None
    temperature: float | None = None
    cache_hit: bool = False


class AgentReport(BaseModel):
    """Report from a single discipline agent."""

    agent_name: str
    discipline: str
    findings: list[AgentFinding] = Field(default_factory=list)
    summary: str = ""
    raw_llm_response: str | None = None
    llm_call: LLMCallRecord | None = None


class EvidenceItem(BaseModel):
    evidence_id: str
    label: str
    summary: str
    finding: str = ""
    why_it_matters: str = ""
    counter_readings: list[str] = Field(default_factory=list)
    strength: Literal["core", "supporting", "conflicting"] = "supporting"
    linked_conclusion_keys: list[str] = Field(default_factory=list)
    source_text_ids: list[str] = Field(default_factory=list)
    excerpts: list[str] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
    provenance_refs: list[str] = Field(default_factory=list)
    interpretive_opinion: bool = False


class ReportConclusion(BaseModel):
    key: str
    task: TaskType
    statement: str
    grade: ConclusionGrade
    score: float | None = None
    score_type: str | None = None
    subject: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    counter_evidence: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReportMaterial(BaseModel):
    artifact_id: str
    source_name: str
    sha256: str
    byte_count: int = Field(ge=0)
    text_ids: list[str] = Field(default_factory=list)
    note: str | None = None


class MethodRecord(BaseModel):
    key: str
    title: str
    description: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    threshold_profile_version: str | None = None


class ResultRecord(BaseModel):
    key: str
    title: str
    body: str
    evidence_ids: list[str] = Field(default_factory=list)
    interpretive_opinion: bool = False
    supporting_agents: list[str] = Field(default_factory=list)


NarrativeSectionKey = Literal[
    "bottom_line",
    "evidence_chain",
    "conflicts",
    "limitations",
    "next_actions",
]


class NarrativeSection(BaseModel):
    key: NarrativeSectionKey
    title: str
    summary: str
    detail: str
    evidence_ids: list[str] = Field(default_factory=list)
    result_keys: list[str] = Field(default_factory=list)
    default_expanded: bool = False


class NarrativeBundle(BaseModel):
    version: Literal["v1"] = "v1"
    lead: str = ""
    sections: list[NarrativeSection] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)


class TextAliasRecord(BaseModel):
    text_id: str
    alias: str
    author: str
    preview: str = ""


class AuthorAliasRecord(BaseModel):
    author_id: str
    alias: str


class EntityAliases(BaseModel):
    text_aliases: list[TextAliasRecord] = Field(default_factory=list)
    author_aliases: list[AuthorAliasRecord] = Field(default_factory=list)


class ClusterViewCluster(BaseModel):
    cluster_id: int
    label: str
    theme_summary: str = ""
    separation_summary: str = ""
    top_markers: list[str] = Field(default_factory=list)
    representative_evidence_ids: list[str] = Field(default_factory=list)
    confidence_note: str = ""
    member_text_ids: list[str] = Field(default_factory=list)
    member_aliases: list[str] = Field(default_factory=list)
    representative_text_id: str | None = None
    representative_excerpt: str = ""


class ClusterView(BaseModel):
    clusters: list[ClusterViewCluster] = Field(default_factory=list)
    excluded_text_ids: list[str] = Field(default_factory=list)


class WritingProfileDimension(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(ge=0.0, le=1.0)
    dimension_type: Literal["observable", "speculative"] = "observable"
    evidence_spans: list[str] = Field(default_factory=list)
    counter_evidence: list[str] = Field(default_factory=list)


class WritingProfile(BaseModel):
    subject: str
    summary: str = ""
    headline: str = ""
    observable_summary: str = ""
    stable_habits: list[str] = Field(default_factory=list)
    process_clues: list[str] = Field(default_factory=list)
    anomalies: list[str] = Field(default_factory=list)
    confidence_note: str = ""
    representative_text_ids: list[str] = Field(default_factory=list)
    dimensions: list[WritingProfileDimension] = Field(default_factory=list)


class ReproducibilityInfo(BaseModel):
    report_sha256: str | None = None
    request_fingerprint: str | None = None
    pipeline_version: str = PIPELINE_VERSION
    rust_feature_version: str = "unknown"
    python_feature_version: str = "unknown"
    threshold_profile_version: str = DEFAULT_THRESHOLD_PROFILE_VERSION
    prompt_template_version: str = "v1"
    model_id: str | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    parameter_snapshot: dict[str, Any] = Field(default_factory=dict)


class ProvenanceRecord(BaseModel):
    report_id: str
    input_manifest: list[ArtifactRecord] = Field(default_factory=list)
    pipeline_version: str = PIPELINE_VERSION
    feature_extractor_version: dict[str, str] = Field(default_factory=dict)
    threshold_profile_version: str = DEFAULT_THRESHOLD_PROFILE_VERSION
    llm_calls: list[LLMCallRecord] = Field(default_factory=list)
    report_sha256: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    operator: str | None = None


class AppendixItem(BaseModel):
    key: str
    title: str
    content: str


class ForensicReport(BaseModel):
    """Final synthesized forensic report."""

    request: AnalysisRequest
    summary: str = ""
    conclusions: list[ReportConclusion] = Field(default_factory=list)
    materials: list[ReportMaterial] = Field(default_factory=list)
    methods: list[MethodRecord] = Field(default_factory=list)
    results: list[ResultRecord] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    reproducibility: ReproducibilityInfo = Field(default_factory=ReproducibilityInfo)
    appendix: list[AppendixItem] = Field(default_factory=list)
    provenance: ProvenanceRecord | None = None
    writing_profiles: list[WritingProfile] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    anomaly_samples: list[AnomalySample] = Field(default_factory=list)
    agent_reports: list[AgentReport] = Field(default_factory=list)
    narrative: NarrativeBundle | None = None
    entity_aliases: EntityAliases | None = None
    cluster_view: ClusterView | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def request_fingerprint(request: AnalysisRequest) -> str:
    payload = request.model_dump_json(exclude_none=True, exclude={"llm_backend"})
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _require(value: list[str], field_name: str) -> None:
    if value:
        return
    raise ValueError(f"{field_name} is required for the selected task")
