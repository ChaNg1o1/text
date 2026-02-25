"""API configuration via pydantic-settings."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings, overridable via environment variables."""

    model_config = {"env_prefix": "TEXT_"}

    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]
    db_dir: Path = Path.home() / ".cache" / "text"
    backends_config: Path = Path.home() / ".config" / "text" / "backends.json"
    preload_embedding: bool = True
    max_concurrent_analyses: int = 1
