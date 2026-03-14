"""Minimal RAGFlow OpenAI-compatible chat client used by report QA."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from text.api.config import Settings


class RagflowConfigError(ValueError):
    """Raised when RAGFlow QA is enabled but the configuration is incomplete."""


def _normalize_base_url(raw: str) -> str:
    normalized = raw.strip().rstrip("/")
    if not normalized:
        raise RagflowConfigError("RAGFlow base URL cannot be empty.")
    if not normalized.startswith(("http://", "https://")):
        raise RagflowConfigError("RAGFlow base URL must start with http:// or https://")

    parts = urlsplit(normalized)
    if not parts.netloc:
        raise RagflowConfigError("RAGFlow base URL must include a host.")

    path = (parts.path or "").rstrip("/")
    if path.endswith("/api/v1"):
        path = path[: -len("/api/v1")]

    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, ""))


@dataclass(frozen=True)
class RagflowChatConfig:
    """Connection settings for a single RAGFlow chat assistant."""

    base_url: str
    api_key: str
    chat_id: str
    model: str
    include_references: bool
    timeout_seconds: float

    @property
    def completions_url(self) -> str:
        base = _normalize_base_url(self.base_url)
        return f"{base}/api/v1/chats_openai/{self.chat_id}/chat/completions"


class RagflowChatClient:
    """Small async client around RAGFlow's OpenAI-compatible chat endpoint."""

    def __init__(self, config: RagflowChatConfig) -> None:
        self._config = config

    @classmethod
    def from_settings(cls, settings: Settings) -> "RagflowChatClient":
        if settings.qa_provider != "ragflow":
            raise RagflowConfigError("RAGFlow QA is not enabled.")

        base_url = (settings.ragflow_base_url or "").strip()
        api_key = (settings.ragflow_api_key or "").strip()
        chat_id = (settings.ragflow_chat_id or "").strip()
        model = (settings.ragflow_model or "ragflow").strip() or "ragflow"

        missing: list[str] = []
        if not base_url:
            missing.append("TEXT_RAGFLOW_BASE_URL")
        if not api_key:
            missing.append("TEXT_RAGFLOW_API_KEY")
        if not chat_id:
            missing.append("TEXT_RAGFLOW_CHAT_ID")
        if missing:
            raise RagflowConfigError(
                "RAGFlow QA is enabled but missing required settings: "
                + ", ".join(missing)
            )

        return cls(
            RagflowChatConfig(
                base_url=base_url,
                api_key=api_key,
                chat_id=chat_id,
                model=model,
                include_references=settings.ragflow_reference,
                timeout_seconds=max(settings.ragflow_timeout_seconds, 1.0),
            )
        )

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self._config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }

        if self._config.include_references:
            payload["extra_body"] = {"reference": True}

        body = await self._post_json(payload)
        if isinstance(body.get("code"), int) and body.get("code") not in {0, None}:
            raise RuntimeError(str(body.get("message") or "RAGFlow request failed."))

        try:
            message = body["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("Unexpected RAGFlow response shape.") from exc

        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            text_parts = [
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ]
            return "".join(text_parts)
        return ""

    async def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        import httpx

        headers = {
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self._config.timeout_seconds) as client:
            response = await client.post(
                self._config.completions_url,
                headers=headers,
                json=payload,
            )

        try:
            data = response.json()
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"RAGFlow returned a non-JSON response (status={response.status_code})."
            ) from exc

        if response.is_success:
            if isinstance(data, dict):
                return data
            raise RuntimeError("Unexpected RAGFlow response payload.")

        detail = ""
        if isinstance(data, dict):
            detail = str(data.get("message") or data.get("detail") or "").strip()
        if not detail:
            detail = response.text.strip() or response.reason_phrase
        raise RuntimeError(f"RAGFlow request failed ({response.status_code}): {detail}")
