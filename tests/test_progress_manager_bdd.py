from __future__ import annotations

import asyncio

import pytest

from text.api.services.progress_manager import ProgressManager


@pytest.mark.asyncio
async def test_given_many_events_before_subscribe_when_replaying_then_only_latest_history_is_returned() -> None:
    pm = ProgressManager(history_size=25, queue_size=32)
    analysis_id = "bdd-replay-window"

    for seq in range(200):
        pm.emit(analysis_id, "log", {"seq": seq})

    stream = pm.subscribe(analysis_id)
    try:
        replayed = []
        for _ in range(25):
            event = await asyncio.wait_for(anext(stream), timeout=0.2)
            replayed.append(int(event.data["seq"]))

        assert replayed == list(range(175, 200))
    finally:
        pm.complete(analysis_id)
        await stream.aclose()


@pytest.mark.asyncio
async def test_given_history_larger_than_queue_when_subscribing_then_latest_queue_window_is_replayed() -> None:
    pm = ProgressManager(history_size=30, queue_size=5)
    analysis_id = "bdd-replay-queue-window"

    for seq in range(20):
        pm.emit(analysis_id, "log", {"seq": seq})

    stream = pm.subscribe(analysis_id)
    try:
        replayed = []
        for _ in range(5):
            event = await asyncio.wait_for(anext(stream), timeout=0.2)
            replayed.append(int(event.data["seq"]))

        assert replayed == [15, 16, 17, 18, 19]
    finally:
        pm.complete(analysis_id)
        await stream.aclose()


@pytest.mark.asyncio
async def test_given_event_storm_when_consumer_is_slow_then_memory_stays_bounded_and_no_crash() -> None:
    pm = ProgressManager(history_size=32, queue_size=16, drop_log_every=25)
    analysis_id = "bdd-event-storm"

    # Start one subscriber, consume exactly one event, then stop consuming.
    stream = pm.subscribe(analysis_id)
    first_event_task = asyncio.create_task(anext(stream))
    await asyncio.sleep(0)
    pm.emit(analysis_id, "analysis_started", {"analysis_id": analysis_id})
    first = await asyncio.wait_for(first_event_task, timeout=0.2)
    assert first.event == "analysis_started"

    for seq in range(5000):
        pm.emit(analysis_id, "log", {"seq": seq})

    assert len(pm._history[analysis_id]) == 32
    assert pm._subscribers[analysis_id][0].qsize() <= 16
    assert pm._dropped_events.get(analysis_id, 0) > 0

    pm.complete(analysis_id)

    # Stream should always terminate, even if complete() was called on a full queue.
    seen = 0
    while True:
        try:
            await asyncio.wait_for(anext(stream), timeout=0.2)
            seen += 1
            assert seen < 64
        except StopAsyncIteration:
            break

    await stream.aclose()
    assert analysis_id not in pm._history
    assert analysis_id not in pm._subscribers
    assert analysis_id not in pm._dropped_events


@pytest.mark.asyncio
async def test_given_full_queue_when_events_are_dropped_then_warning_is_throttled() -> None:
    warning_calls: list[tuple[str, tuple[object, ...]]] = []

    pm = ProgressManager(history_size=8, queue_size=1, drop_log_every=50)
    analysis_id = "bdd-throttled-warning"

    import text.api.services.progress_manager as progress_mod

    original_warning = progress_mod.logger.warning

    def _fake_warning(message: str, *args: object) -> None:
        warning_calls.append((message, args))

    progress_mod.logger.warning = _fake_warning
    try:
        stream = pm.subscribe(analysis_id)
        first_event_task = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        pm.emit(analysis_id, "analysis_started", {"analysis_id": analysis_id})
        await asyncio.wait_for(first_event_task, timeout=0.2)

        # Queue size is 1: one event is buffered, all subsequent ones are dropped.
        for seq in range(501):
            pm.emit(analysis_id, "log", {"seq": seq})

        dropped_total = pm._dropped_events.get(analysis_id, 0)
        assert dropped_total == 500

        # Expect warnings at dropped_total = 1, 50, 100, ..., 500
        assert len(warning_calls) == 11
    finally:
        progress_mod.logger.warning = original_warning
        pm.complete(analysis_id)
        await stream.aclose()


@pytest.mark.asyncio
async def test_given_queue_is_full_when_complete_is_called_then_end_marker_is_still_delivered() -> None:
    pm = ProgressManager(history_size=8, queue_size=2)
    analysis_id = "bdd-complete-on-full-queue"

    stream = pm.subscribe(analysis_id)
    first_event_task = asyncio.create_task(anext(stream))
    await asyncio.sleep(0)
    pm.emit(analysis_id, "analysis_started", {"analysis_id": analysis_id})
    await asyncio.wait_for(first_event_task, timeout=0.2)

    # Fill queue and keep consumer idle.
    pm.emit(analysis_id, "log", {"seq": 1})
    pm.emit(analysis_id, "log", {"seq": 2})
    assert pm._subscribers[analysis_id][0].qsize() == 2

    pm.complete(analysis_id)

    received_events: list[str] = []
    while True:
        try:
            event = await asyncio.wait_for(anext(stream), timeout=0.2)
            received_events.append(event.event)
        except StopAsyncIteration:
            break

    # Oldest buffered events may be dropped to guarantee the end marker is delivered.
    assert received_events == ["log"]
    await stream.aclose()


@pytest.mark.asyncio
async def test_given_multiple_analyses_when_bursting_events_then_state_is_isolated_per_analysis() -> None:
    pm = ProgressManager(history_size=10, queue_size=16)
    a1 = "bdd-isolation-a1"
    a2 = "bdd-isolation-a2"

    for seq in range(30):
        pm.emit(a1, "log", {"seq": seq})
    for seq in range(7):
        pm.emit(a2, "log", {"seq": seq})

    assert len(pm._history[a1]) == 10
    assert len(pm._history[a2]) == 7
    assert [event.data["seq"] for event in pm._history[a1]] == list(range(20, 30))
    assert [event.data["seq"] for event in pm._history[a2]] == list(range(7))

    stream = pm.subscribe(a2)
    try:
        replayed = []
        for _ in range(7):
            event = await asyncio.wait_for(anext(stream), timeout=0.2)
            replayed.append(int(event.data["seq"]))
        assert replayed == list(range(7))
    finally:
        pm.complete(a2)
        await stream.aclose()

    pm.complete(a1)
    assert not pm._history
    assert not pm._subscribers
    assert not pm._dropped_events
