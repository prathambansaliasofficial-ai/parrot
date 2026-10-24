from typing import Literal

from pydantic import BaseModel, ConfigDict


class ResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    category: str
    description: str | None = None
    storage_path: str | None = None


class ResourceMetadata(BaseModel):
    subject: str | None = None
    branch: str | None = None
    semester: str | None = None
    college: str | None = None
    course: str | None = None
    topics: list[str] = []


class ResourcePassage(BaseModel):
    id: str
    page: int
    content: str


class ResourceDetail(ResourceRead):
    metadata: ResourceMetadata | None = None
    passages: list[ResourcePassage] = []
    source: Literal["supabase", "demo"] = "demo"
