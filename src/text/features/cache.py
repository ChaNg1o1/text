"""SQLite-backed feature cache using aiosqlite."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Awaitable, Callable

import aiosqlite

from text.ingest.schema import FeatureVector

logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS feature_cache (
    content_hash TEXT PRIMARY KEY,
    text_id      TEXT NOT NULL,
    data         TEXT NOT NULL,
    created_at   REAL NOT NULL DEFAULT (unixepoch('now'))
);
"""

_SELECT_SQL = "SELECT data FROM feature_cache WHERE content_hash = ?;"
_UPSERT_SQL = """
INSERT INTO feature_cache (content_hash, text_id, data)
VALUES (?, ?, ?)
ON CONFLICT(content_hash) DO UPDATE SET
    text_id = excluded.text_id,
    data = excluded.data,
    created_at = unixepoch('now');
"""


class FeatureCache:
    """Async SQLite-backed cache for computed feature vectors."""

    DEFAULT_DB_DIR = Path.home() / ".cache" / "text"

    def __init__(self, db_path: Path | str | None = None) -> None:
        if db_path is None:
            self.DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
            db_path = self.DEFAULT_DB_DIR / "features.db"
        self._db_path = str(db_path)
        self._db: aiosqlite.Connection | None = None

    async def _ensure_db(self) -> aiosqlite.Connection:
        """Lazily open the database connection and ensure the table exists."""
        if self._db is None:
            self._db = await aiosqlite.connect(self._db_path)
            await self._db.execute("PRAGMA journal_mode=WAL")
            await self._db.execute("PRAGMA synchronous=NORMAL")
            await self._db.execute(_CREATE_TABLE_SQL)
            await self._db.commit()
        return self._db

    async def close(self) -> None:
        """Close the database connection."""
        if self._db is not None:
            await self._db.close()
            self._db = None

    async def get(self, content_hash: str) -> FeatureVector | None:
        """Retrieve cached features by content hash. Returns None on miss."""
        db = await self._ensure_db()
        async with db.execute(_SELECT_SQL, (content_hash,)) as cursor:
            row = await cursor.fetchone()

        if row is None:
            return None

        try:
            data = json.loads(row[0])
            return FeatureVector.model_validate(data)
        except Exception as exc:
            logger.warning("Corrupted cache entry for hash %s: %s", content_hash, exc)
            return None

    async def get_many(self, content_hashes: list[str]) -> dict[str, FeatureVector]:
        """Retrieve multiple cached vectors by hash in a single query."""
        if not content_hashes:
            return {}

        unique_hashes = list(dict.fromkeys(content_hashes))
        placeholders = ",".join("?" for _ in unique_hashes)
        query = (
            "SELECT content_hash, data FROM feature_cache "
            f"WHERE content_hash IN ({placeholders});"
        )

        db = await self._ensure_db()
        result: dict[str, FeatureVector] = {}
        async with db.execute(query, unique_hashes) as cursor:
            rows = await cursor.fetchall()

        for row in rows:
            chash = str(row[0])
            try:
                data = json.loads(row[1])
                result[chash] = FeatureVector.model_validate(data)
            except Exception as exc:
                logger.warning("Corrupted cache entry for hash %s: %s", chash, exc)
        return result

    async def put(self, feature_vector: FeatureVector) -> None:
        """Store a computed FeatureVector in the cache."""
        await self.put_many([feature_vector])

    async def put_many(self, vectors: list[FeatureVector]) -> None:
        """Store many feature vectors in the cache in a single transaction."""
        if not vectors:
            return
        db = await self._ensure_db()
        rows = [(v.content_hash, v.text_id, v.model_dump_json()) for v in vectors]
        await db.executemany(_UPSERT_SQL, rows)
        await db.commit()

    async def get_or_compute(
        self,
        text_id: str,
        content: str,
        compute_fn: Callable[[str, str], Awaitable[FeatureVector]],
    ) -> FeatureVector:
        """Return cached features or compute, store, and return them.

        Parameters
        ----------
        text_id:
            Logical identifier for the text.
        content:
            Raw text content (used to derive the cache key).
        compute_fn:
            An async callable ``(text_id, content) -> FeatureVector`` invoked on
            cache miss.
        """
        chash = self.content_hash(content)
        cached = await self.get(chash)
        if cached is not None:
            logger.debug("Cache hit for %s (hash=%s)", text_id, chash)
            # Update text_id in case it changed for same content
            if cached.text_id != text_id:
                cached = cached.model_copy(update={"text_id": text_id})
            return cached

        logger.debug("Cache miss for %s (hash=%s), computing...", text_id, chash)
        fv = await compute_fn(text_id, content)
        # Ensure content_hash is set correctly
        if fv.content_hash != chash:
            fv = fv.model_copy(update={"content_hash": chash})
        await self.put(fv)
        return fv

    @staticmethod
    def content_hash(text: str) -> str:
        """BLAKE2b hash of text content, truncated to 16 hex chars."""
        return hashlib.blake2b(text.encode(), digest_size=8).hexdigest()
