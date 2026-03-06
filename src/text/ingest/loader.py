"""Data loaders for multiple input formats."""

from __future__ import annotations

import csv
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from text.ingest.schema import (
    AnalysisRequest,
    ArtifactKind,
    ArtifactRecord,
    DerivationKind,
    TextEntry,
    sha256_text,
)

logger = logging.getLogger(__name__)

_SUPPORTED_EXTENSIONS = {".csv", ".json", ".jsonl", ".txt"}
MAX_ENTRY_CHARS = 8000
MAX_FILE_SIZE = 100 * 1024 * 1024
_SENTENCE_END_RE = re.compile(r"(?<=[.!?。！？])\s+")


def load_from_path(path: Path) -> AnalysisRequest:
    """Load from a file or directory."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input path not found: {path}")

    if path.is_file():
        return load_from_file(path)

    requests: list[AnalysisRequest] = []
    for child in sorted(path.rglob("*")):
        if not child.is_file() or child.suffix.lower() not in _SUPPORTED_EXTENSIONS:
            continue
        try:
            requests.append(load_from_file(child))
        except Exception as exc:
            logger.warning("Skipping %s: %s", child, exc)

    if not requests:
        raise ValueError(f"No supported files found in directory: {path}")

    texts = [text for req in requests for text in req.texts]
    artifacts = [artifact for req in requests for artifact in req.artifacts]
    logger.info("Loaded %d entries from directory: %s", len(texts), path)
    return AnalysisRequest(texts=texts, artifacts=artifacts)


def load_from_file(path: Path) -> AnalysisRequest:
    """Auto-detect format by extension and load into an AnalysisRequest."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    file_size = path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        raise ValueError(
            f"File too large ({file_size / 1024 / 1024:.1f} MB). "
            f"Maximum supported size is {MAX_FILE_SIZE / 1024 / 1024:.0f} MB: {path}"
        )

    ext = path.suffix.lower()
    if ext not in _SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file extension '{ext}'. Supported: {sorted(_SUPPORTED_EXTENSIONS)}"
        )

    if ext == ".json":
        return load_json(path)
    if ext == ".csv":
        return load_csv(path)
    if ext == ".txt":
        return load_txt(path)
    if ext == ".jsonl":
        return load_jsonl(path)
    raise ValueError(f"Unhandled extension: {ext}")


def _content_id(content: str) -> str:
    return hashlib.blake2b(content.encode("utf-8"), digest_size=8).hexdigest()


def _artifact_id(seed: str) -> str:
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def _parse_timestamp(raw: str | None) -> datetime | None:
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
            dt = datetime.strptime(raw, fmt)
        except ValueError:
            continue
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    logger.warning("Unable to parse timestamp: %r", raw)
    return None


def _make_manual_artifact(
    *,
    source_name: str,
    content: str,
    operator: str | None = None,
    notes: str | None = None,
) -> ArtifactRecord:
    sha256 = sha256_text(content)
    return ArtifactRecord(
        artifact_id=_artifact_id(f"{source_name}:{sha256}"),
        kind=ArtifactKind.MANUAL_ENTRY,
        sha256=sha256,
        byte_count=len(content.encode("utf-8")),
        source_name=source_name,
        acquisition_timestamp=datetime.now(tz=timezone.utc),
        operator=operator,
        transform_chain=["manual_import"],
        notes=notes,
    )


def _entry_from_content(
    *,
    content: str,
    author: str,
    source: str | None,
    timestamp: datetime | None,
    artifact: ArtifactRecord,
    entry_id: str | None = None,
) -> TextEntry:
    return TextEntry(
        id=entry_id or _content_id(content),
        author=author,
        content=content,
        timestamp=timestamp,
        source=source,
        artifact_id=artifact.artifact_id,
        content_sha256=artifact.sha256,
        derivation_kind=DerivationKind.MANUAL_ENTRY
        if artifact.kind == ArtifactKind.MANUAL_ENTRY
        else DerivationKind.ORIGINAL,
    )


def load_csv(path: Path) -> AnalysisRequest:
    entries: list[TextEntry] = []
    artifacts: list[ArtifactRecord] = []

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
            row = {k.strip().lower(): v.strip() if v else "" for k, v in row.items()}
            content = row.get("content", "")
            if not content:
                logger.warning("Skipping empty row at line %d", row_num)
                continue

            artifact = _make_manual_artifact(
                source_name=f"{path.name}:line:{row_num}",
                content=content,
            )
            artifacts.append(artifact)
            entries.append(
                _entry_from_content(
                    content=content,
                    author=row.get("author", "") or "unknown",
                    source=row.get("source") or path.name,
                    timestamp=_parse_timestamp(row.get("timestamp")),
                    artifact=artifact,
                    entry_id=row.get("id", "") or None,
                )
            )

    logger.info("Loaded %d entries from CSV: %s", len(entries), path)
    return AnalysisRequest(texts=entries, artifacts=artifacts)


