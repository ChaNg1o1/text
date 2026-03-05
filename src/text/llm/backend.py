"""Unified LLM backend using litellm.

Only user-defined backends from ``backends.json`` are supported.
"""

from __future__ import annotations

import json
import logging
import os
import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import litellm

logger = logging.getLogger(__name__)

# Suppress litellm's noisy default logging
litellm.suppress_debug_info = True

# Default search paths for the backends config file (first match wins).
_DEFAULT_CONFIG_PATHS: list[Path] = [
    Path("backends.json"),
    Path.home() / ".config" / "text" / "backends.json",
]


@dataclass
class _UsageStats:
    """Tracks cumulative token usage across calls."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    request_count: int = 0


@dataclass
class CustomBackend:
    """A user-defined backend entry loaded from backends.json."""

    name: str
    provider: str  # "openai_compatible" | "anthropic_compatible"
    model: str
    api_base: str
    api_key: str | None = None
    api_key_env: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def resolve_api_key(self) -> str | None:
        """Resolve API key: explicit value -> env var -> None."""
        if self.api_key:
            return self.api_key
        if self.api_key_env:
            key = os.environ.get(self.api_key_env)
            if key:
                return key
        return None


def load_backends_config(config_path: Path | str | None = None) -> dict[str, CustomBackend]:
    """Load custom backend definitions from a JSON file.

    If *config_path* is None, searches the default locations. Returns an
    empty dict when no config file is found (this is not an error).
    """
    if config_path is not None:
        paths = [Path(config_path)]
    else:
        paths = _DEFAULT_CONFIG_PATHS

    for p in paths:
        if p.is_file():
            return _parse_config(p)

    return {}


def _parse_config(path: Path) -> dict[str, CustomBackend]:
    """Parse a backends.json file into a name -> CustomBackend mapping."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read backends config %s: %s", path, exc)
        return {}

    backends_raw = raw.get("backends", {})
    if not isinstance(backends_raw, dict):
        logger.warning("backends.json 'backends' key must be an object")
        return {}

    result: dict[str, CustomBackend] = {}
    for name, cfg in backends_raw.items():
        if not isinstance(cfg, dict):
            logger.warning("Skipping invalid backend entry '%s'", name)
            continue
        provider = cfg.get("provider", "")
        model = cfg.get("model", "")
        api_base = cfg.get("api_base", "")
        if not model or not api_base:
            logger.warning(
                "Backend '%s' missing required 'model' or 'api_base', skipping", name
            )
            continue
        result[name] = CustomBackend(
            name=name,
            provider=provider,
            model=model,
            api_base=api_base,
            api_key=cfg.get("api_key"),
            api_key_env=cfg.get("api_key_env"),
            extra={
                k: v
                for k, v in cfg.items()
                if k not in ("provider", "model", "api_base", "api_key", "api_key_env")
            },
        )
    return result


