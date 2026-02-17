"""Shared data models for the text forensics platform."""

from __future__ import annotations

from datetime import datetime
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
    llm_backend: str = "claude"


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


class ForensicReport(BaseModel):
    """Final synthesized forensic report."""

    request: AnalysisRequest
    agent_reports: list[AgentReport] = Field(default_factory=list)
    synthesis: str = ""
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    contradictions: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
