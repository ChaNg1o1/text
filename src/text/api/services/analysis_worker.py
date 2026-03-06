"""Persistent worker loop for queued analyses."""

from __future__ import annotations

import asyncio
import logging
import uuid

from text.api.models import AnalysisStatus
from text.api.services.analysis_runner import AnalysisRunner
from text.api.services.analysis_store import AnalysisStore

logger = logging.getLogger(__name__)


class AnalysisWorker:
    """Polls the SQLite queue and executes pending analyses."""

    def __init__(self, store: AnalysisStore, *, poll_interval_s: float = 0.5) -> None:
        self._store = store
        self._poll_interval_s = poll_interval_s
        self._worker_id = f"worker-{uuid.uuid4().hex[:8]}"
        self._runner = AnalysisRunner(store)
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_loop(), name=f"analysis-worker:{self._worker_id}")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stop.is_set():
            leased = await self._store.lease_next_job(worker_id=self._worker_id)
            if leased is None:
                await asyncio.sleep(self._poll_interval_s)
                continue

            analysis_id, request = leased
            heartbeat_task = asyncio.create_task(
                self._heartbeat_loop(analysis_id),
                name=f"analysis-heartbeat:{analysis_id}",
            )
            try:
                await self._runner.run(analysis_id, request)
                detail = await self._store.get(analysis_id)
                status = detail.status.value if detail is not None else AnalysisStatus.FAILED.value
                await self._store.complete_job(analysis_id, status=status, error_message=detail.error_message if detail else None)
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Worker failed while executing analysis %s", analysis_id)
                await self._store.complete_job(analysis_id, status="failed", error_message=str(exc))
            finally:
                heartbeat_task.cancel()
                await asyncio.gather(heartbeat_task, return_exceptions=True)

    async def _heartbeat_loop(self, analysis_id: str) -> None:
        while not self._stop.is_set():
            await asyncio.sleep(10.0)
            await self._store.heartbeat_job(analysis_id, worker_id=self._worker_id)
