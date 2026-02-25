"""Analysis CRUD endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from text.api.deps import get_store
from text.api.models import (
    AnalysisDetail,
    AnalysisListResponse,
    AnalysisStatus,
    AnalysisSummary,
    CreateAnalysisRequest,
)
from text.api.services.analysis_store import AnalysisStore
from text.ingest.schema import AnalysisRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["analyses"])


@router.post("/analyses", response_model=AnalysisSummary, status_code=202)
async def create_analysis(
    body: CreateAnalysisRequest,
    background_tasks: BackgroundTasks,
    store: AnalysisStore = Depends(get_store),
) -> AnalysisSummary:
    """Create a new analysis and start background execution."""
    # Build the internal AnalysisRequest
    request = AnalysisRequest(
        texts=body.texts,
        task=body.task,
        compare_groups=body.compare_groups,
        llm_backend=body.llm_backend,
    )
    authors = sorted({t.author for t in request.texts})

    analysis_id = await store.create(
        request_json=request.model_dump_json(),
        task_type=request.task.value,
        llm_backend=request.llm_backend,
        text_count=len(request.texts),
        author_count=len(authors),
    )

    # Schedule background analysis (Phase 2 will wire AnalysisRunner here)
    background_tasks.add_task(_run_analysis_bg, analysis_id, request, store)

    detail = await store.get(analysis_id)
    assert detail is not None
    return AnalysisSummary(**detail.model_dump(exclude={"report", "perf"}))


async def _run_analysis_bg(
    analysis_id: str,
    request: AnalysisRequest,
    store: AnalysisStore,
) -> None:
    """Background task placeholder -- Phase 2 replaces with AnalysisRunner."""
    try:
        from text.api.services.analysis_runner import AnalysisRunner

        runner = AnalysisRunner(store)
        await runner.run(analysis_id, request)
    except ImportError:
        logger.warning("AnalysisRunner not available, marking analysis as failed")
        await store.update_status(
            analysis_id,
            AnalysisStatus.FAILED,
            error_message="Analysis runner not available",
        )


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


@router.delete("/analyses/{analysis_id}", status_code=204)
async def delete_analysis(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> None:
    """Delete an analysis record."""
    deleted = await store.delete(analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found")
