from pydantic import BaseModel, Field
from uuid import UUID


class ProcessStatus(BaseModel):
    resource_id: str
    processing_status: str
    processing_error: str | None = None
    processed_at: str | None = None
    content_hash: str | None = None
    chunk_count: int = 0


class Passage(BaseModel):
    resource_id: str
    chunk_id: str
    text: str
    page_number: int | None = None
    section_ref: str | None = None
    topic: str | None = None
    subtopic: str | None = None
    title: str
    category: str
    course_id: str
    score: float | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=1000)
    resource_id: UUID | None = None
    course_id: UUID | None = None
    category: str | None = None
    limit: int = Field(default=5, ge=1, le=8)


class SearchResponse(BaseModel):
    query: str
    results: list[Passage]
    sufficient_evidence: bool


class AskRequest(SearchRequest):
    pass


class AskResponse(BaseModel):
    answer: str | None
    generation_available: bool
    sufficient_evidence: bool
    sources: list[Passage]
    message: str | None = None


class TopicRead(BaseModel):
    topic: str
    subtopics: list[str] = []
    pages: list[int] = []
