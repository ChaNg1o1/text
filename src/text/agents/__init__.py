"""Multi-agent forensic text analysis team."""

from .computational import ComputationalAgent
from .orchestrator import OrchestratorAgent
from .psycholinguistics import PsycholinguisticsAgent
from .sociolinguistics import SociolinguisticsAgent
from .stylometry import StylometryAgent
from .synthesis import SynthesisAgent
from .taste import build_taste_outputs

__all__ = [
    "ComputationalAgent",
    "OrchestratorAgent",
    "PsycholinguisticsAgent",
    "SociolinguisticsAgent",
    "StylometryAgent",
    "SynthesisAgent",
    "build_taste_outputs",
]
