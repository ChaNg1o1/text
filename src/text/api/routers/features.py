"""Feature data endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from text.api.deps import get_store
from text.api.models import AnalysisStatus, FeaturesResponse
from text.api.services.analysis_store import AnalysisStore

router = APIRouter(prefix="/api/v1", tags=["features"])


@router.get("/analyses/{analysis_id}/features", response_model=FeaturesResponse)
async def get_features(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> FeaturesResponse:
    """Return extracted feature vectors for a completed analysis."""
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if detail.status not in (AnalysisStatus.COMPLETED,):
        raise HTTPException(status_code=409, detail="Analysis not yet completed")
    if detail.features is None:
        raise HTTPException(status_code=404, detail="No features available for this analysis")
    return FeaturesResponse(analysis_id=analysis_id, features=detail.features)
