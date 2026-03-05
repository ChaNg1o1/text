from __future__ import annotations

import asyncio
import time

import pytest

import text.agents.computational as computational_mod
from text.agents.computational import ComputationalAgent


@pytest.mark.asyncio
async def test_given_analysis_when_running_statistics_then_dispatches_work_to_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = ComputationalAgent(model=None)
    observed: dict[str, object] = {}

    async def _fake_to_thread(func, *args, **kwargs):
        observed["func"] = func
        observed["args"] = args
        observed["kwargs"] = kwargs
        return {"auto_findings": [], "outlier_dims": {}}

    monkeypatch.setattr(computational_mod.asyncio, "to_thread", _fake_to_thread)

    report = await agent.analyze([], task_context="ctx", raw_texts=[])

    assert observed["func"] == agent._compute_statistics
    assert observed["args"] == ([],)
    assert observed["kwargs"] == {"raw_texts": []}
    assert report.agent_name == "computational"


@pytest.mark.asyncio
async def test_given_slow_statistics_when_analyzing_then_event_loop_stays_responsive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = ComputationalAgent(model=None)

    def _slow_compute_statistics(*_args, **_kwargs):
        time.sleep(0.2)
        return {"auto_findings": [], "outlier_dims": {}}

    monkeypatch.setattr(agent, "_compute_statistics", _slow_compute_statistics)

    ticked = asyncio.Event()

    async def _ticker() -> None:
        await asyncio.sleep(0.01)
        ticked.set()

    analyze_task = asyncio.create_task(agent.analyze([], task_context="ctx", raw_texts=[]))
    ticker_task = asyncio.create_task(_ticker())

    # If CPU-heavy work blocks the loop, this wait times out.
    await asyncio.wait_for(ticked.wait(), timeout=0.12)
    await asyncio.gather(analyze_task, ticker_task)
