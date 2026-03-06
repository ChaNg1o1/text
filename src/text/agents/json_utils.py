"""Best-effort JSON extraction and recovery helpers for LLM responses."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class JsonParseResult:
    value: Any
    recovered: bool = False
    truncated: bool = False


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    fence_start = text.find("```")
    if fence_start == -1:
        return text

    fenced = text[fence_start + 3 :]
    newline_idx = fenced.find("\n")
    if newline_idx == -1:
        return text

    body = fenced[newline_idx + 1 :]
    fence_end = body.rfind("```")
    if fence_end != -1:
        body = body[:fence_end]
    return body.strip() or text


def _extract_json_segment(text: str, open_char: str) -> str | None:
    close_char = "]" if open_char == "[" else "}"
    start = text.find(open_char)
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == open_char:
            depth += 1
        elif ch == close_char:
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]

    return text[start:].strip()


def _candidate_texts(raw: str, preferred_opener: str) -> list[str]:
    stripped = raw.strip()
    candidates = [stripped]

    fenced = _strip_markdown_fence(raw)
    if fenced and fenced not in candidates:
        candidates.append(fenced)

    for base in list(candidates):
        extracted = _extract_json_segment(base, preferred_opener)
        if extracted and extracted not in candidates:
            candidates.append(extracted)

    return [candidate for candidate in candidates if candidate]


def _normalize_array_payload(data: Any) -> list[dict[str, Any]] | None:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    if isinstance(data, dict):
        nested = data.get("findings")
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]

    return None


def _repair_truncated_json_array(text: str) -> list[dict[str, Any]] | None:
    stripped = text.rstrip()
    start = stripped.find("[")
    if start == -1:
        return None

    candidate_source = stripped[start:]
    last_brace = candidate_source.rfind("}")
    if last_brace < 0:
        return None

    candidate = candidate_source[: last_brace + 1].rstrip().rstrip(",") + "]"
    try:
        return _normalize_array_payload(json.loads(candidate))
    except json.JSONDecodeError:
        return None


def _repair_truncated_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.rstrip()
    start = stripped.find("{")
    if start == -1:
        return None

    candidate_source = stripped[start:]
    last_quote = candidate_source.rfind('"')
    last_brace = candidate_source.rfind("}")
    last_bracket = candidate_source.rfind("]")
    cut = max(last_quote, last_brace, last_bracket)
    if cut < 1:
        return None

    candidate = candidate_source[: cut + 1].rstrip().rstrip(",")
    open_braces = candidate.count("{") - candidate.count("}")
    open_brackets = candidate.count("[") - candidate.count("]")
    candidate += "]" * max(open_brackets, 0) + "}" * max(open_braces, 0)

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def parse_json_array_loose(raw: str) -> JsonParseResult | None:
    candidates = _candidate_texts(raw, "[")

    for idx, candidate in enumerate(candidates):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        items = _normalize_array_payload(data)
        if items is not None:
            return JsonParseResult(value=items, recovered=idx > 0, truncated=False)

    for candidate in candidates:
        items = _repair_truncated_json_array(candidate)
        if items is not None:
            return JsonParseResult(value=items, recovered=True, truncated=True)

    return None


def parse_json_object_loose(raw: str) -> JsonParseResult | None:
    candidates = _candidate_texts(raw, "{")

    for idx, candidate in enumerate(candidates):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(data, dict):
            return JsonParseResult(value=data, recovered=idx > 0, truncated=False)

    for candidate in candidates:
        data = _repair_truncated_json_object(candidate)
        if data is not None:
            return JsonParseResult(value=data, recovered=True, truncated=True)

    return None
