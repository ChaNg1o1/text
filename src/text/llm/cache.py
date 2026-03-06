"""Simple SQLite-backed prompt/result cache for LLM calls."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3


_DB_PATH = Path.home() / ".cache" / "text" / "llm_cache.db"
_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS llm_cache (
    cache_key TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    temperature REAL NOT NULL,
    prompt_hash TEXT NOT NULL,
    response_text TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    created_at REAL NOT NULL
);
"""


@dataclass(slots=True)
class CachedLLMResponse:
    response_text: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


def get_cached_response(cache_key: str) -> CachedLLMResponse | None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(_CREATE_SQL)
        row = conn.execute(
            "SELECT response_text, prompt_tokens, completion_tokens FROM llm_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    if row is None:
        return None
    return CachedLLMResponse(
        response_text=str(row[0]),
        prompt_tokens=int(row[1]) if row[1] is not None else None,
        completion_tokens=int(row[2]) if row[2] is not None else None,
    )


def store_cached_response(
    cache_key: str,
    *,
    model_id: str,
    temperature: float,
    prompt_hash: str,
    response_text: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    created_at: float,
) -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(_CREATE_SQL)
        conn.execute(
            """
            INSERT INTO llm_cache (
                cache_key, model_id, temperature, prompt_hash, response_text,
                prompt_tokens, completion_tokens, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                response_text = excluded.response_text,
                prompt_tokens = excluded.prompt_tokens,
                completion_tokens = excluded.completion_tokens,
                created_at = excluded.created_at
            """,
            (
                cache_key,
                model_id,
                temperature,
                prompt_hash,
                response_text,
                prompt_tokens,
                completion_tokens,
                created_at,
            ),
        )
        conn.commit()
