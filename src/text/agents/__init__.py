"""Multi-agent forensic text analysis team."""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "ComputationalAgent",
    "OrchestratorAgent",
    "PsycholinguisticsAgent",
    "WritingProcessAgent",
    "SociolinguisticsAgent",
    "StylometryAgent",
    "SynthesisAgent",
]

_EXPORTS = {
    "ComputationalAgent": (".computational", "ComputationalAgent"),
    "OrchestratorAgent": (".orchestrator", "OrchestratorAgent"),
    "PsycholinguisticsAgent": (".psycholinguistics", "PsycholinguisticsAgent"),
    "WritingProcessAgent": (".psycholinguistics", "WritingProcessAgent"),
    "SociolinguisticsAgent": (".sociolinguistics", "SociolinguisticsAgent"),
    "StylometryAgent": (".stylometry", "StylometryAgent"),
    "SynthesisAgent": (".synthesis", "SynthesisAgent"),
}


def __getattr__(name: str) -> Any:
    try:
        module_name, attr_name = _EXPORTS[name]
    except KeyError as exc:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc

    module = import_module(module_name, __name__)
    return getattr(module, attr_name)
