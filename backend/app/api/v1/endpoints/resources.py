from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import get_settings
from app.core.supabase import get_supabase_client
from app.schemas.resource import ResourceRead

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("", response_model=list[ResourceRead])
def list_resources(
    course_id: str | None = None,
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[ResourceRead]:
    query = (
        get_supabase_client()
        .table("resources")
        .select(
            "id,course_id,title,category,description,storage_path,source_url,"
            "original_file_name,content_type,file_size_bytes,is_demo"
        )
        .eq("is_published", True)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if course_id:
        query = query.eq("course_id", course_id)
    if category:
        query = query.eq("category", category)

    result = query.execute()
    return [ResourceRead.model_validate(row) for row in result.data]


@router.get("/{resource_id}/download", tags=["resources"])
def get_resource_download(resource_id: UUID) -> dict[str, str]:
    """Create a short-lived link for a published file in the private bucket."""
    client = get_supabase_client()
    result = (
        client.table("resources")
        .select("storage_path")
        .eq("id", str(resource_id))
        .eq("is_published", True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")

    storage_path = result.data[0].get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This resource is an external link, not a stored file.",
        )

    settings = get_settings()
    signed = client.storage.from_(settings.supabase_storage_bucket).create_signed_url(
        storage_path, 300
    )
    signed_url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
    if not signed_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase did not return a signed download link.",
        )
    return {"url": signed_url}
