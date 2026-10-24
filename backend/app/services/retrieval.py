from uuid import UUID

from app.core.config import get_settings
from app.core.supabase import get_supabase_client


def search_passages(
    query: str,
    *,
    resource_id: UUID | None = None,
    course_id: UUID | None = None,
    category: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """Provider-independent keyword retrieval over published, processed resources."""
    settings = get_settings()
    result = get_supabase_client().rpc(
        "search_resource_chunks",
        {
            "search_query": query,
            "filter_resource_id": str(resource_id) if resource_id else None,
            "filter_course_id": str(course_id) if course_id else None,
            "filter_category": category,
            "result_limit": min(limit, settings.max_retrieval_results),
        },
    ).execute()
    return result.data or []
