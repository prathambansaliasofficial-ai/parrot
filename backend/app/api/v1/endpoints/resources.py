from fastapi import APIRouter, HTTPException, Query, status, File, UploadFile, Form

from app.core.config import get_settings
from app.core.supabase import get_supabase_client
from app.schemas.resource import ResourceDetail, ResourceMetadata, ResourcePassage, ResourceRead
from app.services.demo_data import demo_resources, find_demo_resource

router = APIRouter(prefix="/resources", tags=["resources"])


def _supabase_ready() -> bool:
    settings = get_settings()
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _demo_rows() -> list[ResourceRead]:
    return [
        ResourceRead(
            id=r["id"],
            course_id=r["course_id"],
            title=r["title"],
            category=r["category"],
            description=r["description"],
            storage_path=r["storage_path"],
        )
        for r in demo_resources()
    ]


@router.get("", response_model=list[ResourceRead])
def list_resources(
    course_id: str | None = None,
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[ResourceRead]:
    if not _supabase_ready():
        # Demo mode: deterministic sample catalog, clearly identified demo data.
        rows = [row for row in _demo_rows() if row.id.startswith("demo-")]
    else:
        query = (
            get_supabase_client()
            .table("resources")
            .select("id,course_id,title,category,description,storage_path")
            .eq("is_published", True)
            .limit(limit)
        )
        if course_id:
            query = query.eq("course_id", course_id)
        if category:
            query = query.eq("category", category)
        result = query.execute()
        rows = [ResourceRead.model_validate(row) for row in result.data]

    if course_id:
        rows = [row for row in rows if row.course_id == course_id]
    if category:
        rows = [row for row in rows if row.category == category]
    return rows[:limit]


@router.get("/{resource_id}", response_model=ResourceDetail)
def get_resource(resource_id: str) -> ResourceDetail:
    demo = find_demo_resource(resource_id)
    if demo:
        return ResourceDetail(
            id=demo["id"],
            course_id=demo["course_id"],
            title=demo["title"],
            category=demo["category"],
            description=demo["description"],
            storage_path=demo["storage_path"],
            metadata=ResourceMetadata(
                subject=demo["subject"],
                branch=demo["branch"],
                semester=demo["semester"],
                college=demo["college"],
                course=demo["course"],
                topics=demo["topics"],
            ),
            passages=[ResourcePassage(**p) for p in demo["passages"]],
            source="demo",
        )
    if not _supabase_ready():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
    result = (
        get_supabase_client()
        .table("resources")
        .select("id,course_id,title,category,description,storage_path")
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
