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
from typing import Any, AsyncIterator

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

    def __init__(self, history_size: int = 512, queue_size: int = 512) -> None:
        # analysis_id -> list of subscriber queues
        self._subscribers: dict[str, list[asyncio.Queue[SSEEvent | None]]] = {}
        # analysis_id -> recent event history (for late subscribers)
        self._history: dict[str, deque[SSEEvent]] = {}
        self._history_size = max(1, history_size)
        self._queue_size = max(1, queue_size)
        self._lock = Lock()

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

        for queue in subscribers:
            try:
                queue.put_nowait(sse)
            except asyncio.QueueFull:
                logger.warning("Dropping SSE event for analysis %s (queue full)", analysis_id)

    async def subscribe(
        self,
        analysis_id: str,
        *,
        heartbeat_interval: float | None = None,
    ) -> AsyncIterator[SSEEvent]:
        """Yield SSEEvents for a given analysis until the stream ends (None sentinel)."""
        queue: asyncio.Queue[SSEEvent | None] = asyncio.Queue(maxsize=self._queue_size)
        with self._lock:
            self._subscribers.setdefault(analysis_id, []).append(queue)
            for event in self._history.get(analysis_id, ()):
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning(
                        "Replay queue full for analysis %s; dropping oldest replay events",
                        analysis_id,
                    )
                    break
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

        for queue in subscribers:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass


# Module-level singleton
progress_manager = ProgressManager()
