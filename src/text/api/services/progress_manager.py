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
from dataclasses import dataclass
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

    def __init__(self) -> None:
        # analysis_id -> list of subscriber queues
        self._subscribers: dict[str, list[asyncio.Queue[SSEEvent | None]]] = {}

    def emit(self, analysis_id: str, event: str, data: dict[str, Any] | None = None) -> None:
        """Publish an event to all subscribers of the given analysis."""
        sse = SSEEvent(event=event, data={"timestamp": time.time(), **(data or {})})
        for queue in self._subscribers.get(analysis_id, []):
            try:
                queue.put_nowait(sse)
            except asyncio.QueueFull:
                logger.warning("Dropping SSE event for analysis %s (queue full)", analysis_id)

    async def subscribe(self, analysis_id: str) -> AsyncIterator[SSEEvent]:
        """Yield SSEEvents for a given analysis until the stream ends (None sentinel)."""
        queue: asyncio.Queue[SSEEvent | None] = asyncio.Queue(maxsize=256)
        self._subscribers.setdefault(analysis_id, []).append(queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        finally:
            subs = self._subscribers.get(analysis_id, [])
            if queue in subs:
                subs.remove(queue)
            if not subs:
                self._subscribers.pop(analysis_id, None)

    def complete(self, analysis_id: str) -> None:
        """Signal end-of-stream to all subscribers."""
        for queue in self._subscribers.get(analysis_id, []):
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass
        self._subscribers.pop(analysis_id, None)


# Module-level singleton
progress_manager = ProgressManager()
