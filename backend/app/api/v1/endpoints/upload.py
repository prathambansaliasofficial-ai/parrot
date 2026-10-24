"""Upload and ingestion endpoints for Parrot resources.

Allows authorized contributors to upload PDF/TXT/DOCX files. The API
validates the file, stores it on disk with a safe name, runs the ingestion
pipeline (text extraction + topic identification), and returns the current
processing status. Resources that fail ingestion are still persisted so
they can be retried later.

All endpoints reuse the existing Supabase‑backed resource catalog where
possible; uploaded files live on disk outside the public tree and are
referenced by the safe filename.
"""

from __future__ import annotations

import json
import os
from fastapi import APIRouter, File, UploadFile, HTTPException, status
from starlette.requests import Request

from app.core.config import get_settings
from app.core.supabase import get_supabase_client
from app.services.upload import validate_upload, STATUS_UPLOADED
from app.services.ingestion import process_ingestion, retry_ingestion, list_uploaded_resources
from app.services.demo_data import find_demo_resource

router = APIRouter(prefix="/upload", tags=["upload"])

SUPPLIED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")


def _is_authorized(request: Request) -> bool:
    """Simple origin‑based authorization; tighten once real auth exists.

    In the current scaffold only requests from approved origins are allowed.
    """
    origin = request.headers.get("origin", "")
    return any(origin.startswith(allowed.strip()) for allowed in SUPPLIED_ORIGINS)


@router.post("", status_code=202)
async def upload_resource(request: Request, file: UploadFile = File(...)) -> dict:
    """Upload a resource document.

    Returns a resource metadata dict with status=uploaded and an ingestion
    request queued. The caller (or a background worker) should later call
    /upload/{resource_id}/ingest to process the file.
    """

    if not _is_authorized(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Upload not authorized from this origin.",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file content received.",
        )

    try:
        meta = validate_upload(filename=file.filename or "upload",
                               content_type=file.content_type,
                               file_bytes=raw_bytes,
        )
    except HTTPException as e:
        raise e

    safe_name = meta["safe_filename"]
    # Store file using the same safe name so _resource_path can find it later.
    dest_path = _UPLOAD_DIR / safe_name
    try:
        dest_path.write_bytes(raw_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not store uploaded file: {exc}",
        )

    resource_metadata = {
        "filename": meta["filename"],
        "safe_filename": safe_name,
        "extension": meta["extension"],
        "size_bytes": meta["size_bytes"],
        "status": STATUS_UPLOADED,
        "upload_path": str(_UPLOAD_DIR / safe_name),
        "subject": "",
        "category": "",
        "subject": meta.get("subject", ""),
        "category": meta.get("category", ""),
    }

    try:
        ingestion_result = process_ingestion(
            resource_id=safe_name,
            safe_filename=safe_name,
            ext=meta["extension"],
            subject=resource_metadata["subject"] or "general",
            category=resource_metadata["category"] or "resources",
        )
        resource_metadata.update({
            "ingestion_status": ingestion_result["status"],
            "extraction_errors": ingestion_result["extraction_errors"],
            "concept_count": ingestion_result["concept_count"],
        })
    except HTTPException:
        resource_metadata["ingestion_status"] = STATUS_FAILED
        resource_metadata["extraction_errors"] = [
            "Ingestion failed — see extraction_errors for details."
        ]

    return resource_metadata


@router.get("/{safe_filename}")
def get_ingestion_status(safe_filename: str) -> dict:
    """Return the current ingestion status for a given uploaded file."""

    marker_path = Path("uploads") / (safe_filename + ".json")
    if marker_path.is_file():
        try:
            marker = json.loads(marker_path.read_text())
            return {
                "safe_filename": safe_filename,
                "status": marker.get("status", "uploaded"),
                "concept_count": marker.get("concept_count", 0),
                "extraction_errors": marker.get("extraction_errors", []),
            }
        except Exception:
            pass

    return {
        "safe_filename": safe_filename,
        "status": "uploaded",
        "concept_count": 0,
        "extraction_errors": [],
    }


@router.post("/{safe_filename}/retry")
def retry_ingest(safe_filename: str) -> dict:
    """Retry the ingestion pipeline for a previously failed resource.

    Re‑runs the full pipeline from the upload stage. The original file on
    disk is re‑used; no new upload is required.
    """

    raw = None
    marker_path = Path("uploads") / (safe_filename + ".json")
    original_name = safe_filename
    ext = "pdf"

    if marker_path.is_file():
        try:
            marker = json.loads(marker_path.read_text())
            original_name = marker.get("filename", original_name)
            ext = marker.get("extension", ext)
        except Exception:
            pass

    if raw is None:
        raw_path = _UPLOAD_DIR / safe_filename
        if raw_path.is_file():
            raw = raw_path.read_bytes()

    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uploaded file not found.",
        )

    result = retry_ingestion(
        resource_id=safe_filename,
        safe_filename=safe_filename,
        ext=ext,
        subject="",
        category="",
    )

    try:
        marker_path.write_text(json.dumps({
            "status": result["status"],
            "concept_count": result["concept_count"],
            "extraction_errors": result["extraction_errors"],
            "filename": original_name,
            "extension": ext,
        }))
    except Exception:
        pass

    return result