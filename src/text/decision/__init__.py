"""Deterministic decision engine for forensic text analysis."""

from .engine import DecisionEngine
from .thresholds import ThresholdProfile, default_threshold_profile

__all__ = ["DecisionEngine", "ThresholdProfile", "default_threshold_profile"]
