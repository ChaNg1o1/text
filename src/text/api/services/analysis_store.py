"""SQLite-backed persistence for analysis records."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

import aiosqlite

from text.api.models import (
    AnalysisDetail,
    AnalysisListResponse,
    AnalysisPerf,
    AnalysisStatus,
    AnalysisSummary,
)
from text.ingest.schema import AnalysisRequest, FeatureVector

logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS analyses (
    id              TEXT PRIMARY KEY,
    status          TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    llm_backend     TEXT NOT NULL,
    request_json    TEXT NOT NULL,
    report_json     TEXT,
    features_json   TEXT,
    perf_json       TEXT,
    error_message   TEXT,
    text_count      INTEGER NOT NULL,
    author_count    INTEGER NOT NULL,
    created_at      REAL NOT NULL,
    completed_at    REAL
);
"""

_SUMMARY_COLUMNS_SQL = (
    "id, status, task_type, llm_backend, text_count, author_count, "
    "created_at, completed_at, error_message"
)

_CREATE_JOBS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS analysis_jobs (
    analysis_id      TEXT PRIMARY KEY,
    status           TEXT NOT NULL,
    dedupe_key       TEXT NOT NULL,
    lease_owner      TEXT,
    lease_expires_at REAL,
    heartbeat_at     REAL,
    retry_count      INTEGER NOT NULL DEFAULT 0,
    error_message    TEXT,
    created_at       REAL NOT NULL,
    updated_at       REAL NOT NULL
);
"""

_CREATE_PROGRESS_EVENTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS analysis_progress_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id TEXT NOT NULL,
    event       TEXT NOT NULL,
    data_json   TEXT NOT NULL,
    created_at  REAL NOT NULL
);
"""


