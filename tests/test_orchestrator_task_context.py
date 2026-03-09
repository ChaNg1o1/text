from __future__ import annotations

from datetime import datetime, timezone

from text.agents.orchestrator import OrchestratorAgent
from text.ingest.schema import (
    ActivityEvent,
    AnalysisRequest,
    ArtifactKind,
    ArtifactRecord,
    InteractionEdge,
    TaskType,
    TextEntry,
)


def test_clue_extraction_context_prioritizes_osint_signals() -> None:
    request = AnalysisRequest(
        texts=[
            TextEntry(
                id="t1",
                author="acct_a",
                content="test",
                source="telegram",
                timestamp=datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc),
                metadata={
                    "platform": "telegram",
                    "topic": "crypto",
                    "url": "https://example.com/post/1",
                },
            )
        ],
        task=TaskType.CLUE_EXTRACTION,
        llm_backend="demo-backend",
        artifacts=[
            ArtifactRecord(
                artifact_id="art-1",
                kind=ArtifactKind.FILE_EXPORT,
                sha256="abc",
                byte_count=123,
                source_name="dump.json",
            )
        ],
        activity_events=[
            ActivityEvent(
                event_id="evt-1",
                account_id="acct_a",
                event_type="post",
                occurred_at=datetime(2026, 3, 1, 10, 5, tzinfo=timezone.utc),
                topic="crypto",
            )
        ],
        interaction_edges=[
            InteractionEdge(
                source_account_id="acct_a",
                target_account_id="acct_b",
                relation_type="reply",
            )
        ],
    )

    context = OrchestratorAgent._build_task_context(request)

    assert "Prioritize OSINT-style leads first" in context
    assert "Text source brief:" in context
    assert "source=telegram" in context
    assert "platform=telegram" in context
    assert "topic=crypto" in context
    assert "Supplementary request signals:" in context
    assert "Artifacts available: 1 total" in context
    assert "Activity events: 1 total" in context
    assert "Interaction edges: 1 total" in context
