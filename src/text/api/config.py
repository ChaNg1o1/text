"""API configuration via pydantic-settings."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings, overridable via environment variables."""

    model_config = {"env_prefix": "TEXT_"}

    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "tauri://localhost",
        "http://tauri.localhost",
    ]
    db_dir: Path = Path.home() / ".cache" / "text"
    backends_config: Path = Path.home() / ".config" / "text" / "backends.json"
    preload_embedding: bool = True
    max_concurrent_analyses: int = 1
    observability_enabled: bool = True
    observability_slow_request_ms: float = 1200.0
    observability_event_limit: int = 200
