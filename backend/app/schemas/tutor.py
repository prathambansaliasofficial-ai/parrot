"""Request/response models for the Parrot tutoring API.

The teach-back feedback object follows the project's conceptual output
contract (overall_assessment / correct_points / missing_points /
misconceptions / feedback / next_question / sources), validated here with
the backend's pydantic conventions.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

TutorMode = Literal["explain", "quiz", "teach_back", "plan"]


class SourceRef(BaseModel):
    resource_id: str
    title: str
    page: int | None = None
    snippet: str


class TutorMessageRequest(BaseModel):
    session_id: str = Field(min_length=4, max_length=64)
    message: str = Field(min_length=1, max_length=4000)
    resource_id: str | None = None
    focus_topic: str | None = Field(default=None, max_length=200)
    mode: TutorMode = "explain"
    asked_question_ids: list[str] = Field(default_factory=list, max_length=50)


class QuizQuestion(BaseModel):
    id: str
    type: Literal["multiple_choice", "short_answer"]
    stem: str
    options: list[str]
    difficulty: int = Field(ge=1, le=3)


class TeachBackFeedback(BaseModel):
    overall_assessment: Literal["correct", "partially_correct", "incorrect", "unclear"]
    correct_points: list[str]
    missing_points: list[str]
    misconceptions: list[str]
    feedback: str
    next_question: str


class PlanItem(BaseModel):
    title: str
    detail: str


class RevisionPlan(BaseModel):
    items: list[PlanItem]


class TutorMessageResponse(BaseModel):
    session_id: str
    mode: TutorMode
    kind: Literal[
        "explanation",
        "quiz_question",
        "teach_back_prompt",
        "insufficient_material",
        "revision_plan",
        "resource_not_found",
    ]
    text: str
    demo_mode: bool
    sources: list[SourceRef] = []
    question: QuizQuestion | None = None
    feedback: TeachBackFeedback | None = None
    plan: RevisionPlan | None = None
    focus_topic: str | None = None


class QuizAnswerRequest(BaseModel):
    question_id: str = Field(min_length=2, max_length=64)
    answer: str = Field(min_length=1, max_length=500)


class QuizAnswerResponse(BaseModel):
    correct: bool
    correct_answer: str
    explanation: str
    difficulty_next: int
    resource_id: str
    session_id: str | None = None


class EvaluateRequest(BaseModel):
    session_id: str = Field(min_length=4, max_length=64)
    topic: str = Field(min_length=2, max_length=200)
    explanation: str = Field(min_length=1, max_length=6000)
    resource_id: str | None = None


class EvaluateResponse(BaseModel):
    demo_mode: bool
    sources: list[SourceRef]
    feedback: TeachBackFeedback
    recorded: bool


class RevisionPlanRequest(BaseModel):
    session_id: str = Field(min_length=4, max_length=64)
    resource_id: str | None = None
    focus_topic: str | None = Field(default=None, max_length=200)


class ProgressSummaryResponse(BaseModel):
    session_id: str
    record_count: int
    demo_mode: bool
    records: list[dict[str, Any]]
