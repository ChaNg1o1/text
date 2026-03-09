from __future__ import annotations

import importlib


def test_llm_modules_keep_litellm_lazy() -> None:
    lazy_mod = importlib.reload(importlib.import_module("text.llm._lazy"))
    importlib.reload(importlib.import_module("text.llm.backend"))
    importlib.reload(importlib.import_module("text.agents.stylometry"))

    assert lazy_mod._litellm_module is None
