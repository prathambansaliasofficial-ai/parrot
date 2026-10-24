import re
from fastapi import APIRouter, HTTPException, Query, status
from openai import APIError, AsyncOpenAI
from uuid import UUID
from starlette.concurrency import run_in_threadpool

from app.core.supabase import get_supabase_client
from app.schemas.resource import ResourceRead
from app.schemas.ingestion import AskRequest, AskResponse, Passage, SearchRequest, SearchResponse, TopicRead
from app.services.retrieval import search_passages
from app.core.config import get_settings

router = APIRouter(prefix="/resources", tags=["resources"])


def _passage(row: dict) -> Passage:
    return Passage(
        resource_id=row["resource_id"], chunk_id=row["chunk_id"], text=row["content"],
        page_number=row.get("page_number"), section_ref=row.get("section_ref"),
        topic=row.get("topic"), subtopic=row.get("subtopic"), title=row["title"],
        category=row["category"], course_id=row["course_id"], score=row.get("score"),
    )


@router.post("/search", response_model=SearchResponse)
def search_resource_passages(payload: SearchRequest) -> SearchResponse:
    rows = search_passages(payload.query, resource_id=payload.resource_id, course_id=payload.course_id, category=payload.category, limit=payload.limit)
    results = [_passage(row) for row in rows]
    return SearchResponse(query=payload.query, results=results, sufficient_evidence=bool(results and max((item.score or 0) for item in results) >= 0.02))


@router.get("/{resource_id}/topics", response_model=list[TopicRead])
def get_resource_topics(resource_id: UUID) -> list[TopicRead]:
    client = get_supabase_client()
    resource = client.table("resources").select("id").eq("id", str(resource_id)).eq("is_published", True).limit(1).execute().data
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found.")
    rows = client.table("resource_chunks").select("topic,subtopic,page_number").eq("resource_id", str(resource_id)).order("chunk_index").execute().data or []
    result: dict[str, dict] = {}
    for row in rows:
        topic = row.get("topic") or "Untitled section"
        entry = result.setdefault(topic, {"topic": topic, "subtopics": [], "pages": []})
        if row.get("subtopic") and row["subtopic"] != topic and row["subtopic"] not in entry["subtopics"]:
            entry["subtopics"].append(row["subtopic"])
        if row.get("page_number") and row["page_number"] not in entry["pages"]:
            entry["pages"].append(row["page_number"])
    return [TopicRead(**value) for value in result.values()]


@router.post("/ask", response_model=AskResponse)
async def ask_about_resources(payload: AskRequest) -> AskResponse:
    rows = await run_in_threadpool(
        search_passages, payload.query, resource_id=payload.resource_id,
        course_id=payload.course_id, category=payload.category, limit=payload.limit,
    )
    sources = [_passage(row) for row in rows]
    sufficient = bool(sources and max((item.score or 0) for item in sources) >= 0.02)
    if not sufficient:
        return AskResponse(answer=None, generation_available=bool(get_settings().asi_one_api_key), sufficient_evidence=False, sources=sources, message="I could not find relevant passages in the selected published resources.")
    settings = get_settings()
    if not settings.asi_one_api_key:
        return AskResponse(answer=None, generation_available=False, sufficient_evidence=True, sources=sources, message="Relevant source passages were found. AI answer generation is unavailable until ASI_ONE_API_KEY is configured.")
    client = AsyncOpenAI(api_key=settings.asi_one_api_key, base_url=settings.asi_one_base_url)
    context = "\n\n".join(
        f"[Source {index + 1}: {source.title}, {source.category}" + (f", page {source.page_number}" if source.page_number else "") + f"]\n{source.text}"
        for index, source in enumerate(sources)
    )
    try:
        response = await client.chat.completions.create(
            model=settings.asi_one_model,
            temperature=0.2,
            max_tokens=1000,
            messages=[
                {"role": "system", "content": "Answer the student's question using only the supplied study passages. If they do not support an answer, say what is missing. Cite claims with [Source N] exactly; do not invent facts or citations."},
                {"role": "user", "content": f"Question: {payload.query}\n\nStudy passages:\n{context}"},
            ],
        )
    except APIError as exc:
        raise HTTPException(status_code=502, detail="The configured answer provider is unavailable. Retrieved sources are still available from /search.") from exc
    answer = response.choices[0].message.content if response.choices else None
    cited_indexes = [int(value) for value in re.findall(r"\[Source\s+(\d+)\]", answer or "", flags=re.IGNORECASE)]
    if not cited_indexes or any(index < 1 or index > len(sources) for index in cited_indexes):
        return AskResponse(answer=None, generation_available=True, sufficient_evidence=True, sources=sources, message="The generated reply did not cite only the retrieved sources, so it was withheld.")
    return AskResponse(answer=answer, generation_available=True, sufficient_evidence=True, sources=sources)


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
            "original_file_name,content_type,file_size_bytes,is_demo,processing_status"
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
