from types import SimpleNamespace

import pymupdf
import pytest

from app.services import document_ingestion


class Query:
    def __init__(self, client, table):
        self.client, self.table_name = client, table
        self.action, self.payload, self.filters = "select", None, {}

    def select(self, *args, **kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def limit(self, *args):
        return self

    def order(self, *args, **kwargs):
        return self

    def update(self, payload):
        self.action, self.payload = "update", payload
        return self

    def upsert(self, payload, **kwargs):
        self.action, self.payload = "upsert", payload
        return self

    def delete(self):
        self.action = "delete"
        return self

    def gte(self, *args):
        return self

    def execute(self):
        if self.table_name == "resources":
            if self.action == "update":
                self.client.resource.update(self.payload)
                return SimpleNamespace(data=[self.client.resource])
            return SimpleNamespace(data=[self.client.resource.copy()])
        if self.action == "select":
            return SimpleNamespace(data=[], count=self.client.chunk_count)
        if self.action == "upsert":
            self.client.saved_chunks = self.payload
        return SimpleNamespace(data=[])


class FakeClient:
    def __init__(self, resource, content, chunk_count=1):
        self.resource, self.content, self.chunk_count = resource, content, chunk_count
        self.saved_chunks = []
        self.download_count = 0
        self.storage = self

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, params):
        client = self
        class Rpc:
            def execute(self):
                if client.resource.get("processing_status") == "processing":
                    return SimpleNamespace(data=False)
                client.resource["processing_status"] = "processing"
                return SimpleNamespace(data=True)
        return Rpc()

    def from_(self, bucket):
        return self

    def download(self, path):
        self.download_count += 1
        return self.content


def make_pdf(text):
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    content = document.tobytes()
    document.close()
    return content


def resource(status="completed", digest=None):
    return {
        "id": "11111111-1111-4111-8111-111111111111", "title": "Physics notes", "category": "notes",
        "course_id": "22222222-2222-4222-8222-222222222222", "storage_path": "course/notes/file.pdf",
        "original_file_name": "notes.pdf", "content_type": "application/pdf", "content_hash": digest,
        "processing_version": "1" if digest else None, "processing_status": status,
    }


def test_processing_cache_skips_reextract_for_unchanged_document(monkeypatch):
    content = make_pdf("Faraday law and electromagnetic induction")
    import hashlib
    client = FakeClient(resource(digest=hashlib.sha256(content).hexdigest()), content, chunk_count=2)
    monkeypatch.setattr(document_ingestion, "get_supabase_client", lambda: client)
    result = document_ingestion.process_resource(client.resource["id"])
    assert result["cached"] is True
    assert result["chunk_count"] == 2
    assert client.resource["processing_status"] == "completed"
    assert client.download_count == 1


def test_failed_scanned_pdf_sets_failure_status_and_can_be_retried(monkeypatch):
    empty = pymupdf.open()
    empty.new_page()
    scanned = empty.tobytes()
    empty.close()
    client = FakeClient(resource("queued"), scanned)
    monkeypatch.setattr(document_ingestion, "get_supabase_client", lambda: client)
    with pytest.raises(ValueError, match="scanned PDF"):
        document_ingestion.process_resource(client.resource["id"])
    assert client.resource["processing_status"] == "failed"
    assert "scanned PDF" in client.resource["processing_error"]

    client.content = make_pdf("This is readable study material.")
    result = document_ingestion.process_resource(client.resource["id"])
    assert result["processing_status"] == "completed"
    assert client.saved_chunks
