"""SSE progress streaming endpoint."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import StreamingResponse

from text.api.deps import get_store
from text.api.models import AnalysisStatus
from text.api.services.analysis_store import AnalysisStore
from text.api.services.progress_manager import progress_manager

router = APIRouter(prefix="/api/v1", tags=["progress"])


@router.get("/analyses/{analysis_id}/progress")
async def stream_progress(
    analysis_id: str,
    store: AnalysisStore = Depends(get_store),
) -> StreamingResponse:
    """Stream SSE events for analysis progress."""
    detail = await store.get(analysis_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # If already completed/failed, return a single terminal event
    if detail.status in (AnalysisStatus.COMPLETED, AnalysisStatus.FAILED):

        async def _done_stream():
            event_name = (
                "analysis_completed"
                if detail.status == AnalysisStatus.COMPLETED
                else "analysis_failed"
            )
            import json

            data = {"analysis_id": analysis_id, "status": detail.status.value}
            yield f"event: {event_name}\ndata: {json.dumps(data)}\n\n"

        return StreamingResponse(_done_stream(), media_type="text/event-stream")

    async def _event_stream():
        heartbeat_interval = 15
        last_heartbeat = time.time()

        async for event in progress_manager.subscribe(analysis_id):
            yield event.encode()
            last_heartbeat = time.time()

            # Send heartbeat if no events for a while
            if time.time() - last_heartbeat > heartbeat_interval:
                import json

                yield f"event: heartbeat\ndata: {json.dumps({'timestamp': time.time()})}\n\n"
                last_heartbeat = time.time()

    return StreamingResponse(_event_stream(), media_type="text/event-stream")
