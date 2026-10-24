import hmac
import hashlib
import ipaddress
import io
import re
import zipfile
from pathlib import PurePosixPath
from pathlib import PurePath
from urllib.parse import urlparse
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, HttpUrl
from typing import Literal

from app.core.config import get_settings
from app.core.supabase import get_supabase_client
from app.services.document_ingestion import process_resource

router = APIRouter(prefix="/admin/resources", tags=["resource ingestion"])

ResourceCategory = Literal[
    "books",
    "assignments",
    "notes",
    "practicals",
    "papers",
    "playlists",
    "experiments",
    "syllabus",
    "previous_questions",
    "tests",
]
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}
PROCESSABLE_EXTENSIONS = {".pdf", ".docx", ".txt"}


def validate_public_https_url(value: str) -> str:
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Resource source links must be valid public HTTPS URLs.") from exc
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="Resource source links must be public HTTPS URLs.")
    if host == "localhost" or host.endswith((".localhost", ".local")):
        raise HTTPException(status_code=422, detail="Private or local source hosts are not allowed.")
    try:
        address = ipaddress.ip_address(host)
        if not address.is_global:
            raise HTTPException(status_code=422, detail="Private or local source hosts are not allowed.")
    except ValueError:
        pass
    return value


def require_ingestion_key(
    x_ingestion_key: str | None = Header(default=None, alias="X-Ingestion-Key"),
) -> None:
    expected = get_settings().ingestion_api_key
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Set INGESTION_API_KEY on the API server to enable resource ingestion.",
        )
    if not x_ingestion_key or not hmac.compare_digest(x_ingestion_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingestion key.")


def safe_filename(name: str) -> str:
    basename = PurePosixPath(name.replace("\\", "/")).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", basename).strip(".-")
    return cleaned[:160] or "resource.pdf"


class ResourceLinkCreate(BaseModel):
    course_id: UUID
    title: str
    category: ResourceCategory
    source_url: HttpUrl
    description: str | None = None
    is_demo: bool = False


@router.post("/upload", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_ingestion_key)])
async def upload_resource_file(
    background_tasks: BackgroundTasks,
    course_id: UUID = Form(...),
    title: str = Form(..., min_length=1, max_length=240),
    category: ResourceCategory = Form(...),
    description: str | None = Form(default=None, max_length=2000),
    source_url: str | None = Form(default=None, max_length=2048),
    is_demo: bool = Form(default=False),
    file: UploadFile = File(...),
) -> dict:
    """Store a PDF/image in the private Supabase bucket and its metadata in Postgres."""
    settings = get_settings()
    if not title.strip():
        raise HTTPException(status_code=422, detail="Resource title cannot be blank.")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    original_name = safe_filename(file.filename or "resource.pdf")
    suffix = PurePath(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS or ALLOWED_EXTENSIONS[suffix] != content_type or content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File extension and content type must match a supported PDF, JPEG, PNG, DOCX, or TXT file.",
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_upload_size_mb} MB limit.",
        )
    if content_type == "application/pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The uploaded file does not have a valid PDF header.",
        )
    if content_type == "image/jpeg" and not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Invalid JPEG file.")
    if content_type == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Invalid PNG file.")
    if content_type in {"image/jpeg", "image/png"}:
        try:
            with Image.open(io.BytesIO(content)) as image:
                image.verify()
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="The uploaded image is corrupted or unreadable.") from exc
    if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                if "word/document.xml" not in archive.namelist():
                    raise ValueError("Missing document body")
        except (zipfile.BadZipFile, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Invalid DOCX file.") from exc
    if content_type == "text/plain":
        try:
            content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Text files must be UTF-8 encoded.") from exc

    if source_url:
        source_url = validate_public_https_url(source_url)

    client = get_supabase_client()
    digest = hashlib.sha256(content).hexdigest()
    duplicate = (
        client.table("resources")
        .select("id,course_id,title,category,description,storage_path,source_url,original_file_name,content_type,file_size_bytes,is_demo,processing_status")
        .eq("course_id", str(course_id))
        .eq("category", category)
        .eq("content_hash", digest)
        .limit(1)
        .execute()
        .data
    )
    if duplicate:
        await file.close()
        return {**duplicate[0], "duplicate": True}
    storage_path = f"{course_id}/{category}/{uuid4().hex}{suffix}"
    bucket = client.storage.from_(settings.supabase_storage_bucket)
    uploaded = False
    try:
        bucket.upload(
            storage_path,
            content,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        uploaded = True
        payload = {
            "course_id": str(course_id),
            "title": title.strip(),
            "category": category,
            "description": description,
            "storage_path": storage_path,
            "source_url": source_url,
            "original_file_name": original_name,
            "content_type": content_type,
            "file_size_bytes": len(content),
            "source_platform": urlparse(source_url).hostname if source_url else None,
            "is_demo": is_demo,
            "is_published": False,
            "content_hash": digest,
            "processing_status": "queued" if suffix in PROCESSABLE_EXTENSIONS else "not_supported",
        }
        row = (
            client.table("resources")
            .insert(payload)
            .select(
                "id,course_id,title,category,description,storage_path,source_url,"
                "original_file_name,content_type,file_size_bytes,is_demo,processing_status"
            )
            .single()
            .execute()
        )
        if suffix in PROCESSABLE_EXTENSIONS:
            background_tasks.add_task(process_resource, str(row.data["id"]))
        return {**row.data, "duplicate": False}
    except Exception as exc:
        if uploaded:
            try:
                bucket.remove([storage_path])
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase could not store the resource. Check API logs and Supabase configuration.",
        ) from exc
    finally:
        await file.close()


@router.post("/link", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_ingestion_key)])
def create_resource_link(payload: ResourceLinkCreate) -> dict:
    """Save an external resource URL and academic metadata; does not fetch the URL."""
    client = get_supabase_client()
    source = str(payload.source_url)
    validate_public_https_url(source)
    row = (
        client.table("resources")
        .insert(
            {
                "course_id": str(payload.course_id),
                "title": payload.title.strip(),
                "category": payload.category,
                "description": payload.description,
                "source_url": source,
                "source_platform": urlparse(source).hostname,
                "is_demo": payload.is_demo,
                "is_published": False,
                "processing_status": "not_supported",
            }
        )
        .select(
            "id,course_id,title,category,description,storage_path,source_url,"
            "original_file_name,content_type,file_size_bytes,is_demo"
        )
        .single()
        .execute()
    )
    return row.data



