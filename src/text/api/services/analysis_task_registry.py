"""Track background analysis tasks for cancellation and lifecycle cleanup."""

from __future__ import annotations

import asyncio


class AnalysisTaskRegistry:
    """In-memory registry for active analysis asyncio tasks."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    async def register(self, analysis_id: str, task: asyncio.Task[None]) -> None:
        """Register or replace the task for an analysis."""
        async with self._lock:
            previous = self._tasks.get(analysis_id)
            self._tasks[analysis_id] = task

        if previous is not None and not previous.done() and previous is not task:
            previous.cancel()
            await asyncio.gather(previous, return_exceptions=True)

    async def cancel(self, analysis_id: str) -> bool:
        """Cancel an active task if present. Returns True if cancellation was issued."""
        async with self._lock:
            task = self._tasks.get(analysis_id)

        if task is None or task.done():
            return False

        task.cancel()
        return True

    async def discard(self, analysis_id: str) -> None:
        """Remove an analysis task from the registry."""
        async with self._lock:
            self._tasks.pop(analysis_id, None)

    async def cancel_all(self) -> None:
        """Cancel all active analysis tasks and wait for them to settle."""
        async with self._lock:
            tasks = list(self._tasks.values())
            self._tasks.clear()

        for task in tasks:
            if not task.done():
                task.cancel()

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


analysis_task_registry = AnalysisTaskRegistry()
