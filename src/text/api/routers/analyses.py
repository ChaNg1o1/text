"""Analysis CRUD endpoints."""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from text.api.deps import get_store
from text.api.models import (
    AnalysisDetail,
    AnalysisListResponse,
    AnalysisStatus,
    AnalysisSummary,
    CreateAnalysisRequest,
    RetryAnalysisRequest,
)
from text.api.services.analysis_store import AnalysisStore
from text.api.services.progress_manager import progress_manager
from text.ingest.schema import AnalysisRequest, request_fingerprint

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["analyses"])


def _threshold_profile_version() -> str:
    from text.decision import default_threshold_profile

    return default_threshold_profile().version


def _to_summary(detail: AnalysisDetail) -> AnalysisSummary:
    return AnalysisSummary(**detail.model_dump(exclude={"request", "report", "perf"}))


async def _enqueue_analysis_request(
    request: AnalysisRequest,
    *,
    store: AnalysisStore,
) -> AnalysisSummary:
    authors = sorted({t.author for t in request.texts})

    analysis_id = await store.create(
        request_json=request.model_dump_json(),
        task_type=request.task.value,
        llm_backend=request.llm_backend,
        text_count=len(request.texts),
        author_count=len(authors),
    )

    dedupe_key = hashlib.sha256(
        (
            f"{request_fingerprint(request)}|"
            f"{_threshold_profile_version()}|"
            f"{request.llm_backend}"
        ).encode("utf-8")
    ).hexdigest()
    await store.enqueue_job(analysis_id, dedupe_key)

    progress_manager.emit(
        analysis_id,
        "analysis_started",
        {
            "analysis_id": analysis_id,
            "status": AnalysisStatus.PENDING.value,
            "queued": True,
        },
    )

    detail = await store.get(analysis_id)
    assert detail is not None
    return _to_summary(detail)


@router.post("/analyses", response_model=AnalysisSummary, status_code=202)
async def create_analysis(
    body: CreateAnalysisRequest,
    store: AnalysisStore = Depends(get_store),
) -> AnalysisSummary:
    """Create a new analysis and start background execution."""
    # Build the internal AnalysisRequest
    request = AnalysisRequest(
        texts=body.texts,
        task=body.task,
        task_params=body.task_params,
        llm_backend=body.llm_backend,
        case_metadata=body.case_metadata,
        artifacts=body.artifacts,
        activity_events=body.activity_events,
        interaction_edges=body.interaction_edges,
    )
    return await _enqueue_analysis_request(request, store=store)


@router.get("/analyses", response_model=AnalysisListResponse)
async def list_analyses(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    task_type: str | None = Query(None),
    search: str | None = Query(None),
    store: AnalysisStore = Depends(get_store),
) -> AnalysisListResponse:
    """List analyses with pagination and filtering."""
    return await store.list(
        page=page,
        page_size=page_size,
        status=status,
        task_type=task_type,
        search=search,
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> AnalysisDetail:
    """Get full analysis details including report."""
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return detail


@router.post("/analyses/{analysis_id}/cancel", response_model=AnalysisSummary)
async def cancel_analysis(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> AnalysisSummary:
    """Cancel a pending/running analysis."""
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if detail.status == AnalysisStatus.CANCELED:
        return _to_summary(detail)

    if detail.status in (AnalysisStatus.COMPLETED, AnalysisStatus.FAILED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel analysis in '{detail.status.value}' state",
        )

    updated = await store.update_status(
        analysis_id,
        AnalysisStatus.CANCELED,
        error_message="Canceled by user",
        only_if_current={AnalysisStatus.PENDING, AnalysisStatus.RUNNING},
    )
    await store.cancel_job(analysis_id)

    if updated:
        progress_manager.emit(
            analysis_id,
            "analysis_cancelled",
            {"analysis_id": analysis_id, "reason": "canceled_by_user"},
        )
        progress_manager.complete(analysis_id)

    latest = await store.get(analysis_id)
    assert latest is not None
    return _to_summary(latest)


@router.delete("/analyses/{analysis_id}", status_code=204)
async def delete_analysis(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> None:
    """Delete an analysis record."""
    deleted = await store.delete(analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found")


@router.post("/analyses/{analysis_id}/retry", response_model=AnalysisSummary, status_code=202)
async def retry_analysis(
    analysis_id: str,
    body: RetryAnalysisRequest,
    store: AnalysisStore = Depends(get_store),
) -> AnalysisSummary:
    request = await store.get_request(analysis_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    retried_request = request.model_copy(
        update={
            "llm_backend": body.llm_backend,
            "case_metadata": body.case_metadata or request.case_metadata,
        }
    )
    return await _enqueue_analysis_request(retried_request, store=store)
