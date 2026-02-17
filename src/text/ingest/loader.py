"""Data loaders for multiple input formats."""

from __future__ import annotations

import csv
import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path

from text.ingest.schema import AnalysisRequest, TextEntry

logger = logging.getLogger(__name__)

_SUPPORTED_EXTENSIONS = {".csv", ".json", ".jsonl", ".txt"}


def _content_id(content: str) -> str:
    """Generate a deterministic ID from content using BLAKE2b (16 hex chars)."""
    return hashlib.blake2b(content.encode(), digest_size=8).hexdigest()


def _parse_timestamp(raw: str | None) -> datetime | None:
    """Best-effort timestamp parsing. Returns None on failure."""
    if not raw or not raw.strip():
        return None
    raw = raw.strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    logger.warning("Unable to parse timestamp: %r", raw)
    return None


def load_from_file(path: Path) -> AnalysisRequest:
    """Auto-detect format by extension and load into an AnalysisRequest."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    ext = path.suffix.lower()
    if ext not in _SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file extension '{ext}'. Supported: {sorted(_SUPPORTED_EXTENSIONS)}"
        )

    if ext == ".json":
        return load_json(path)
    elif ext == ".csv":
        return AnalysisRequest(texts=load_csv(path))
    elif ext == ".txt":
        return AnalysisRequest(texts=load_txt(path))
    elif ext == ".jsonl":
        return AnalysisRequest(texts=load_jsonl(path))

    # Unreachable, but satisfies type checker.
    raise ValueError(f"Unhandled extension: {ext}")


def load_csv(path: Path) -> list[TextEntry]:
    """Load entries from CSV.

    Expected columns: id, author, content, timestamp (opt), source (opt).
    If 'id' column is missing or a row has no id, one is generated from content.
    If 'author' column is missing, defaults to "unknown".
    """
    path = Path(path)
    entries: list[TextEntry] = []

    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError(f"CSV file is empty or has no header: {path}")

        fields = {f.strip().lower() for f in reader.fieldnames}
        if "content" not in fields:
            raise ValueError(
                f"CSV must contain a 'content' column. Found columns: {reader.fieldnames}"
            )

        for row_num, row in enumerate(reader, start=2):
            # Normalize keys to lowercase, strip whitespace
            row = {k.strip().lower(): v.strip() if v else "" for k, v in row.items()}

            content = row.get("content", "")
            if not content:
                logger.warning("Skipping empty row at line %d", row_num)
                continue

            entry_id = row.get("id", "") or _content_id(content)
            author = row.get("author", "") or "unknown"
            timestamp = _parse_timestamp(row.get("timestamp"))
            source = row.get("source") or None

            entries.append(
                TextEntry(
                    id=entry_id,
                    author=author,
                    content=content,
                    timestamp=timestamp,
                    source=source,
                )
            )

    logger.info("Loaded %d entries from CSV: %s", len(entries), path)
    return entries


def load_json(path: Path) -> AnalysisRequest:
    """Load an AnalysisRequest from JSON.

    Supports two formats:
    1. AnalysisRequest schema (object with "texts" key)
    2. Plain array of strings (each string becomes a TextEntry with author
       inferred from the filename)
    """
    path = Path(path)
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)

    # --- Format 2: plain array of strings ---
    if isinstance(data, list):
        # Infer author from parent directory name (e.g. .../GeoffreyHuntley/text.json)
        author = path.parent.name if path.parent.name else "unknown"
        entries: list[TextEntry] = []
        for item in data:
            if isinstance(item, str) and item.strip():
                entries.append(
                    TextEntry(
                        id=_content_id(item),
                        author=author,
                        content=item,
                    )
                )
            elif isinstance(item, dict):
                content = item.get("content", "")
                if not content:
                    continue
                if not item.get("id"):
                    item["id"] = _content_id(content)
                if not item.get("author"):
                    item["author"] = author
                entries.append(TextEntry.model_validate(item))
        logger.info("Loaded %d entries from JSON array: %s", len(entries), path)
        return AnalysisRequest(texts=entries)

    # --- Format 1: AnalysisRequest object ---
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object or array at top level, got {type(data).__name__}")

    # Auto-generate missing IDs in texts array
    if "texts" in data and isinstance(data["texts"], list):
        for item in data["texts"]:
            if isinstance(item, dict) and not item.get("id"):
                content = item.get("content", "")
                item["id"] = _content_id(content) if content else _content_id("")

    request = AnalysisRequest.model_validate(data)
    logger.info("Loaded AnalysisRequest with %d texts from JSON: %s", len(request.texts), path)
    return request


def load_txt(path: Path) -> list[TextEntry]:
    """Load plain text file. Paragraphs (separated by blank lines) become entries.

    If no blank-line separators are found, each non-empty line becomes an entry.
    """
    path = Path(path)
    raw = path.read_text(encoding="utf-8")

    # Try paragraph-based splitting first
    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]

    if len(paragraphs) <= 1:
        # Fall back to line-by-line if there's only one or zero paragraphs
        segments = [line.strip() for line in raw.splitlines() if line.strip()]
    else:
        segments = paragraphs

    entries: list[TextEntry] = []
    for segment in segments:
        entries.append(
            TextEntry(
                id=_content_id(segment),
                author="unknown",
                content=segment,
            )
        )

    logger.info("Loaded %d entries from TXT: %s", len(entries), path)
    return entries


def load_jsonl(path: Path) -> list[TextEntry]:
    """Load entries from JSON Lines format. One TextEntry JSON object per line.

    Missing 'id' fields are auto-generated. Missing 'author' defaults to "unknown".
    """
    path = Path(path)
    entries: list[TextEntry] = []

    with path.open(encoding="utf-8") as fh:
        for line_num, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"Invalid JSON at line {line_num} in {path}: {exc}"
                ) from exc

            if not isinstance(data, dict):
                raise ValueError(f"Expected JSON object at line {line_num}, got {type(data).__name__}")

            content = data.get("content", "")
            if not data.get("id"):
                data["id"] = _content_id(content) if content else _content_id("")
            if not data.get("author"):
                data["author"] = "unknown"

            entries.append(TextEntry.model_validate(data))

    logger.info("Loaded %d entries from JSONL: %s", len(entries), path)
    return entries
