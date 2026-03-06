"""Persistent application settings shared by API, CLI, and frontend."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from text.ingest.schema import TaskType


DEFAULT_APP_SETTINGS_PATH = Path.home() / ".config" / "text" / "settings.json"


class PromptOverrides(BaseModel):
    stylometry: str = ""
    writing_process: str = ""
    computational: str = ""
    sociolinguistics: str = ""
    synthesis: str = ""
    qa: str = ""


class AnalysisDefaults(BaseModel):
    default_llm_backend: str | None = None
    default_task: TaskType = TaskType.FULL
    default_top_k: int = Field(default=3, ge=1, le=20)
    default_case_analyst: str = ""
    default_case_client: str = ""
    qa_temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    qa_max_tokens: int = Field(default=1200, ge=128, le=8192)


class AppSettingsDocument(BaseModel):
    analysis_defaults: AnalysisDefaults = Field(default_factory=AnalysisDefaults)
    prompt_overrides: PromptOverrides = Field(default_factory=PromptOverrides)


def apply_prompt_override(base_prompt: str, override: str | None) -> str:
    extra = (override or "").strip()
    if not extra:
        return base_prompt
    return (
        f"{base_prompt}\n\n"
        "Additional operator instructions:\n"
        f"{extra}"
    )


class AppSettingsStore:
    """Read and persist application settings as JSON."""

    def __init__(self, path: Path = DEFAULT_APP_SETTINGS_PATH) -> None:
        self.path = path

    def load(self) -> AppSettingsDocument:
        if not self.path.exists():
            return AppSettingsDocument()

        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return AppSettingsDocument()

        if not isinstance(payload, dict):
            return AppSettingsDocument()
        try:
            return AppSettingsDocument.model_validate(payload)
        except Exception:
            return AppSettingsDocument()

    def save(self, document: AppSettingsDocument) -> AppSettingsDocument:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = document.model_dump_json(indent=2) + "\n"
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        tmp_path.write_text(payload, encoding="utf-8")
        tmp_path.replace(self.path)
        self.path.chmod(0o600)
        return document