@router.post("/{resource_id}/publish", dependencies=[Depends(require_ingestion_key)])
def publish_resource(resource_id: UUID) -> dict:
    """Publish a reviewed resource so it appears in the student catalog."""
    result = (
        get_supabase_client()
        .table("resources")
        .update({"is_published": True})
        .eq("id", str(resource_id))
        .select("id,is_published")
        .single()
        .execute()
    )
    return result.data


@router.post("/{resource_id}/process", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_ingestion_key)])
def queue_resource_processing(resource_id: UUID, background_tasks: BackgroundTasks) -> dict:
    """Retry or start extraction for a stored resource."""
    client = get_supabase_client()
    row = client.table("resources").select("id,storage_path,original_file_name").eq("id", str(resource_id)).limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Resource not found.")
    if not row[0].get("storage_path"):
        raise HTTPException(status_code=422, detail="This resource has no stored document to process.")
    background_tasks.add_task(process_resource, str(resource_id))
    (
        client.table("resources")
        .update({"processing_status": "queued", "processing_error": None})
        .eq("id", str(resource_id))
        .neq("processing_status", "processing")
        .execute()
    )
    return {"resource_id": str(resource_id), "processing_status": "queued"}


@router.get("/{resource_id}/processing-status", dependencies=[Depends(require_ingestion_key)])
def get_processing_status(resource_id: UUID) -> dict:
    client = get_supabase_client()
    rows = client.table("resources").select("id,processing_status,processing_error,processed_at,content_hash").eq("id", str(resource_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Resource not found.")
    count = client.table("resource_chunks").select("id", count="exact").eq("resource_id", str(resource_id)).execute().count or 0
    return {**rows[0], "chunk_count": count}
