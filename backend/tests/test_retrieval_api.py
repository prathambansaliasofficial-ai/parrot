from fastapi.testclient import TestClient

from app.main import app
from app.api.v1.endpoints import resources
from app.core.config import get_settings


def test_search_returns_only_selected_resource_and_source_metadata(monkeypatch):
    monkeypatch.setattr(resources, "search_passages", lambda *a, **kw: [{
        "chunk_id": "c1", "resource_id": "r1", "content": "Faraday law passage", "page_number": 4,
        "section_ref": "Unit 2", "topic": "Electromagnetic induction", "subtopic": None,
        "title": "Physics notes", "category": "notes", "course_id": "course1", "score": 0.4,
    }])
    response = TestClient(app).post("/api/v1/resources/search", json={"query": "Faraday law", "resource_id": "11111111-1111-4111-8111-111111111111"})
    assert response.status_code == 200
    body = response.json()
    assert body["sufficient_evidence"] is True
    assert body["results"][0]["page_number"] == 4
    assert body["results"][0]["resource_id"] == "r1"


def test_question_without_model_credentials_returns_retrieval_not_fake_answer(monkeypatch):
    monkeypatch.setattr(resources, "search_passages", lambda *a, **kw: [{
        "chunk_id": "c1", "resource_id": "r1", "content": "Faraday law passage", "page_number": 4,
        "section_ref": "Unit 2", "topic": "Electromagnetic induction", "subtopic": None,
        "title": "Physics notes", "category": "notes", "course_id": "course1", "score": 0.4,
    }])
    monkeypatch.setattr(get_settings(), "asi_one_api_key", None)
    response = TestClient(app).post("/api/v1/resources/ask", json={"query": "Faraday law"})
    assert response.status_code == 200
    body = response.json()
    assert body["answer"] is None
    assert body["generation_available"] is False
    assert body["sources"][0]["page_number"] == 4


def test_insufficient_evidence_returns_empty_answer(monkeypatch):
    monkeypatch.setattr(resources, "search_passages", lambda *a, **kw: [])
    response = TestClient(app).post("/api/v1/resources/ask", json={"query": "unrelated subject"})
    assert response.status_code == 200
    assert response.json()["sufficient_evidence"] is False
    assert response.json()["answer"] is None


def test_generation_uses_only_retrieved_sources_and_keeps_citation_metadata(monkeypatch):
    class Completion:
        choices = [type("Choice", (), {"message": type("Message", (), {"content": "Faraday's law describes induced EMF. [Source 1]"})()})()]

    async def fake_create(self, **kwargs):
        assert "Faraday law passage" in kwargs["messages"][1]["content"]
        assert "only the supplied study passages" in kwargs["messages"][0]["content"]
        return Completion()

    class AsyncClient:
        def __init__(self, **kwargs):
            self.chat = type("Chat", (), {"completions": type("Completions", (), {"create": fake_create})()})()

    monkeypatch.setattr(resources, "search_passages", lambda *a, **kw: [{
        "chunk_id": "c1", "resource_id": "r1", "content": "Faraday law passage", "page_number": 4,
        "section_ref": "Unit 2", "topic": "Electromagnetic induction", "subtopic": None,
        "title": "Physics notes", "category": "notes", "course_id": "course1", "score": 0.4,
    }])
    settings = get_settings()
    monkeypatch.setattr(settings, "asi_one_api_key", "test-key")
    monkeypatch.setattr(resources, "AsyncOpenAI", AsyncClient)
    response = TestClient(app).post("/api/v1/resources/ask", json={"query": "Faraday law"})
    assert response.status_code == 200
    assert "[Source 1]" in response.json()["answer"]
    assert response.json()["sources"][0]["page_number"] == 4
