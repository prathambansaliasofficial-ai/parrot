from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import get_settings
from app.core.supabase import get_supabase_client
from app.schemas.resource import ResourceDetail, ResourcePassage, ResourceRead

router = APIRouter(prefix="/resources", tags=["resources"])

RESOURCE_COLUMNS = (
    "id,course_id,title,category,description,storage_path,source_url,"
    "original_file_name,content_type,file_size_bytes,is_demo"
)


def _supabase_ready() -> bool:
    settings = get_settings()
    return bool(settings.supabase_url and settings.supabase_server_key)


@router.get("", response_model=list[ResourceRead])
def list_resources(
    course_id: str | None = None,
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[ResourceRead]:
    # No configured catalog means no data. This endpoint deliberately returns an
    # empty list instead of a fabricated sample catalog: the frontend renders an
    # explicit "resources have not been indexed yet" state.
    if not _supabase_ready():
        return []

    query = (
        get_supabase_client()
        .table("resources")
        .select(RESOURCE_COLUMNS)
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


@router.get("/{resource_id}", response_model=ResourceDetail)
def get_resource(resource_id: str) -> ResourceDetail:
    if not _supabase_ready():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")

    result = (
        get_supabase_client()
        .table("resources")
        .select(RESOURCE_COLUMNS)
        .eq("id", resource_id)
        .eq("is_published", True)
        .limit(1)
        .execute()
    )
    rows = result.data
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
    row = rows[0]

    chunks = (
        get_supabase_client()
        .table("resource_chunks")
        .select("id,page_number,content")
        .eq("resource_id", resource_id)
        .order("chunk_index")
        .limit(50)
        .execute()
    )
    return ResourceDetail(
        **row,
        passages=[
            ResourcePassage(
                id=chunk["id"],
                page=chunk["page_number"] or 1,
                content=chunk["content"],
            )
            for chunk in chunks.data
        ],
        source="supabase",
    )


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
