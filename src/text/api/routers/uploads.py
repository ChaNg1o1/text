"""File upload endpoint -- parse uploaded files into TextEntry lists."""

from __future__ import annotations

import tempfile
from pathlib import Path
from pathlib import PurePosixPath

from fastapi import APIRouter, File, HTTPException, UploadFile

from text.api.models import UploadResponse
from text.ingest.loader import load_from_file

router = APIRouter(prefix="/api/v1", tags=["upload"])

_SUPPORTED_SUFFIXES = {".csv", ".json", ".jsonl", ".txt"}


def _safe_relative_path(filename: str) -> Path:
    """Normalize client-provided filename/relative path to a safe local path."""
    raw = filename.replace("\\", "/")
    parts = [p for p in PurePosixPath(raw).parts if p not in {"", ".", ".."}]
    if not parts:
        return Path("upload.txt")
    return Path(*parts)


async def _materialize_upload(root: Path, upload: UploadFile) -> Path:
    rel_path = _safe_relative_path(upload.filename or "")
    target = root / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    content = await upload.read()
    target.write_bytes(content)
    return target


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
) -> UploadResponse:
    """Upload one file or multiple files (e.g. folder upload) and return parsed TextEntry objects."""
    uploads: list[UploadFile] = []
    if file is not None:
        uploads.append(file)
    if files:
        uploads.extend(files)

    if not uploads:
        raise HTTPException(status_code=400, detail="No file(s) provided")

    single_mode = len(uploads) == 1
    valid_uploads: list[UploadFile] = []
    for upload in uploads:
        if not upload.filename:
            if single_mode:
                raise HTTPException(status_code=400, detail="No filename provided")
            continue
        suffix = Path(upload.filename).suffix.lower()
        if suffix not in _SUPPORTED_SUFFIXES:
            if single_mode:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type '{suffix}'. Supported: csv, json, jsonl, txt",
                )
            continue
        valid_uploads.append(upload)

    if not valid_uploads:
        raise HTTPException(
            status_code=400,
            detail="No supported files found. Supported: csv, json, jsonl, txt",
        )

    all_texts = []
    all_artifacts = []
    all_activity_events = []
    all_interaction_edges = []
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        for upload in valid_uploads:
            try:
                tmp_path = await _materialize_upload(root, upload)
                request = load_from_file(tmp_path)
            except (ValueError, UnicodeDecodeError) as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"Failed to parse '{upload.filename}': {exc}",
                ) from exc
            all_texts.extend(request.texts)
            all_artifacts.extend(request.artifacts)
            all_activity_events.extend(request.activity_events)
            all_interaction_edges.extend(request.interaction_edges)

    if not all_texts:
        raise HTTPException(status_code=422, detail="No text entries parsed from uploaded files")

    authors = sorted({t.author for t in all_texts})
    return UploadResponse(
        texts=all_texts,
        artifacts=all_artifacts,
        activity_events=all_activity_events,
        interaction_edges=all_interaction_edges,
        text_count=len(all_texts),
        author_count=len(authors),
        authors=authors,
    )