class LLMBackend:
    """Unified LLM interface using litellm.

    Wraps litellm.acompletion to provide a consistent async interface across
    user-defined providers with retry logic and usage tracking.

    Backends from backends.json are resolved
    at construction time and produce the correct litellm call parameters
    (model, api_base, api_key) for OpenAI-compatible and Anthropic-compatible
    third-party APIs.
    """

    # Environment variable names per provider prefix
    _ENV_KEY_MAP: dict[str, str] = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
    }

    _MAX_RETRIES = 3
    _RETRY_BASE_DELAY = 1.0  # seconds

    def __init__(
        self,
        backend: str = "default",
        api_key: str | None = None,
        config_path: Path | str | None = None,
    ) -> None:
        """Initialize with backend name and optional API key.

        Args:
            backend: Name defined in backends.json, or ``default`` to use the
                     first available custom backend.
            api_key: Explicit API key. Overrides all other key resolution.
            config_path: Path to a backends.json file. When None, the default
                         search paths are used.

        Raises:
            ValueError: If *backend* is not recognised.
        """
        self._api_base: str | None = None
        self._custom_backend: CustomBackend | None = None
        self._config_path = config_path

        custom_backends = load_backends_config(config_path)
        selected_backend = backend.strip()
        if selected_backend in {"", "default"}:
            if not custom_backends:
                raise ValueError(
                    "No custom backends configured. Add at least one backend in backends.json."
                )
            selected_backend = sorted(custom_backends)[0]

        cb = custom_backends.get(selected_backend)
        if cb is None:
            all_names = sorted(custom_backends)
            raise ValueError(
                f"Unknown backend '{backend}'. Available: {', '.join(all_names) or '(none)'}."
            )

        self._custom_backend = cb
        # litellm routing: openai_compatible -> "openai/<model>"
        #                  anthropic_compatible -> "anthropic/<model>"
        if cb.provider == "openai_compatible":
            self._model = f"openai/{cb.model}"
        elif cb.provider == "anthropic_compatible":
            self._model = f"anthropic/{cb.model}"
        else:
            # Pass through as-is for other providers
            self._model = cb.model
        self._api_base = cb.api_base
        # Use the custom backend's resolved key unless caller overrides.
        if api_key is None:
            api_key = cb.resolve_api_key()

        self._api_key = api_key
        self._usage = _UsageStats()
        self._backend_name = selected_backend

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """Send a completion request and return the response text.

        Retries up to ``_MAX_RETRIES`` times with exponential back-off on
        transient errors (rate-limit, server error, timeout).
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        response = await self._call_with_retry(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
    ) -> dict:
        """Send a completion request expecting a JSON response.

        The system prompt is augmented with an instruction to respond in JSON.
        The raw text is then parsed; a ``ValueError`` is raised if parsing fails.
        """
        json_instruction = (
            "You MUST respond with valid JSON only. "
            "Do not include any text outside the JSON object."
        )
        augmented_system = f"{system_prompt}\n\n{json_instruction}"

        raw = await self.complete(
            system_prompt=augmented_system,
            user_prompt=user_prompt,
            temperature=temperature,
        )

        # Strip markdown code fences if the model wraps its output.
        text = raw.strip()
        if text.startswith("```"):
            # Remove opening fence (```json or ```)
            first_newline = text.index("\n") if "\n" in text else len(text)
            text = text[first_newline + 1 :]
            # Remove closing fence
            if text.endswith("```"):
                text = text[: -len("```")]
            text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("LLM returned invalid JSON: %s\nRaw response:\n%s", exc, raw[:500])
            raise ValueError(
                f"LLM response was not valid JSON: {exc}. "
                "Try rephrasing the prompt or lowering the temperature."
            ) from exc

    @classmethod
    def available_backends(cls, config_path: Path | str | None = None) -> list[str]:
        """List all available custom backend names."""
        custom = load_backends_config(config_path)
        return sorted(custom)

    @property
    def model(self) -> str:
        """The resolved litellm model identifier."""
        return self._model

    @property
    def usage(self) -> dict[str, int]:
        """Cumulative token usage statistics."""
        return {
            "prompt_tokens": self._usage.prompt_tokens,
            "completion_tokens": self._usage.completion_tokens,
            "total_tokens": self._usage.total_tokens,
            "request_count": self._usage.request_count,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_api_key(self) -> str | None:
        """Return an API key, checking explicit key -> env var -> None.

        Raises ``EnvironmentError`` for cloud providers when no key is found.
        """
        if self._api_key:
            return self._api_key

        provider = self._model.split("/", 1)[0]

        # Local providers (ollama etc.) don't need a key.
        if provider not in self._ENV_KEY_MAP:
            return None

        env_var = self._ENV_KEY_MAP[provider]
        key = os.environ.get(env_var)
        if not key:
            raise EnvironmentError(
                f"No API key for provider '{provider}'. "
                f"Set the {env_var} environment variable or pass api_key= explicitly."
            )
        return key

    async def _call_with_retry(
        self,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> litellm.ModelResponse:
        """Execute litellm.acompletion with exponential-backoff retry."""
        api_key = self._resolve_api_key()

        kwargs: dict = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if api_key:
            kwargs["api_key"] = api_key
        if self._api_base:
            kwargs["api_base"] = self._api_base

        # Forward extra params from custom backend (e.g. custom headers).
        if self._custom_backend and self._custom_backend.extra:
            kwargs.update(self._custom_backend.extra)

        last_exc: Exception | None = None
        for attempt in range(1, self._MAX_RETRIES + 1):
            try:
                response = await litellm.acompletion(**kwargs)
                self._record_usage(response)
                return response
            except (
                litellm.RateLimitError,
                litellm.ServiceUnavailableError,
                litellm.Timeout,
                litellm.InternalServerError,
                litellm.APIConnectionError,
            ) as exc:
                last_exc = exc
                if attempt < self._MAX_RETRIES:
                    delay = self._RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "LLM request failed (attempt %d/%d): %s. Retrying in %.1fs...",
                        attempt,
                        self._MAX_RETRIES,
                        exc,
                        delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "LLM request failed after %d attempts: %s",
                        self._MAX_RETRIES,
                        exc,
                    )
            except litellm.AuthenticationError as exc:
                # No point retrying auth errors.
                raise EnvironmentError(
                    f"Authentication failed for model '{self._model}'. "
                    "Check your API key."
                ) from exc

        # All retries exhausted.
        if last_exc is None:
            raise RuntimeError(f"LLM request failed after {self._MAX_RETRIES} retries")
        raise RuntimeError(
            f"LLM request failed after {self._MAX_RETRIES} retries: "
            f"{type(last_exc).__name__}: {last_exc}"
        ) from last_exc

    def _record_usage(self, response: litellm.ModelResponse) -> None:
        """Accumulate token usage from a successful response."""
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        self._usage.prompt_tokens += getattr(usage, "prompt_tokens", 0) or 0
        self._usage.completion_tokens += getattr(usage, "completion_tokens", 0) or 0
        self._usage.total_tokens += getattr(usage, "total_tokens", 0) or 0
        self._usage.request_count += 1