class AnalysisStore:
    """Async SQLite store for analysis records, following the FeatureCache pattern."""

    def __init__(self, db_dir: Path) -> None:
        db_dir.mkdir(parents=True, exist_ok=True)
        self._db_path = str(db_dir / "analyses.db")
        self._db: aiosqlite.Connection | None = None

    async def _ensure_db(self) -> aiosqlite.Connection:
        if self._db is None:
            self._db = await aiosqlite.connect(self._db_path)
            self._db.row_factory = aiosqlite.Row
            await self._db.execute("PRAGMA journal_mode=WAL")
            await self._db.execute(_CREATE_TABLE_SQL)
            await self._ensure_column(
                self._db, table="analyses", column="perf_json", col_type="TEXT"
            )
            await self._db.execute(_CREATE_JOBS_TABLE_SQL)
            await self._db.execute(_CREATE_PROGRESS_EVENTS_TABLE_SQL)
            await self._db.execute(
                "CREATE INDEX IF NOT EXISTS idx_progress_events_analysis_id_id "
                "ON analysis_progress_events (analysis_id, id)"
            )
            await self._db.commit()
        return self._db

    @staticmethod
    async def _ensure_column(
        db: aiosqlite.Connection,
        *,
        table: str,
        column: str,
        col_type: str,
    ) -> None:
        """Best-effort idempotent column migration for SQLite."""
        async with db.execute(f"PRAGMA table_info({table})") as cur:
            columns = await cur.fetchall()
        existing = {str(row[1]) for row in columns}
        if column in existing:
            return
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type};")

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create(
        self,
        request_json: str,
        task_type: str,
        llm_backend: str,
        text_count: int,
        author_count: int,
    ) -> str:
        """Create a new analysis record and return its ID."""
        db = await self._ensure_db()
        analysis_id = uuid.uuid4().hex[:12]
        await db.execute(
            """
            INSERT INTO analyses (id, status, task_type, llm_backend, request_json,
                                  text_count, author_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                analysis_id,
                AnalysisStatus.PENDING.value,
                task_type,
                llm_backend,
                request_json,
                text_count,
                author_count,
                time.time(),
            ),
        )
        await db.commit()
        return analysis_id

    async def get(self, analysis_id: str) -> AnalysisDetail | None:
        """Fetch a single analysis by ID, returning full detail."""
        db = await self._ensure_db()
        async with db.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        detail, backfilled_report = self._row_to_detail(row)
        if backfilled_report and detail.report is not None:
            try:
                await db.execute(
                    "UPDATE analyses SET report_json = ? WHERE id = ?",
                    (detail.report.model_dump_json(), analysis_id),
                )
                await db.commit()
            except Exception:
                logger.warning("Failed to persist backfilled report for analysis %s", analysis_id)
        return detail

    async def get_request(self, analysis_id: str) -> AnalysisRequest | None:
        """Fetch and parse the original AnalysisRequest for an analysis ID."""
        db = await self._ensure_db()
        async with db.execute(
            "SELECT request_json FROM analyses WHERE id = ?", (analysis_id,)
        ) as cur:
            row = await cur.fetchone()
        if row is None or not row["request_json"]:
            return None
        try:
            return AnalysisRequest.model_validate_json(row["request_json"])
        except Exception:
            logger.warning("Failed to deserialize request for analysis %s", analysis_id)
            return None

    async def get_features(self, analysis_id: str) -> list[FeatureVector] | None:
        """Fetch and parse cached feature vectors for an analysis ID."""
        db = await self._ensure_db()
        async with db.execute("SELECT features_json FROM analyses WHERE id = ?", (analysis_id,)) as cur:
            row = await cur.fetchone()
        if row is None or not row["features_json"]:
            return None
        try:
            raw_items = json.loads(row["features_json"])
            if not isinstance(raw_items, list):
                return None
            return [FeatureVector.model_validate(item) for item in raw_items]
        except Exception:
            logger.warning("Failed to deserialize features for analysis %s", analysis_id)
            return None

    async def update_features(self, analysis_id: str, features_json: str) -> bool:
        """Persist serialized feature vectors without mutating analysis status."""
        db = await self._ensure_db()
        cursor = await db.execute(
            "UPDATE analyses SET features_json = ? WHERE id = ?",
            (features_json, analysis_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        task_type: str | None = None,
        search: str | None = None,
    ) -> AnalysisListResponse:
        """List analyses with pagination and optional filters."""
        db = await self._ensure_db()
        conditions: list[str] = []
        params: list[str | int] = []

        if status:
            conditions.append("status = ?")
            params.append(status)
        if task_type:
            conditions.append("task_type = ?")
            params.append(task_type)
        if search:
            conditions.append("id LIKE ?")
            params.append(f"%{search}%")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        # Total count
        async with db.execute(f"SELECT COUNT(*) FROM analyses {where}", params) as cur:
            total = (await cur.fetchone())[0]

        # Paginated results
        offset = (page - 1) * page_size
        query = f"""
            SELECT {_SUMMARY_COLUMNS_SQL} FROM analyses {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """
        async with db.execute(query, [*params, page_size, offset]) as cur:
            rows = await cur.fetchall()

        return AnalysisListResponse(
            items=[self._row_to_summary(r) for r in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def update_status(
        self,
        analysis_id: str,
        status: AnalysisStatus,
        *,
        report_json: str | None = None,
        features_json: str | None = None,
        perf_json: str | None = None,
        error_message: str | None = None,
        only_if_current: set[AnalysisStatus] | None = None,
    ) -> bool:
        """Update status and optionally attach report/features/error."""
        db = await self._ensure_db()
        sets = ["status = ?"]
        params: list[str | float | None] = [status.value]

        if report_json is not None:
            sets.append("report_json = ?")
            params.append(report_json)
        if features_json is not None:
            sets.append("features_json = ?")
            params.append(features_json)
        if perf_json is not None:
            sets.append("perf_json = ?")
            params.append(perf_json)
        if error_message is not None:
            sets.append("error_message = ?")
            params.append(error_message)
        if status in (AnalysisStatus.COMPLETED, AnalysisStatus.FAILED, AnalysisStatus.CANCELED):
            sets.append("completed_at = ?")
            params.append(time.time())

        where = "id = ?"
        params.append(analysis_id)
        if only_if_current:
            placeholders = ", ".join("?" for _ in only_if_current)
            where += f" AND status IN ({placeholders})"
            params.extend(
                state.value for state in sorted(only_if_current, key=lambda item: item.value)
            )

        cursor = await db.execute(f"UPDATE analyses SET {', '.join(sets)} WHERE {where}", params)
        await db.commit()
        return cursor.rowcount > 0

    async def delete(self, analysis_id: str) -> bool:
        """Delete an analysis. Returns True if a row was deleted."""
        db = await self._ensure_db()
        await db.execute("DELETE FROM analysis_jobs WHERE analysis_id = ?", (analysis_id,))
        await db.execute("DELETE FROM analysis_progress_events WHERE analysis_id = ?", (analysis_id,))
        cursor = await db.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
        await db.commit()
        return cursor.rowcount > 0

    async def append_progress_event(
        self,
        analysis_id: str,
        *,
        event: str,
        data_json: str,
        created_at: float | None = None,
        keep_latest: int = 512,
    ) -> None:
        db = await self._ensure_db()
        ts = created_at or time.time()
        await db.execute(
            """
            INSERT INTO analysis_progress_events (analysis_id, event, data_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (analysis_id, event, data_json, ts),
        )
        await db.execute(
            """
            DELETE FROM analysis_progress_events
            WHERE analysis_id = ?
              AND id NOT IN (
                SELECT id
                FROM analysis_progress_events
                WHERE analysis_id = ?
                ORDER BY id DESC
                LIMIT ?
              )
            """,
            (analysis_id, analysis_id, keep_latest),
        )
        await db.commit()

    async def list_progress_events(
        self,
        analysis_id: str,
        *,
        limit: int = 256,
    ) -> list[dict[str, Any]]:
        db = await self._ensure_db()
        async with db.execute(
            """
            SELECT event, data_json
            FROM analysis_progress_events
            WHERE analysis_id = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (analysis_id, limit),
        ) as cur:
            rows = await cur.fetchall()

        events: list[dict[str, Any]] = []
        for row in rows:
            try:
                payload = json.loads(str(row["data_json"]))
            except json.JSONDecodeError:
                logger.warning("Failed to decode progress event payload for analysis %s", analysis_id)
                continue
            if isinstance(payload, dict):
                events.append({"event": str(row["event"]), "data": payload})
        return events

    async def enqueue_job(self, analysis_id: str, dedupe_key: str) -> None:
        db = await self._ensure_db()
        now = time.time()
        await db.execute(
            """
            INSERT INTO analysis_jobs (
                analysis_id, status, dedupe_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(analysis_id) DO UPDATE SET
                status = excluded.status,
                dedupe_key = excluded.dedupe_key,
                updated_at = excluded.updated_at
            """,
            (analysis_id, "pending", dedupe_key, now, now),
        )
        await db.commit()

    async def lease_next_job(
        self,
        *,
        worker_id: str,
        lease_seconds: float = 30.0,
    ) -> tuple[str, AnalysisRequest] | None:
        db = await self._ensure_db()
        now = time.time()
        async with db.execute(
            """
            SELECT analysis_id
            FROM analysis_jobs
            WHERE status = 'pending'
               OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (now,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None

        analysis_id = str(row["analysis_id"])
        lease_expires_at = now + lease_seconds
        cursor = await db.execute(
            """
            UPDATE analysis_jobs
            SET status = 'running',
                lease_owner = ?,
                lease_expires_at = ?,
                heartbeat_at = ?,
                updated_at = ?
            WHERE analysis_id = ?
              AND (status = 'pending' OR (status = 'running' AND lease_expires_at < ?))
            """,
            (worker_id, lease_expires_at, now, now, analysis_id, now),
        )
        await db.commit()
        if cursor.rowcount == 0:
            return None
        request = await self.get_request(analysis_id)
        if request is None:
            return None
        return analysis_id, request

    async def heartbeat_job(
        self,
        analysis_id: str,
        *,
        worker_id: str,
        lease_seconds: float = 30.0,
    ) -> None:
        db = await self._ensure_db()
        now = time.time()
        await db.execute(
            """
            UPDATE analysis_jobs
            SET heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
            WHERE analysis_id = ? AND lease_owner = ?
            """,
            (now, now + lease_seconds, now, analysis_id, worker_id),
        )
        await db.commit()

    async def complete_job(
        self,
        analysis_id: str,
        *,
        status: str,
        error_message: str | None = None,
    ) -> None:
        db = await self._ensure_db()
        now = time.time()
        await db.execute(
            """
            UPDATE analysis_jobs
            SET status = ?, error_message = ?, lease_owner = NULL,
                lease_expires_at = NULL, heartbeat_at = ?, updated_at = ?
            WHERE analysis_id = ?
            """,
            (status, error_message, now, now, analysis_id),
        )
        await db.commit()

    async def cancel_job(self, analysis_id: str) -> None:
        await self.complete_job(analysis_id, status="canceled", error_message="Canceled by user")

    # ------------------------------------------------------------------
    # Row mapping
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_summary(row: aiosqlite.Row) -> AnalysisSummary:
        from datetime import datetime, timezone

        return AnalysisSummary(
            id=row["id"],
            status=AnalysisStatus(row["status"]),
            task_type=row["task_type"],
            llm_backend=row["llm_backend"],
            text_count=row["text_count"],
            author_count=row["author_count"],
            created_at=datetime.fromtimestamp(row["created_at"], tz=timezone.utc),
            completed_at=(
                datetime.fromtimestamp(row["completed_at"], tz=timezone.utc)
                if row["completed_at"]
                else None
            ),
            error_message=row["error_message"],
        )

    @staticmethod
    def _row_to_detail(row: aiosqlite.Row) -> tuple[AnalysisDetail, bool]:
        from datetime import datetime, timezone

        from text.decision.engine import DecisionEngine
        from text.ingest.schema import AnalysisRequest, ForensicReport

        request = None
        if row["request_json"]:
            try:
                request = AnalysisRequest.model_validate_json(row["request_json"])
            except Exception:
                logger.warning("Failed to deserialize request for analysis %s", row["id"])

        report = None
        backfilled_report = False
        if row["report_json"]:
            try:
                report = ForensicReport.model_validate_json(row["report_json"])
                backfilled_report = DecisionEngine().ensure_story_surfaces(
                    report, refresh_hash=True
                )
            except Exception:
                logger.warning("Failed to deserialize report for analysis %s", row["id"])

        perf: AnalysisPerf | None = None
        if row["perf_json"]:
            try:
                raw_perf: dict[str, Any] = json.loads(row["perf_json"])
                perf = AnalysisPerf.model_validate(raw_perf)
            except Exception:
                logger.warning("Failed to deserialize perf for analysis %s", row["id"])

        return (
            AnalysisDetail(
                id=row["id"],
                status=AnalysisStatus(row["status"]),
                task_type=row["task_type"],
                llm_backend=row["llm_backend"],
                text_count=row["text_count"],
                author_count=row["author_count"],
                created_at=datetime.fromtimestamp(row["created_at"], tz=timezone.utc),
                completed_at=(
                    datetime.fromtimestamp(row["completed_at"], tz=timezone.utc)
                    if row["completed_at"]
                    else None
                ),
                error_message=row["error_message"],
                request=request,
                report=report,
                perf=perf,
            ),
            backfilled_report,
        )
