"""API request / response schemas."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from text.ingest.schema import (
    FeatureVector,
    ForensicReport,
    TaskType,
    TextEntry,
)


# ------------------------------------------------------------------
# Enums
# ------------------------------------------------------------------


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# ------------------------------------------------------------------
# Upload
# ------------------------------------------------------------------


class UploadResponse(BaseModel):
    texts: list[TextEntry]
    text_count: int
    author_count: int
    authors: list[str]


# ------------------------------------------------------------------
# Analysis
# ------------------------------------------------------------------


class CreateAnalysisRequest(BaseModel):
    texts: list[TextEntry]
    task: TaskType = TaskType.FULL
    compare_groups: list[list[str]] | None = None
    llm_backend: str = Field(min_length=1)


class AnalysisSummary(BaseModel):
    """Lightweight representation for list views."""

    id: str
    status: AnalysisStatus
    task_type: str
    llm_backend: str
    text_count: int
    author_count: int
    created_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None


class AnalysisPerf(BaseModel):
    """Performance breakdown for a completed analysis."""

    feature_extraction_ms: float | None = None
    agent_analysis_ms: float | None = None
    synthesis_ms: float | None = None
    total_ms: float | None = None
    rust_ms: float | None = None
    spacy_ms: float | None = None
    embedding_ms: float | None = None
    cache_get_ms: float | None = None
    cache_put_ms: float | None = None
    cache_hits: int | None = None
    cache_misses: int | None = None
    texts_total: int | None = None


class AnalysisDetail(AnalysisSummary):
    """Full representation including report and performance breakdown."""

    report: ForensicReport | None = None
    perf: AnalysisPerf | None = None


class AnalysisListResponse(BaseModel):
    items: list[AnalysisSummary]
    total: int
    page: int
    page_size: int


# ------------------------------------------------------------------
# Features
# ------------------------------------------------------------------


class FeaturesResponse(BaseModel):
    analysis_id: str
    features: list[FeatureVector]


# ------------------------------------------------------------------
# Backends
# ------------------------------------------------------------------


class BackendInfo(BaseModel):
    name: str
    model: str
    provider: str = "custom"
    has_api_key: bool = False


class BackendsResponse(BaseModel):
    backends: list[BackendInfo]


class CustomBackendInfo(BaseModel):
    name: str
    provider: str
    model: str
    api_base: str
    api_key_env: str | None = None
    has_api_key: bool = False


class CustomBackendsResponse(BaseModel):
    backends: list[CustomBackendInfo]


class UpsertCustomBackendRequest(BaseModel):
    provider: Literal["openai_compatible", "anthropic_compatible"]
    model: str = Field(min_length=1, max_length=300)
    api_base: str = Field(min_length=1, max_length=2048)
    api_key: str | None = None
    api_key_env: str | None = None
    clear_api_key: bool = False

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("api_base must start with http:// or https://")
        return normalized

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("model cannot be empty")
        return normalized

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("api_key_env")
    @classmethod
    def validate_api_key_env(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class BackendTestResponse(BaseModel):
    backend: str
    success: bool
    detail: str
    latency_ms: int | None = None


# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
