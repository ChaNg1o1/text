"""Threshold profiles for deterministic forensic decisions."""

from __future__ import annotations

from pydantic import BaseModel, Field

from text.ingest.schema import ConclusionGrade, DEFAULT_THRESHOLD_PROFILE_VERSION


class ThresholdProfile(BaseModel):
    version: str = DEFAULT_THRESHOLD_PROFILE_VERSION
    verification_min_tokens: int = 250
    verification_min_cjk_chars: int = 400
    reference_min_texts: int = 3
    reference_min_tokens: int = 1000
    reference_min_cjk_chars: int = 1600
    clustering_min_tokens: int = 80
    clustering_min_cjk_chars: int = 140
    sockpuppet_min_texts: int = 5
    sockpuppet_min_tokens: int = 800
    sockpuppet_min_cjk_chars: int = 1300
    open_set_margin_log10_lr: float = 0.5
    clustering_distance_threshold: float = Field(default=0.46, ge=0.0, le=1.0)
    text_view_threshold: float = Field(default=0.62, ge=0.0, le=1.0)
    time_view_threshold: float = Field(default=0.58, ge=0.0, le=1.0)
    network_view_threshold: float = Field(default=0.52, ge=0.0, le=1.0)
    grade_boundaries: dict[ConclusionGrade, float] = Field(
        default_factory=lambda: {
            ConclusionGrade.STRONG_SUPPORT: 2.0,
            ConclusionGrade.MODERATE_SUPPORT: 1.0,
            ConclusionGrade.INCONCLUSIVE: -1.0,
            ConclusionGrade.MODERATE_AGAINST: -2.0,
        }
    )

    def grade_for_log10_lr(self, value: float) -> ConclusionGrade:
        if value >= self.grade_boundaries[ConclusionGrade.STRONG_SUPPORT]:
            return ConclusionGrade.STRONG_SUPPORT
        if value >= self.grade_boundaries[ConclusionGrade.MODERATE_SUPPORT]:
            return ConclusionGrade.MODERATE_SUPPORT
        if value > self.grade_boundaries[ConclusionGrade.INCONCLUSIVE]:
            return ConclusionGrade.INCONCLUSIVE
        if value > self.grade_boundaries[ConclusionGrade.MODERATE_AGAINST]:
            return ConclusionGrade.MODERATE_AGAINST
        return ConclusionGrade.STRONG_AGAINST


def default_threshold_profile() -> ThresholdProfile:
    return ThresholdProfile()
