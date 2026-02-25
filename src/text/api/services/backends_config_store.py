"""Utilities for managing custom backend configuration persistence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _default_document() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$comment": "Configuration file for custom LLM backends. Managed by Text web settings.",
        "backends": {},
        "provider_keys": {},
    }


class BackendsConfigStore:
    """Read and mutate the custom `backends.json` configuration file."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def list_raw_backends(self) -> dict[str, dict[str, Any]]:
        """Return raw backend objects from the config file."""
        document = self._read_document()
        raw_backends = document.get("backends", {})
        if not isinstance(raw_backends, dict):
            return {}

        result: dict[str, dict[str, Any]] = {}
        for name, config in raw_backends.items():
            if isinstance(name, str) and isinstance(config, dict):
                result[name] = config
        return result

    def upsert_backend(self, name: str, config: dict[str, Any]) -> None:
        """Create or update a backend entry and persist the config file."""
        document = self._read_document()
        raw_backends = document.get("backends")
        if not isinstance(raw_backends, dict):
            raw_backends = {}
            document["backends"] = raw_backends

        existing = raw_backends.get(name)
        merged = existing.copy() if isinstance(existing, dict) else {}
        for key, value in config.items():
            if value is None:
                merged.pop(key, None)
            else:
                merged[key] = value
        raw_backends[name] = merged

        self._write_document(document)

    def delete_backend(self, name: str) -> bool:
        """Delete a backend entry. Returns True when it existed."""
        document = self._read_document()
        raw_backends = document.get("backends")
        if not isinstance(raw_backends, dict):
            return False
        existed = name in raw_backends
        raw_backends.pop(name, None)
        if existed:
            self._write_document(document)
        return existed

    def list_provider_keys(self) -> dict[str, str]:
        """Return stored built-in provider keys (without exposing values elsewhere)."""
        document = self._read_document()
        keys = document.get("provider_keys")
        if not isinstance(keys, dict):
            return {}

        result: dict[str, str] = {}
        for provider, value in keys.items():
            if isinstance(provider, str) and isinstance(value, str) and value.strip():
                result[provider.strip().lower()] = value.strip()
        return result

    def set_provider_key(self, provider: str, api_key: str | None) -> None:
        """Set or clear stored key for a built-in provider."""
        normalized_provider = provider.strip().lower()
        document = self._read_document()
        keys = document.get("provider_keys")
        if not isinstance(keys, dict):
            keys = {}
            document["provider_keys"] = keys

        if api_key is None:
            keys.pop(normalized_provider, None)
        else:
            stripped = api_key.strip()
            if stripped:
                keys[normalized_provider] = stripped
            else:
                keys.pop(normalized_provider, None)

        self._write_document(document)

    def _read_document(self) -> dict[str, Any]:
        if not self.path.exists():
            return _default_document()

        try:
            parsed = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return _default_document()

        if not isinstance(parsed, dict):
            return _default_document()

        if not isinstance(parsed.get("backends"), dict):
            parsed["backends"] = {}
        if not isinstance(parsed.get("provider_keys"), dict):
            parsed["provider_keys"] = {}

        return parsed

    def _write_document(self, document: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        tmp_path.write_text(payload, encoding="utf-8")
        tmp_path.replace(self.path)
        self.path.chmod(0o600)
