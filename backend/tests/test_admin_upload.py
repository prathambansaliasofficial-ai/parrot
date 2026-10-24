from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import admin
from app.main import app


class FakeQuery:
    def __init__(self, client):
        self.client = client
        self.filters = {}
        self.action = "select"
        self.payload = None

    def select(self, *args):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def limit(self, *args):
        return self

    def single(self):
        return self

    def insert(self, payload):
        self.action, self.payload = "insert", payload
        return self

    def execute(self):
        if self.action == "insert":
            if self.client.fail_insert:
                raise RuntimeError("database unavailable")
            self.client.resource = {**self.payload, "id": str(uuid4())}
            return SimpleNamespace(data=self.client.resource)
        if self.client.resource and all(self.client.resource.get(k) == v for k, v in self.filters.items()):
            return SimpleNamespace(data=[self.client.resource])
        return SimpleNamespace(data=[])


class FakeBucket:
    def __init__(self, client):
        self.client = client

    def upload(self, path, content, file_options):
        if self.client.fail_upload:
            raise RuntimeError("storage unavailable")
        self.client.files[path] = (content, file_options)

    def remove(self, paths):
        self.client.removed.extend(paths)
        for path in paths:
            self.client.files.pop(path, None)


class FakeClient:
    def __init__(self, resource=None, fail_upload=False, fail_insert=False):
        self.resource = resource
        self.fail_upload, self.fail_insert = fail_upload, fail_insert
        self.files, self.removed = {}, []
        self.storage = self

    def table(self, name):
        return FakeQuery(self)

    def from_(self, bucket):
        return FakeBucket(self)


def test_upload_rejects_mismatched_extension_and_media_type(monkeypatch):
    monkeypatch.setattr(admin, "get_settings", lambda: SimpleNamespace(ingestion_api_key="test-ingestion-key"))
    response = TestClient(app).post(
        "/api/v1/admin/resources/upload",
        headers={"X-Ingestion-Key": "test-ingestion-key"},
        data={
            "course_id": "11111111-1111-4111-8111-111111111111",
            "title": "Example",
            "category": "notes",
        },
        files={"file": ("fake.pdf", b"not a pdf", "image/png")},
    )
    assert response.status_code == 415


def test_upload_stores_private_file_and_resource_then_schedules_processing(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(admin, "get_settings", lambda: SimpleNamespace(ingestion_api_key="test-ingestion-key", max_upload_size_mb=1, supabase_storage_bucket="course-resources"))
    monkeypatch.setattr(admin, "get_supabase_client", lambda: client)
    processed = []
    monkeypatch.setattr(admin, "process_resource", lambda resource_id: processed.append(resource_id))
    response = TestClient(app).post(
        "/api/v1/admin/resources/upload",
        headers={"X-Ingestion-Key": "test-ingestion-key"},
        data={"course_id": "11111111-1111-4111-8111-111111111111", "title": "Faraday notes", "category": "notes"},
        files={"file": ("notes.pdf", b"%PDF-1.7 demo content", "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["processing_status"] == "queued"
    assert body["duplicate"] is False
    assert len(client.files) == 1
    assert client.resource["is_published"] is False
    assert processed == [body["id"]]


def test_duplicate_upload_reuses_existing_record_without_another_storage_write(monkeypatch):
    import hashlib
    content = b"%PDF-1.7 same demo"
    existing = {"id": str(uuid4()), "course_id": "11111111-1111-4111-8111-111111111111", "category": "notes", "content_hash": hashlib.sha256(content).hexdigest()}
    client = FakeClient(resource=existing)
    monkeypatch.setattr(admin, "get_settings", lambda: SimpleNamespace(ingestion_api_key="test-ingestion-key", max_upload_size_mb=1, supabase_storage_bucket="course-resources"))
    monkeypatch.setattr(admin, "get_supabase_client", lambda: client)
    response = TestClient(app).post(
        "/api/v1/admin/resources/upload",
        headers={"X-Ingestion-Key": "test-ingestion-key"},
        data={"course_id": existing["course_id"], "title": "Same file", "category": "notes"},
        files={"file": ("notes.pdf", content, "application/pdf")},
    )
    assert response.status_code == 201
    assert response.json()["duplicate"] is True
    assert not client.files


@pytest.mark.parametrize("failure", ["storage", "database"])
def test_upload_failures_return_safe_error_and_compensate_storage(monkeypatch, failure):
    client = FakeClient(fail_upload=failure == "storage", fail_insert=failure == "database")
    monkeypatch.setattr(admin, "get_settings", lambda: SimpleNamespace(ingestion_api_key="test-ingestion-key", max_upload_size_mb=1, supabase_storage_bucket="course-resources"))
    monkeypatch.setattr(admin, "get_supabase_client", lambda: client)
    response = TestClient(app).post(
        "/api/v1/admin/resources/upload",
        headers={"X-Ingestion-Key": "test-ingestion-key"},
        data={"course_id": "11111111-1111-4111-8111-111111111111", "title": "Faraday notes", "category": "notes"},
        files={"file": ("notes.pdf", b"%PDF-1.7 demo content", "application/pdf")},
    )
    assert response.status_code == 502
    if failure == "database":
        assert not client.files and len(client.removed) == 1


@pytest.mark.parametrize("url", [
    "http://example.org/file.pdf",
    "https://localhost/file.pdf",
    "https://127.0.0.1/file.pdf",
    "https://169.254.169.254/latest/meta-data/",
    "https://user:pass@example.org/file.pdf",
])
def test_resource_link_rejects_unsafe_source_urls(url):
    with pytest.raises(Exception):
        admin.validate_public_https_url(url)


def test_resource_link_accepts_public_https_source():
    assert admin.validate_public_https_url("https://example.org/notes.pdf") == "https://example.org/notes.pdf"
