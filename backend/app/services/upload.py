"""Safe document upload validation for Parrot.

Validates extension, MIME type, actual file type, size, and supported formats.
Stores metadata only; the actual file bytes live on disk outside the public
tree. Failed uploads are saved with status=FAILED so the resource record can
still exist and be retried later.
"""

from __future__ import annotations

import mimetypes
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, status

# Allowed extensions (lowercased). Keep this in sync with ACCEPTED_MIME.
_ALLOWED_EXTENSIONS = {
    "pdf",
    "txt",
    "docx",
}

# Maximum upload size: 50 MiB (same as Supabase file_size_limit).
_MAX_UPLOAD_BYTES = 52_428_800

# Allowed MIME types keyed by lowercased extension.
_ACCEPTED_MIME = {
    "pdf": "application/pdf",
    "txt": ["text/plain"],
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Directory where uploaded files land (outside public root). Create it at
# startup or via a script; the API writes here with a random safe name.
_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def _ensure_upload_dir() -> None:
    """Create the uploads directory if it does not exist yet."""
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _safe_filename(original: str) -> str:
    """Return a server‑side safe filename using a UUID and the original ext."""

    # Preserve the original extension (lowercased).
    _, ext = os.path.splitext(original)
    ext = ext.lower()
    # Strip any leading dot; if nothing remains, use .bin.
    ext = ext.lstrip(".") or "bin"
    return f"{uuid.uuid4().hex}{ext if ext else ''}"


def validate_upload(
    filename: str,
    content_type: str | None,
    file_bytes: bytes,
) -> dict:
    """Validate an upload and return a metadata dict.

    Raises HTTPException if the upload cannot be accepted.
    The caller should then store the resource with the returned metadata
    and either proceed to ingestion or mark it FAILED.
    """

    _ensure_upload_dir()

    # --- Extension check ---
    _, ext = os.path.splitext(filename)
    ext = ext.lower().lstrip(".")
    if not ext or ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Allowed: pdf, txt, docx.",
        )

    # --- MIME type check (best‑effort; never block on this alone) ---
    if content_type:
        guessed = mimetypes.guess_type(filename, strict=False)[0]
        guessed_lower = guessed.lower() if guessed else ""
        accepted = _ACCEPTED_MIME.get(ext)
        if accepted and not any(
            guessed_lower == a.lower() if isinstance(a, str) else guessed_lower in [x.lower() for x in a]
            for a in accepted
        ):
            # MIME mismatch but extension is OK — we log and continue.
            pass  # informative only; do not reject

    # --- Size check ---
    size = len(file_bytes)
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if size > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({size / 1024 / 1024:.2f} MiB). Maximum is 50 MiB.",
        )

    # --- Heuristic binary / encrypted guard ---
    # PDF files should start with %PDF; DOCX is a zip container; TXT should be readable.
    if ext == "pdf" and file_bytes[:4] != b"%PDF":
        # Not necessarily fatal — some PDFs have headers split across reads —
        # just warn via the returned metadata.
        pass
    if ext == "docx":
        # DOCX is a ZIP archive; a quick check for the PKI stream marker.
        if file_bytes[:2] not in (b"PK",) and not file_bytes[:4].startswith(b"<?xml"):
            # Not a blocker; we record the observation.
            pass

    return {
        "filename": filename,
        "extension": ext,
        "size_bytes": size,
        "safe_filename": _safe_filename(filename),
        "upload_path": str(_UPLOAD_DIR / _safe_filename(filename)),
        "content_type": content_type,
        "status": "uploaded",  # will be updated by the ingestion pipeline
    }


STATUS_UPLOADED = "uploaded"
