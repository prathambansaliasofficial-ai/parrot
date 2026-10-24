import hmac
import re
from pathlib import PurePath
from urllib.parse import urlparse
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, HttpUrl
from typing import Literal

from app.core.config import get_settings
from app.core.supabase import get_supabase_client

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
}


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
    basename = PurePath(name).name
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
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a PDF, JPEG, or PNG file.",
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

    if source_url:
        parsed = urlparse(source_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Source links must use HTTPS.",
            )

    client = get_supabase_client()
    original_name = safe_filename(file.filename or "resource.pdf")
    suffix = PurePath(original_name).suffix.lower()
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
        }
        row = (
            client.table("resources")
            .insert(payload)
            .select(
                "id,course_id,title,category,description,storage_path,source_url,"
                "original_file_name,content_type,file_size_bytes,is_demo"
            )
            .single()
            .execute()
        )
        return row.data
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
