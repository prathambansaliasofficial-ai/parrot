from pydantic import BaseModel, ConfigDict


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
    processing_status: str = "pending"
