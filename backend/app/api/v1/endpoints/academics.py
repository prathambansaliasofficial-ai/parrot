from fastapi import APIRouter

from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/academics", tags=["academics"])


@router.get("")
def get_academic_catalog() -> dict[str, list[dict]]:
    """Return college, branch, and course metadata for resource browsing."""
    client = get_supabase_client()
    colleges = client.table("colleges").select("id,name,slug").order("name").execute()
    branches = (
        client.table("branches")
        .select("id,college_id,name,code")
        .order("name")
        .execute()
    )
    courses = (
        client.table("courses")
        .select("id,branch_id,name,code,semester,academic_year")
        .order("semester")
        .order("name")
        .execute()
    )
    return {
        "colleges": colleges.data,
        "branches": branches.data,
        "courses": courses.data,
    }
