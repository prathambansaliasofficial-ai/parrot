
"""Learning-progress storage.

Uses Supabase (table `learning_progress`, see supabase/migrations/) when the
server is configured with credentials; otherwise keeps a clearly labelled
in-process demo store so assessments can still be recorded in a session.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.core.config import get_settings
from app.services.demo_data import is_demo_id

# session_id -> list[record dict]. In-process, per restart — demo only.
_DEMO_STORE: dict[str, list[dict]] = {}

QUESTION_STOP = 20


def supabase_configured() -> bool:
    settings = get_settings()
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def record_assessment(
    session_id: str,
    *,
    resource_id: str | None,
    topic: str,
    question: str,
    student_answer: str,
    overall_assessment: str,
    correct_points: list[str],
    missing_points: list[str],
    misconceptions: list[str],
    next_question: str,
    recommended_activity: str,
) -> tuple[bool, str]:
    """Persist one assessment. Returns (recorded, storage_backend)."""

    record = {
        "session_id": session_id,
        "resource_id": resource_id,
        "topic": topic,
        "question": question,
        "student_answer": student_answer[:2000],
        "overall_assessment": overall_assessment,
        "correct_points": correct_points,
        "missing_points": missing_points,
        "misconceptions": misconceptions,
        "next_question": next_question,
        "recommended_activity": recommended_activity,
    }

    if supabase_configured():
        from app.core.supabase import get_supabase_client

        row = {**record, "id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}
        get_supabase_client().table("learning_progress").insert(row).execute()
        return True, "supabase"

    _DEMO_STORE.setdefault(session_id, []).append(record)
    return True, "demo-in-memory"


def get_session_progress(session_id: str) -> list[dict]:
    if supabase_configured():
        from app.core.supabase import get_supabase_client

        result = (
            get_supabase_client()
            .table("learning_progress")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .limit(200)
            .execute()
        )
        return result.data  # type: ignore[no-any-return]
    return list(_DEMO_STORE.get(session_id, []))
