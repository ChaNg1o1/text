"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import text.api.deps as deps
from text.api.config import Settings
from text.api.models import HealthResponse
from text.api.routers import analyses, backends, features, uploads
from text.api.services.analysis_store import AnalysisStore
from text.api.services.analysis_task_registry import analysis_task_registry


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialise and tear down shared resources."""
    settings: Settings = deps.get_settings()
    store = AnalysisStore(db_dir=settings.db_dir)
    # Ensure the DB is ready
    await store._ensure_db()
    deps._store = store

    # Initialise progress manager if available
    try:
        from text.api.services.progress_manager import progress_manager

        deps._progress_manager = progress_manager  # type: ignore[attr-defined]
    except (ImportError, AttributeError):
        pass

    if settings.preload_embedding:
        try:
            from text.features.embeddings import preload_embedding_model

            preload_embedding_model()
        except Exception:
            # Warmup is best-effort and should never block API startup.
            pass

    yield

    await analysis_task_registry.cancel_all()
    await store.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and configure the FastAPI application."""
    if settings is None:
        settings = deps.get_settings()

    app = FastAPI(
        title="Text Forensics Platform",
        description="Digital forensics text analysis with multi-agent collaboration",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(uploads.router)
    app.include_router(analyses.router)
    app.include_router(backends.router)
    app.include_router(features.router)

    # SSE progress router (optional, Phase 2)
    try:
        from text.api.routers import progress

        app.include_router(progress.router)
    except ImportError:
        pass

    # Health endpoint
    @app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
    async def health() -> HealthResponse:
        from text import __version__

        return HealthResponse(version=__version__)

    return app
