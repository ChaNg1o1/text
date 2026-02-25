"""Shared FastAPI dependencies."""

from __future__ import annotations

from functools import lru_cache

from text.api.config import Settings
from text.api.services.analysis_store import AnalysisStore


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


_store: AnalysisStore | None = None


async def get_store() -> AnalysisStore:
    """Return the singleton AnalysisStore instance.

    The store is initialised during app lifespan startup and torn down on
    shutdown (see ``app.py``).
    """
    if _store is None:
        raise RuntimeError("AnalysisStore not initialised -- app lifespan did not run")
    return _store
