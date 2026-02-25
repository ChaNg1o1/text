"""SQLite-backed persistence for analysis records."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path

import aiosqlite

from text.api.models import AnalysisDetail, AnalysisListResponse, AnalysisStatus, AnalysisSummary

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
    error_message   TEXT,
    text_count      INTEGER NOT NULL,
    author_count    INTEGER NOT NULL,
    created_at      REAL NOT NULL,
    completed_at    REAL
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
            await self._db.commit()
        return self._db

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
        return self._row_to_detail(row)

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
            SELECT * FROM analyses {where}
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
        error_message: str | None = None,
    ) -> None:
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
        if error_message is not None:
            sets.append("error_message = ?")
            params.append(error_message)
        if status in (AnalysisStatus.COMPLETED, AnalysisStatus.FAILED):
            sets.append("completed_at = ?")
            params.append(time.time())

        params.append(analysis_id)
        await db.execute(f"UPDATE analyses SET {', '.join(sets)} WHERE id = ?", params)
        await db.commit()

    async def delete(self, analysis_id: str) -> bool:
        """Delete an analysis. Returns True if a row was deleted."""
        db = await self._ensure_db()
        cursor = await db.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
        await db.commit()
        return cursor.rowcount > 0

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
    def _row_to_detail(row: aiosqlite.Row) -> AnalysisDetail:
        from datetime import datetime, timezone

        from text.ingest.schema import FeatureVector, ForensicReport

        report = None
        if row["report_json"]:
            try:
                report = ForensicReport.model_validate_json(row["report_json"])
            except Exception:
                logger.warning("Failed to deserialize report for analysis %s", row["id"])

        features = None
        if row["features_json"]:
            try:
                features = [
                    FeatureVector.model_validate(f) for f in json.loads(row["features_json"])
                ]
            except Exception:
                logger.warning("Failed to deserialize features for analysis %s", row["id"])

        return AnalysisDetail(
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
            report=report,
            features=features,
        )
