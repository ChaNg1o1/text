"""API configuration via pydantic-settings."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings

from text.app_settings import DEFAULT_APP_SETTINGS_PATH


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
    app_settings_config: Path = DEFAULT_APP_SETTINGS_PATH
    preload_embedding: bool = True
    max_concurrent_analyses: int = 1
    observability_enabled: bool = True
    observability_slow_request_ms: float = 1200.0
    observability_event_limit: int = 200
    qa_provider: Literal["local", "ragflow"] = "local"
    ragflow_base_url: str | None = None
    ragflow_api_key: str | None = None
    ragflow_chat_id: str | None = None
    ragflow_model: str = "ragflow"
    ragflow_reference: bool = True
    ragflow_timeout_seconds: float = 45.0
