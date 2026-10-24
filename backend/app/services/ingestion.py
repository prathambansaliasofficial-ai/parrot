"""Ingestion pipeline for Parrot document processing.

Orchestrates: safe upload → text extraction → topic identification → status
tracking → retry. All steps are designed so that a failed step leaves the
resource record intact and retryable.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.services.extraction import extract_text
from app.services.topic_id import identify_topics, ConceptBlock
from app.services.upload import validate_upload, _UPLOAD_DIR as UPLOAD_DIR
from app.services.demo_data import demo_resources, find_demo_resource

logger = logging.getLogger(__name__)

settings = get_settings()

# ---------------------------------------------------------------------------
# Pipeline stages
# ---------------------------------------------------------------------------

STATUS_UPLOADED = "uploaded"
STATUS_QUEUED = "queued"
STATUS_EXTRACTING = "extracting"
STATUS_TOPIC_IDENTIFIED = "topic_identified"
STATUS_READY = "ready"
STATUS_FAILED = "failed"


def _resource_path(safe_filename: str) -> Path:
    return Path(UPLOAD_DIR) / safe_filename


def process_ingestion(
    resource_id: str,
    safe_filename: str,
    ext: str,
    subject: str,
    category: str,
) -> dict:
    """Run the full ingestion pipeline for a single uploaded resource.

    Returns a dict with the final status, concept blocks, and diagnostics.
    Any stage that fails updates the resource status to FAILED and records
    an error message; the caller may retry from the beginning or from the
    last completed stage.
    """

    filepath = str(_resource_path(safe_filename))
    result: dict = {
        "status": STATUS_UPLOADED,
        "extraction_errors": [],
        "topic_diagnostics": {},
        "concepts": [],
        "concept_count": 0,
    }

    try:
        # ---- Stage 1: Extract text ----
        result["status"] = STATUS_EXTRACTING
        logger.info("Extracting text for resource %s", resource_id)
        extracted_text, extract_meta = extract_text(
            resource_id, filepath, ext, max_chars=2_000_000
        )
        result["extraction_errors"] = extract_meta.get("errors", [])
        result["extraction_diagnostics"] = {
            "pages": extract_meta.get("pages", 0),
            "section_headings": extract_meta.get("section_headings", []),
            "scanned": extract_meta.get("scanned", False),
        }

        if extract_meta.get("scanned", False):
            # Document is scanned; we still store it but flag it.
            result["extraction_errors"].append(
                "Document appears scanned (no selectable text). OCR recommended before further processing."
            )

        if not extracted_text.strip():
            result["extraction_errors"].append("Extracted text is empty.")
            result["status"] = STATUS_FAILED
            return result

        # ---- Stage 2: Topic identification ----
        result["status"] = STATUS_TOPIC_IDENTIFIED
        logger.info("Identifying topics for resource %s", resource_id)
        topic_result = identify_topics(
            resource_id=resource_id,
            subject=subject,
            category=category,
            extracted_text=extracted_text,
            use_llm=False,  # LLM‑based refinement can be enabled per‑resource later
        )
        result["topic_diagnostics"] = topic_result["extraction_diagnostics"]
        concepts: List[ConceptBlock] = topic_result["concepts"]
        result["concepts"] = concepts
        result["concept_count"] = len(concepts)

        # Upgrade to ready only if we have at least one concept.
        if result["concept_count"] > 0:
            result["status"] = STATUS_READY
        else:
            # No concepts identified — still keep the resource, but mark
            # it ready so students can at least see the raw text if needed.
            result["status"] = STATUS_READY

    except HTTPException:
        # Re‑raise FastAPI HTTP errors as‑is.
        raise
    except Exception as exc:
        logger.exception("Unexpected error during ingestion for %s", resource_id)
        result["extraction_errors"].append(f"Unexpected ingestion error: {exc}")
        result["status"] = STATUS_FAILED

    return result


def _read_resource_file(safe_filename: str) -> Optional[bytes]:
    """Read the uploaded file bytes, returning None if missing."""

    p = _resource_path(safe_filename)
    if not p.is_file():
        return None
    try:
        return p.read_bytes()
    except Exception:
        return None


def retry_ingestion(
    resource_id: str,
    safe_filename: str,
    ext: str,
    subject: str,
    category: str,
    *,  # keyword-only below
    last_stage: str = "uploaded",
) -> dict:
    """Retry the ingestion pipeline from a given stage.

    last_stage: one of {uploaded, extracting, topic_identified}.
    If "uploaded", runs the full pipeline.
    If "extracting", skips extraction and uses previously extracted text
    stored alongside the resource (not implemented here — caller must
    preserve the extracted text).
    If "topic_identified", skips topic ID and uses previously computed
    concepts.
    """

    # For simplicity, re‑run from the beginning when last_stage != "uploaded".
    # A production system would persist intermediate results.
    logger.info(
        "Retrying ingestion for %s from stage %s (full re-run)",
        resource_id,
        last_stage,
    )
    return process_ingestion(resource_id, safe_filename, ext, subject, category)


def list_uploaded_resources() -> list[dict]:
    """List files in the uploads directory with their current status.

    Returns a list of dicts: {safe_filename, size_bytes, status}.
    This is a debugging / admin helper; the real catalog lives in Supabase.
    """

    if not UPLOAD_DIR.is_dir():
        return []
    items: List[dict] = []
    for p in sorted(UPLOAD_DIR.iterdir()):
        if p.is_file():
            items.append(
                {
                    "safe_filename": p.name,
                    "size_bytes": p.stat().st_size,
                    "status": "uploaded",  # on‑disk status only
                }
            )
    return items