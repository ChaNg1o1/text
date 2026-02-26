from __future__ import annotations

import asyncio

import pytest

from text.api.services.progress_manager import ProgressManager


@pytest.mark.asyncio
async def test_progress_manager_replays_events_for_late_subscribers() -> None:
    pm = ProgressManager()
    analysis_id = "analysis-replay"

    pm.emit(analysis_id, "analysis_started", {"analysis_id": analysis_id})
    pm.emit(analysis_id, "log", {"message": "feature extraction started"})

    stream = pm.subscribe(analysis_id)
    try:
        first = await asyncio.wait_for(anext(stream), timeout=0.2)
        second = await asyncio.wait_for(anext(stream), timeout=0.2)

        assert first.event == "analysis_started"
        assert first.data["analysis_id"] == analysis_id
        assert isinstance(first.data["timestamp"], float)

        assert second.event == "log"
        assert second.data["message"] == "feature extraction started"
        assert isinstance(second.data["timestamp"], float)

        pm.complete(analysis_id)
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(stream), timeout=0.2)
    finally:
        await stream.aclose()


@pytest.mark.asyncio
async def test_progress_manager_emits_heartbeat_for_idle_streams() -> None:
    pm = ProgressManager()
    analysis_id = "analysis-heartbeat"

    stream = pm.subscribe(analysis_id, heartbeat_interval=0.01)
    try:
        heartbeat = await asyncio.wait_for(anext(stream), timeout=0.2)
        assert heartbeat.event == "heartbeat"
        assert isinstance(heartbeat.data["timestamp"], float)

        pm.emit(analysis_id, "log", {"message": "hello"})

        log_event = None
        for _ in range(5):
            candidate = await asyncio.wait_for(anext(stream), timeout=0.2)
            if candidate.event == "log":
                log_event = candidate
                break

        assert log_event is not None
        assert log_event.data["message"] == "hello"
    finally:
        pm.complete(analysis_id)
        await stream.aclose()
