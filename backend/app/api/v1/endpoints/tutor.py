"""Tutoring endpoints — the Parrot core learning loop over HTTP.

All responses state `demo_mode` explicitly so no mock output can pass as
real LLM output. Session ids are opaque client-generated ids used only to
group progress records; no personal data is required.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.tutor import (
    EvaluateRequest,
    EvaluateResponse,
    ProgressSummaryResponse,
    QuizAnswerRequest,
    QuizAnswerResponse,
    RevisionPlanRequest,
    TutorMessageRequest,
    TutorMessageResponse,
    RevisionPlan,
)
from app.services.demo_data import TEACHBACK_RUBRICS, find_demo_resource
from app.services.llm import llm_available
from app.services.progress import get_session_progress, record_assessment
from app.services import tutor as tutor_service
from app.services.tutor import DEMO_NOTE_PREFIX

router = APIRouter(prefix="/tutor", tags=["tutor"])

TEACH_BACK_INSTRUCTION = (
    "I want you to teach this back to me: explain it in your own words, "
    "in 2–4 sentences, and I will check it against the course material."
)


@router.post("/message", response_model=TutorMessageResponse)
def tutor_message(request: TutorMessageRequest) -> TutorMessageResponse:
    """Single entry point for the floating widget and the Fetch.ai agent."""

    resource = find_demo_resource(request.resource_id) if request.resource_id else None
    if request.resource_id and not resource:
        return TutorMessageResponse(
            session_id=request.session_id,
            mode=request.mode,
            kind="resource_not_found",
            text="I could not find that resource. Open one from the Resources page and try again.",
            demo_mode=not llm_available(),
            sources=[],
        )

    if request.mode == "explain":
        explanation, sources, demo, topic = tutor_service.explain(request.message, request.resource_id)
        if explanation is None:
            note = (
                "The available material does not cover that, so I cannot give a source-grounded "
                "answer. Try a question closer to the resource's topic."
            )
            return TutorMessageResponse(
                session_id=request.session_id,
                mode=request.mode,
                kind="insufficient_material",
                text=note,
                demo_mode=demo or not llm_available(),
                sources=[],
                focus_topic=topic,
            )
        return TutorMessageResponse(
            session_id=request.session_id,
            mode=request.mode,
            kind="explanation",
            text=explanation,
            demo_mode=demo,
            sources=[_source_ref(s) for s in sources],
            focus_topic=topic,
        )

    if request.mode == "quiz":
        built = tutor_service.quiz_question(request.resource_id, request.asked_question_ids)
        if not built:
            return TutorMessageResponse(
                session_id=request.session_id,
                mode=request.mode,
                kind="insufficient_material",
                text="I could not build a quiz for that resource yet.",
                demo_mode=not llm_available(),
                sources=[],
            )
        question, sources, topic = built
        return TutorMessageResponse(
            session_id=request.session_id,
            mode=request.mode,
            kind="quiz_question",
            text="Here's a question from the material — answer it and I'll explain the solution.",
            demo_mode=True,
            sources=[_source_ref(s) for s in sources],
            question=question,
            focus_topic=topic,
        )

    if request.mode == "teach_back":
        topic = request.focus_topic or (resource["title"] if resource else None)
        prompt_text = (
            f"Topic: {topic or request.message}\n\n{TEACH_BACK_INSTRUCTION}"
        )
        return TutorMessageResponse(
            session_id=request.session_id,
            mode=request.mode,
            kind="teach_back_prompt",
            text=prompt_text,
            demo_mode=not llm_available(),
            sources=[],
            focus_topic=topic,
        )

    # mode == "plan"
    plan, demo = tutor_service.revision_plan(request.session_id, request.resource_id, request.focus_topic)
    return TutorMessageResponse(
        session_id=request.session_id,
        mode=request.mode,
        kind="revision_plan",
        text="Here's your revision plan based on your progress on this material.",
        demo_mode=demo or not llm_available(),
        sources=[],
        plan=RevisionPlan(items=[{"title": i["title"], "detail": i["detail"]} for i in plan["items"]]),
    )


def _source_ref(source: dict):
    from app.schemas.tutor import SourceRef

    return SourceRef(**source)


@router.post("/quiz/answer", response_model=QuizAnswerResponse)
def tutor_quiz_answer(request: QuizAnswerRequest, session_id: str | None = Query(default=None)) -> QuizAnswerResponse:
    graded = tutor_service.check_quiz_answer(request.question_id, request.answer)
    if not graded:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown question id.")
    return QuizAnswerResponse(
        correct=graded["correct"],
        correct_answer=graded["correct_answer"],
        explanation=graded["explanation"],
        difficulty_next=graded["difficulty_next"],
        resource_id=graded["resource_id"],
        session_id=session_id,
    )


@router.post("/evaluate", response_model=EvaluateResponse)
def tutor_evaluate(request: EvaluateRequest) -> EvaluateResponse:
    resource = find_demo_resource(request.resource_id) if request.resource_id else None
    feedback, sources, demo, _ambiguous = tutor_service.evaluate_teachback(
        request.topic, request.explanation, request.resource_id
    )
    if feedback is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "I don't have an evaluation rubric for that topic in the current material. "
                "Pick a topic the selected resource actually covers."
            ),
        )
    recorded, _backend = record_assessment(
        request.session_id,
        resource_id=request.resource_id or (resource["id"] if resource else None),
        topic=request.topic,
        question=f"Teach back: {request.topic}",
        student_answer=request.explanation,
        overall_assessment=feedback["overall_assessment"],
        correct_points=feedback["correct_points"],
        missing_points=feedback["missing_points"],
        misconceptions=feedback["misconceptions"],
        next_question=feedback["next_question"],
        recommended_activity=(
            "Re-explain the missed points and re-run the quiz."
            if feedback["overall_assessment"] != "correct"
            else "Move to the next topic/harder question."
        ),
    )
    return EvaluateResponse(
        demo_mode=demo,
        sources=[_source_ref(s) for s in sources],
        feedback=feedback,
        recorded=recorded,
    )


@router.post("/plan")
def tutor_plan(request: RevisionPlanRequest) -> dict:
    plan, demo = tutor_service.revision_plan(
        request.session_id, request.resource_id, request.focus_topic
    )
    return {
        "session_id": request.session_id,
        "demo_mode": demo or not llm_available(),
        "items": plan["items"],
    }


@router.get("/progress", response_model=ProgressSummaryResponse)
def tutor_progress(session_id: str = Query(min_length=4, max_length=64)) -> ProgressSummaryResponse:
    records = get_session_progress(session_id)
    return ProgressSummaryResponse(
        session_id=session_id,
        record_count=len(records),
        demo_mode=not _progress_on_supabase(),
        records=records,
    )


def _progress_on_supabase() -> bool:
    from app.services.progress import supabase_configured

    return supabase_configured()


@router.get("/topics")
def tutor_topics(resource_id: str | None = Query(default=None)) -> dict:
    """Topics that have an evaluation rubric (used by the widget)."""

    topics = [
        {"topic": topic, "resource_id": rubric["resource_id"]}
        for topic, rubric in TEACHBACK_RUBRICS.items()
        if not resource_id or rubric["resource_id"] == resource_id
    ]
    return {"topics": topics, "demo_data_available": bool(TEACHBACK_RUBRICS), "demo_note": DEMO_NOTE_PREFIX.strip()}
