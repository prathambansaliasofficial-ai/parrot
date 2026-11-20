from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    category: str
    description: str | None = None
    storage_path: str | None = None
    source_url: str | None = None
    original_file_name: str | None = None
    content_type: str | None = None
    file_size_bytes: int | None = None
    is_demo: bool = False


class ResourceMetadata(BaseModel):
    subject: str | None = None
    branch: str | None = None
    semester: str | None = None
    college: str | None = None
    course: str | None = None
    topics: list[str] = Field(default_factory=list)


class ResourcePassage(BaseModel):
    id: str
    page: int
    content: str


class ResourceDetail(ResourceRead):
    metadata: ResourceMetadata | None = None
    passages: list[ResourcePassage] = Field(default_factory=list)
    source: Literal["supabase"] = "supabase"