def load_json(path: Path) -> AnalysisRequest:
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)

    if isinstance(data, list):
        author = path.parent.name if path.parent.name else "unknown"
        texts: list[TextEntry] = []
        artifacts: list[ArtifactRecord] = []
        for index, item in enumerate(data, start=1):
            if isinstance(item, str):
                content = item.strip()
                if not content:
                    continue
                artifact = _make_manual_artifact(
                    source_name=f"{path.name}:item:{index}",
                    content=content,
                )
                artifacts.append(artifact)
                texts.append(
                    _entry_from_content(
                        content=content,
                        author=author,
                        source=path.name,
                        timestamp=None,
                        artifact=artifact,
                    )
                )
            elif isinstance(item, dict):
                content = str(item.get("content", "")).strip()
                if not content:
                    continue
                artifact = _make_manual_artifact(
                    source_name=f"{path.name}:item:{index}",
                    content=content,
                )
                artifacts.append(artifact)
                texts.append(
                    _entry_from_content(
                        content=content,
                        author=str(item.get("author") or author),
                        source=str(item.get("source") or path.name),
                        timestamp=_parse_timestamp(item.get("timestamp")),
                        artifact=artifact,
                        entry_id=str(item.get("id") or "") or None,
                    )
                )
        return AnalysisRequest(texts=texts, artifacts=artifacts)

    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object or array at top level, got {type(data).__name__}")

    if "texts" in data and isinstance(data["texts"], list):
        for item in data["texts"]:
            if isinstance(item, dict) and not item.get("id"):
                content = str(item.get("content", ""))
                item["id"] = _content_id(content) if content else _content_id("")

    request = AnalysisRequest.model_validate(data)
    request = _ensure_artifacts(request, source_name=path.name)
    logger.info("Loaded AnalysisRequest with %d texts from JSON: %s", len(request.texts), path)
    return request


def load_txt(path: Path) -> AnalysisRequest:
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        logger.warning("File %s is not valid UTF-8; falling back to lossy decoding", path)
        raw = path.read_bytes().decode("utf-8", errors="replace")

    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
    segments = paragraphs if len(paragraphs) > 1 else [line.strip() for line in raw.splitlines() if line.strip()]

    final_segments: list[str] = []
    for seg in segments:
        if len(seg) <= MAX_ENTRY_CHARS:
            final_segments.append(seg)
        else:
            final_segments.extend(_chunk_text(seg, MAX_ENTRY_CHARS))

    texts: list[TextEntry] = []
    artifacts: list[ArtifactRecord] = []
    for index, segment in enumerate(final_segments, start=1):
        artifact = _make_manual_artifact(source_name=f"{path.name}:segment:{index}", content=segment)
        artifacts.append(artifact)
        texts.append(
            _entry_from_content(
                content=segment,
                author="unknown",
                source=path.name,
                timestamp=None,
                artifact=artifact,
            )
        )

    logger.info("Loaded %d entries from TXT: %s", len(texts), path)
    return AnalysisRequest(texts=texts, artifacts=artifacts)


def _chunk_text(text: str, max_chars: int) -> list[str]:
    sentences = _SENTENCE_END_RE.split(text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        if len(sent) > max_chars:
            if current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            chunks.append(sent)
            continue
        if current_len + len(sent) + 1 > max_chars and current:
            chunks.append(" ".join(current))
            current = []
            current_len = 0
        current.append(sent)
        current_len += len(sent) + 1

    if current:
        chunks.append(" ".join(current))
    return chunks


def load_jsonl(path: Path) -> AnalysisRequest:
    texts: list[TextEntry] = []
    artifacts: list[ArtifactRecord] = []

    with path.open(encoding="utf-8") as fh:
        for line_num, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON at line {line_num} in {path}: {exc}") from exc

            if not isinstance(data, dict):
                raise ValueError(
                    f"Expected JSON object at line {line_num}, got {type(data).__name__}"
                )

            content = str(data.get("content", "")).strip()
            artifact = _make_manual_artifact(
                source_name=f"{path.name}:line:{line_num}",
                content=content,
            )
            artifacts.append(artifact)
            texts.append(
                _entry_from_content(
                    content=content,
                    author=str(data.get("author") or "unknown"),
                    source=str(data.get("source") or path.name),
                    timestamp=_parse_timestamp(data.get("timestamp")),
                    artifact=artifact,
                    entry_id=str(data.get("id") or "") or None,
                )
            )

    logger.info("Loaded %d entries from JSONL: %s", len(texts), path)
    return AnalysisRequest(texts=texts, artifacts=artifacts)


def _ensure_artifacts(request: AnalysisRequest, *, source_name: str) -> AnalysisRequest:
    artifacts_by_id = {artifact.artifact_id: artifact for artifact in request.artifacts}
    normalized_texts: list[TextEntry] = []
    for index, text in enumerate(request.texts, start=1):
        if text.artifact_id and text.artifact_id in artifacts_by_id:
            normalized_texts.append(text)
            continue
        artifact = _make_manual_artifact(
            source_name=f"{source_name}:text:{index}",
            content=text.content,
            notes="Synthetic artifact generated during import.",
        )
        artifacts_by_id[artifact.artifact_id] = artifact
        normalized_texts.append(
            text.model_copy(
                update={
                    "artifact_id": artifact.artifact_id,
                    "content_sha256": artifact.sha256,
                    "derivation_kind": DerivationKind.MANUAL_ENTRY,
                }
            )
        )
    return request.model_copy(update={"texts": normalized_texts, "artifacts": list(artifacts_by_id.values())})
