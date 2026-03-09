"""Lazy-loading helpers for optional heavy LLM client dependencies."""

from __future__ import annotations

from importlib import import_module
from types import ModuleType

_litellm_module: ModuleType | None = None


def get_litellm() -> ModuleType:
    """Import ``litellm`` on first use instead of at module import time."""
    global _litellm_module
    if _litellm_module is None:
        module = import_module("litellm")
        module.suppress_debug_info = True
        _litellm_module = module
    return _litellm_module


class LazyLiteLLMProxy:
    """Proxy that defers the real ``litellm`` import until attribute access."""

    __slots__ = ()

    def __getattr__(self, name: str) -> object:
        return getattr(get_litellm(), name)

    def __setattr__(self, name: str, value: object) -> None:
        setattr(get_litellm(), name, value)


litellm = LazyLiteLLMProxy()
