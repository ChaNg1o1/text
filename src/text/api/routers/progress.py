"""SSE progress streaming endpoint."""

from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import StreamingResponse

from text.api.deps import get_store
from text.api.models import AnalysisStatus, ProgressEventRecord, ProgressSnapshotResponse
from text.api.services.analysis_store import AnalysisStore
from text.api.services.progress_manager import progress_manager

router = APIRouter(prefix="/api/v1", tags=["progress"])
STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get("/analyses/{analysis_id}/progress")
async def stream_progress(
    analysis_id: str,
    replay: bool = True,
    store: AnalysisStore = Depends(get_store),
) -> StreamingResponse:
    """Stream SSE events for analysis progress."""
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # If already in a terminal status, return a single terminal event.
    if detail.status in (
        AnalysisStatus.COMPLETED,
        AnalysisStatus.FAILED,
        AnalysisStatus.CANCELED,
    ):

        async def _done_stream():
            if detail.status == AnalysisStatus.COMPLETED:
                event_name = "analysis_completed"
            elif detail.status == AnalysisStatus.CANCELED:
                event_name = "analysis_cancelled"
            else:
                event_name = "analysis_failed"
            data = {
                "analysis_id": analysis_id,
                "status": detail.status.value,
                "error": detail.error_message,
                "timestamp": time.time(),
            }
            yield f"event: {event_name}\ndata: {json.dumps(data)}\n\n"

        return StreamingResponse(
            _done_stream(),
            media_type="text/event-stream",
            headers=STREAM_HEADERS,
        )

    async def _event_stream():
        async for event in progress_manager.subscribe(
            analysis_id,
            heartbeat_interval=15,
            replay_history=replay,
        ):
            yield event.encode()

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )


@router.get("/analyses/{analysis_id}/progress/snapshot", response_model=ProgressSnapshotResponse)
async def get_progress_snapshot(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> ProgressSnapshotResponse:
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    events = await store.list_progress_events(analysis_id)
    return ProgressSnapshotResponse(
        analysis_id=analysis_id,
        events=[ProgressEventRecord.model_validate(item) for item in events],
    )
