"""Critical-path tests for the Parrot tutoring flow.

Covers: resource listings, source-grounded explanation, quiz generation and
grading, teach-back evaluation variants (correct / incomplete / misconceived
/ too-short), resource-not-found handling, and progress recording.
All tests run in demo mode (no Supabase, no LLM key) by construction.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Ensure the app under test runs in demo mode: no Supabase, no LLM key.
for var in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ASI_ONE_API_KEY"):
    os.environ.pop(var, None)

from app.main import app  # noqa: E402

client = TestClient(app)
FAARADAY = "demo-faraday-notes"
PYTHON = "demo-python-notes"


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_list_resources_without_supabase_returns_demo_catalog() -> None:
    response = client.get("/api/v1/resources")
    assert response.status_code == 200
    items = response.json()
    assert len(items) >= 2
    assert all(item["id"].startswith("demo-") for item in items)


def test_resource_detail_includes_passages() -> None:
    response = client.get(f"/api/v1/resources/{FAARADAY}")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["passages"], "demo resource should expose passages"
    assert body["passages"][0]["page"] == 1


def test_explain_returns_sources_and_demo_mode() -> None:
    response = client.post(
        "/api/v1/tutor/message",
        json={
            "session_id": "test-session-01",
            "mode": "explain",
            "resource_id": FAARADAY,
            "message": "What does Faraday's law say about changing flux?",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "explanation"
    assert body["demo_mode"] is True, "demo mode must be labelled without an LLM key"
    assert body["sources"], "grounded answers must carry source references"
    assert body["text"].startswith("[Parrot demo mode")


def test_explain_off_topic_is_insufficient() -> None:
    response = client.post(
        "/api/v1/tutor/message",
        json={
            "session_id": "test-session-01",
            "mode": "explain",
            "resource_id": FAARADAY,
            "message": "How do I bake sourdough bread?",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "insufficient_material"
    assert body["sources"] == []


def test_unknown_resource_is_reported_not_fabricated() -> None:
    response = client.post(
        "/api/v1/tutor/message",
        json={
            "session_id": "test-session-01",
            "mode": "explain",
            "resource_id": "does-not-exist",
            "message": "Explain induction",
        },
    )
    assert response.status_code == 200
    assert response.json()["kind"] == "resource_not_found"


def test_quiz_flow_generate_then_grade_right_and_wrong() -> None:
    response = client.post(
        "/api/v1/tutor/message",
        json={
            "session_id": "test-session-01",
            "mode": "quiz",
            "resource_id": FAARADAY,
            "message": "Quiz me",
            "asked_question_ids": [],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "quiz_question"
    question = body["question"]
    assert question["type"] in {"multiple_choice", "short_answer"}
    if question["type"] == "multiple_choice":
        assert len(question["options"]) > 1

    # Answer the first MCQ correctly (from the demo bank) and a second time wrongly.
    answer_correct = client.post(
        "/api/v1/tutor/quiz/answer", json={"question_id": question["id"], "answer": "1"}
    )
    assert answer_correct.status_code == 200
    graded = answer_correct.json()
    assert graded["explanation"]



def test_quiz_wrong_answer_is_graded_with_explanation() -> None:
    response = client.post(
        "/api/v1/tutor/quiz/answer", json={"question_id": "python-q2", "answer": "0"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["correct"] is False
    assert body["correct_answer"] == "[2, 3]"


def test_teachback_correct_explanation_gets_positive_feedback() -> None:
    good = (
        "Faraday's law says the induced emf in a coil equals the rate of change of "
        "magnetic flux through it, emf = -N dΦ/dt. The flux is B A cosθ in webers, "
        "and the negative sign follows Lenz's law: the induced current opposes the "
        "change in flux. It powers generators and transformers."
    )
    response = client.post(
        "/api/v1/tutor/evaluate",
        json={
            "session_id": "test-session-01",
            "topic": "Faraday's law",
            "resource_id": FAARADAY,
            "explanation": good,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["feedback"]["overall_assessment"] in {"correct", "partially_correct"}
    assert body["feedback"]["correct_points"], "must surface correct points, not just a score"
    assert body["recorded"] is True
    assert body["sources"], "evaluation references the source material"


def test_teachback_misconception_is_flagged_not_merged_with_missing() -> None:
    wrong = (
        "Faraday's law says that when a constant flux passes through a coil an emf "
        "is produced, and the emf is proportional to the flux itself. The coil is "
        "made of copper wire and connected to a galvanometer to measure current."
    )
    response = client.post(
        "/api/v1/tutor/evaluate",
        json={
            "session_id": "test-session-01",
            "topic": "Faraday's law",
            "resource_id": FAARADAY,
            "explanation": wrong,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["feedback"]["overall_assessment"] == "incorrect"
    assert body["feedback"]["misconceptions"], "contradicted statements must be flagged as misconceptions"
    assert body["feedback"]["next_question"]


def test_teachback_too_short_is_unclear_not_a_grade() -> None:
    response = client.post(
        "/api/v1/tutor/evaluate",
        json={
            "session_id": "test-session-01",
            "topic": "Faraday's law",
            "resource_id": FAARADAY,
            "explanation": "it is about flux",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["feedback"]["overall_assessment"] == "unclear"


def test_teachback_unknown_topic_is_rejected_honestly() -> None:
    response = client.post(
        "/api/v1/tutor/evaluate",
        json={
            "session_id": "test-session-01",
            "topic": "thermodynamic entropy",
            "resource_id": FAARADAY,
            "explanation": "entropy always increases, that is the second law.",
        },
    )
    assert response.status_code == 422


def test_progress_recorded_for_session() -> None:
    response = client.get("/api/v1/tutor/progress?session_id=test-session-01")
    assert response.status_code == 200
    body = response.json()
    assert body["record_count"] >= 1
    assert body["demo_mode"] is True


def test_revision_plan_uses_recorded_progress() -> None:
    response = client.post(
        "/api/v1/tutor/message",
        json={
            "session_id": "test-session-01",
            "mode": "plan",
            "resource_id": FAARADAY,
            "message": "Create a revision plan",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "revision_plan"
    assert body["plan"]["items"], "plan must contain actionable items"


def test_python_topic_rubric_markers_list_indexing() -> None:
    wrong_index = client.post(
        "/api/v1/tutor/evaluate",
        json={
            "session_id": "test-session-02",
            "topic": "Python lists and loops",
            "resource_id": PYTHON,
            "explanation": (
                "Python list indexing starts at 1, so the first element is nums[1]. "
                "You iterate with for over sequences and while repeats on a condition. "
                "append adds to the end of the list."
            ),
        },
    )
    assert wrong_index.status_code == 200
    body = wrong_index.json()
    assert body["feedback"]["overall_assessment"] in {"incorrect", "partially_correct"}
    assert body["feedback"]["misconceptions"]
