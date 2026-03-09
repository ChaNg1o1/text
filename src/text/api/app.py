"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
import json
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import text.api.deps as deps
from text.api.config import Settings
from text.api.models import HealthResponse
from text.api.routers import analyses, backends, features, observability, qa, settings, uploads
from text.api.services.analysis_store import AnalysisStore
from text.api.services.analysis_worker import AnalysisWorker
from text.api.services.observability import ObservabilityRegistry, http_observability_middleware
from text.api.services.progress_manager import progress_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialise and tear down shared resources."""
    settings: Settings = deps.get_settings()
    store = AnalysisStore(db_dir=settings.db_dir)
    # Ensure the DB is ready
    await store._ensure_db()
    deps._store = store
    deps._observability = ObservabilityRegistry(
        enabled=settings.observability_enabled,
        slow_request_ms=settings.observability_slow_request_ms,
        event_limit=settings.observability_event_limit,
    )
    app.state.observability = deps._observability
    worker = AnalysisWorker(store)
    await worker.start()
    app.state.analysis_worker = worker
    progress_manager.set_persist_callback(
        lambda analysis_id, event: store.append_progress_event(
            analysis_id,
            event=event.event,
            data_json=json.dumps(event.data, ensure_ascii=False),
            created_at=float(event.data.get("timestamp", 0.0) or 0.0),
        )
    )

    # Initialise progress manager if available
    try:
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

    progress_manager.set_persist_callback(None)
    await worker.stop()
    await store.close()
    deps._store = None
    deps._observability = None


def create_app(config: Settings | None = None) -> FastAPI:
    """Build and configure the FastAPI application."""
    if config is None:
        config = deps.get_settings()

    app = FastAPI(
        title="Text Detective Platform",
        description="Clue-first text investigation with multi-agent collaboration",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(http_observability_middleware)

    # Routers
    app.include_router(uploads.router)
    app.include_router(analyses.router)
    app.include_router(backends.router)
    app.include_router(settings.router)
    app.include_router(features.router)
    app.include_router(observability.router)
    app.include_router(qa.router)

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
