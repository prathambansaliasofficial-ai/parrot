from fastapi import APIRouter, Query

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
        .select("id,course_id,title,category,description,storage_path")
        .eq("is_published", True)
        .limit(limit)
    )
    if course_id:
        query = query.eq("course_id", course_id)
    if category:
        query = query.eq("category", category)

    result = query.execute()
    return [ResourceRead.model_validate(row) for row in result.data]
