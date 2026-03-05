"""Observability endpoint for runtime HTTP diagnostics."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

import text.api.deps as deps
from text.api.models import ObservabilitySnapshot
from text.api.services.observability import ObservabilityRegistry

router = APIRouter(prefix="/api/v1", tags=["observability"])


@router.get("/observability", response_model=ObservabilitySnapshot)
async def get_observability_snapshot(
    top_routes: int = Query(20, ge=1, le=200),
    recent: int = Query(50, ge=1, le=500),
    observability: ObservabilityRegistry = Depends(deps.get_observability),
) -> ObservabilitySnapshot:
    """Return current in-memory observability snapshot."""
    return observability.snapshot(top_routes=top_routes, recent=recent)
