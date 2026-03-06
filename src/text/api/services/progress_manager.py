"""SSE progress event bus for real-time analysis updates.

Implements a fan-out pattern: one ``ProgressManager`` instance holds
per-analysis queues.  ``AnalysisRunner`` emits events; SSE endpoint
subscribers consume them.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock
from typing import Any, AsyncIterator, Awaitable, Callable

logger = logging.getLogger(__name__)


@dataclass
class SSEEvent:
    """A single server-sent event."""

    event: str
    data: dict[str, Any]

    def encode(self) -> str:
        return f"event: {self.event}\ndata: {json.dumps(self.data)}\n\n"


class ProgressManager:
    """Fan-out event bus backed by asyncio.Queue per subscriber."""

    def __init__(
        self,
        history_size: int = 512,
        queue_size: int = 512,
        drop_log_every: int = 100,
    ) -> None:
        # analysis_id -> list of subscriber queues
        self._subscribers: dict[str, list[asyncio.Queue[SSEEvent | None]]] = {}
        # analysis_id -> recent event history (for late subscribers)
        self._history: dict[str, deque[SSEEvent]] = {}
        # analysis_id -> dropped event count (queue full)
        self._dropped_events: dict[str, int] = {}
        self._history_size = max(1, history_size)
        self._queue_size = max(1, queue_size)
        self._drop_log_every = max(1, drop_log_every)
        self._lock = Lock()
        self._persist_callback: Callable[[str, SSEEvent], Awaitable[None]] | None = None

    def set_persist_callback(
        self,
        callback: Callable[[str, SSEEvent], Awaitable[None]] | None,
    ) -> None:
        self._persist_callback = callback

    def emit(self, analysis_id: str, event: str, data: dict[str, Any] | None = None) -> None:
        """Publish an event to all subscribers of the given analysis."""
        sse = SSEEvent(event=event, data={"timestamp": time.time(), **(data or {})})
        with self._lock:
            history = self._history.setdefault(
                analysis_id,
                deque(maxlen=self._history_size),
            )
            history.append(sse)
            subscribers = list(self._subscribers.get(analysis_id, []))

        dropped = 0
        for queue in subscribers:
            try:
                queue.put_nowait(sse)
            except asyncio.QueueFull:
                dropped += 1

        if dropped > 0:
            with self._lock:
                dropped_total = self._dropped_events.get(analysis_id, 0) + dropped
                self._dropped_events[analysis_id] = dropped_total
            if dropped_total == 1 or dropped_total % self._drop_log_every == 0:
                logger.warning(
                    "Dropping SSE events for analysis %s (queue full, dropped_total=%d)",
                    analysis_id,
                    dropped_total,
                )

        if self._persist_callback is not None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            if loop is not None:
                loop.create_task(
                    self._persist_callback(analysis_id, sse),
                    name=f"persist-progress:{analysis_id}:{event}",
                )

    async def subscribe(
        self,
        analysis_id: str,
        *,
        heartbeat_interval: float | None = None,
        replay_history: bool = True,
    ) -> AsyncIterator[SSEEvent]:
        """Yield SSEEvents for a given analysis until the stream ends (None sentinel)."""
        queue: asyncio.Queue[SSEEvent | None] = asyncio.Queue(maxsize=self._queue_size)
        with self._lock:
            self._subscribers.setdefault(analysis_id, []).append(queue)
            history = self._history.get(analysis_id, ())
            if not replay_history:
                replay_events: list[SSEEvent] = []
            elif len(history) > self._queue_size:
                logger.warning(
                    "Replay history exceeds queue size for analysis %s; "
                    "replaying only the latest %d events",
                    analysis_id,
                    self._queue_size,
                )
                replay_events = list(history)[-self._queue_size :]
            else:
                replay_events = list(history)

            for event in replay_events:
                queue.put_nowait(event)
        try:
            while True:
                try:
                    if heartbeat_interval is None:
                        event = await queue.get()
                    else:
                        event = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
                except asyncio.TimeoutError:
                    yield SSEEvent(event="heartbeat", data={"timestamp": time.time()})
                    continue

                if event is None:
                    break
                yield event
        finally:
            with self._lock:
                subs = self._subscribers.get(analysis_id, [])
                if queue in subs:
                    subs.remove(queue)
                if not subs:
                    self._subscribers.pop(analysis_id, None)

    def complete(self, analysis_id: str) -> None:
        """Signal end-of-stream to all subscribers."""
        with self._lock:
            subscribers = list(self._subscribers.get(analysis_id, []))
            self._subscribers.pop(analysis_id, None)
            self._history.pop(analysis_id, None)
            self._dropped_events.pop(analysis_id, None)

        for queue in subscribers:
            # Ensure end-of-stream is delivered even when the queue is full.
            while True:
                try:
                    queue.put_nowait(None)
                    break
                except asyncio.QueueFull:
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break


# Module-level singleton
progress_manager = ProgressManager()
