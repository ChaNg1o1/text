"""Shared data models for the text forensics platform."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TaskType(str, Enum):
    ATTRIBUTION = "attribution"
    PROFILING = "profiling"
    SOCKPUPPET = "sockpuppet"
    FULL = "full"


class TextEntry(BaseModel):
    """A single text document for analysis."""

    id: str
    author: str
    content: str
    timestamp: datetime | None = None
    source: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalysisRequest(BaseModel):
    """Top-level analysis request."""

    texts: list[TextEntry]
    task: TaskType = TaskType.FULL
    compare_groups: list[list[str]] | None = None
    llm_backend: str = "default"


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
    """A statistically anomalous text sample (|z| > 2.0 in any feature dimension)."""

    text_id: str
    content: str
    outlier_dimensions: dict[str, float] = Field(default_factory=dict)


class AgentFinding(BaseModel):
    """A single finding from a discipline agent."""

    discipline: str
    category: str
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentReport(BaseModel):
    """Report from a single discipline agent."""

    agent_name: str
    discipline: str
    findings: list[AgentFinding] = Field(default_factory=list)
    summary: str = ""
    raw_llm_response: str | None = None


class PersonaDimension(BaseModel):
    """A single interpretable personality/profile dimension."""

    key: str
    label: str
    score: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_spans: list[str] = Field(default_factory=list)
    counter_evidence: list[str] = Field(default_factory=list)


class PersonaProfile(BaseModel):
    """A profile for one subject (author/group/overall corpus)."""

    subject: str
    summary: str = ""
    dimensions: list[PersonaDimension] = Field(default_factory=list)
    overall_confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class InsightItem(BaseModel):
    """A structured insight item with traceable evidence and taste score."""

    rank: int = Field(ge=1)
    discipline: str
    category: str
    insight: str
    confidence: float = Field(ge=0.0, le=1.0)
    taste_score: float = Field(ge=0.0, le=100.0)
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    supporting_disciplines: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TasteAssessment(BaseModel):
    """Corpus-level taste scoring summary."""

    overall_score: float = Field(ge=0.0, le=100.0)
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    methodology: str = ""


class ForensicReport(BaseModel):
    """Final synthesized forensic report."""

    request: AnalysisRequest
    agent_reports: list[AgentReport] = Field(default_factory=list)
    synthesis: str = ""
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    contradictions: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    persona_profiles: list[PersonaProfile] = Field(default_factory=list)
    anomaly_samples: list[AnomalySample] = Field(default_factory=list)
    insights: list[InsightItem] = Field(default_factory=list)
    taste_assessment: TasteAssessment | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
