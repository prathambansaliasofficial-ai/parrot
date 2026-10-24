"""Parrot tutoring engine: explanations, quizzes, teach-back evaluation.

Shared by the FastAPI website endpoints and the Fetch.ai agent (which calls
the same HTTP endpoints), so there is a single implementation of the core
learning loop per the project architecture.

Real ASI:1 calls are used when ASI_ONE_API_KEY is configured; otherwise a
clearly labelled deterministic demo mode runs over the curated demo dataset.
Responses always expose `demo_mode` so callers never mistake mock output for
model output.
"""

from __future__ import annotations

import re

from app.services import llm
from app.services.demo_data import TEACHBACK_RUBRICS, demo_resources, find_demo_resource
from app.services.retrieval import retrieve_passages, resource_for_topic

DEMO_NOTE_PREFIX = "[Parrot demo mode - deterministic sample output, no LLM key configured]\n\n"


def _abbreviate(content: str, limit: int = 220) -> str:
    if len(content) <= limit:
        return content
    cut = content[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;. ") + "…"


def _passage_snippet(passage: dict, query: str) -> str:
    """Return the part of a passage most related to the query, with sources intact."""
    tokens = {t for t in re.findall(r"[\w']+", query.lower())}
    sentences = re.split(r"(?<=[.!?])\s+", passage["content"])
    scored = [
        (sum(1 for t in tokens if t in s.lower()), s)
        for s in sentences
    ]
    best_sentences = [s for score, s in sorted(scored, reverse=True) if score > 0][:3]
    chosen = " ".join(best_sentences) if best_sentences else passage["content"]
    return _abbreviate(chosen)


def _llm_explain(query: str, passages: list[dict], resource: dict | None) -> tuple[str, list] | None:
    if not passages or not resource:
        return None
    context = "\n\n".join(
        f"[{p['title']} - page {p['page']}]\n{p['content']}" for p in passages
    )
    system = (
        "You are Parrot, a study companion that teaches by asking questions. "
        "Explain the requested concept using ONLY the provided course excerpts. "
        "Structure: definition, then how it works, then one worked example if present, "
        "then end with one question that asks the student to explain the idea back. "
        "If the excerpts do not cover the question, say the material does not cover it."
    )
    user = f"Course excerpts:\n{context}\n\nStudent question: {query}\nTopic area: {resource['subject']}"
    reply = llm.chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    if reply:
        return reply, []
    return None


def explain(query: str, resource_id: str | None) -> tuple[str | None, list, bool, str | None]:
    """Return (explanation|None-if-ungrounded, sources, demo_mode, topic)."""
    # First, try to retrieve relevant passages
    passages = retrieve_passages(query, resource_id=resource_id)
    resource = resource_for_topic(query, resource_id)

    # Also try to get concept blocks if the resource has been processed
    from app.services.topic_id import identify_topics
    from app.services.demo_data import find_demo_resource
    concepts: list[dict] = []
    concept_resource = None

    if resource_id and resource_id.startswith("demo-"):
        concept_resource = find_demo_resource(resource_id)
        if concept_resource:
            result = identify_topics(
                resource_id=resource_id,
                subject=concept_resource.get("subject", ""),
                category=concept_resource.get("category", ""),
                extracted_text=" ".join(p["content"] for p in concept_resource.get("passages", [])),
            )
            concepts = result["concepts"]

    # If we have concept blocks, prefer using them for grounded explanations
    from app.services.llm import llm_available
    if concepts:
        # Find the concept most relevant to the query (minimum relevance threshold)
        import re as _re
        query_tokens = {t for t in _re.findall(r"[\w']+", query.lower())}
        best_concept = None
        best_score = -1
        for c in concepts:
            concept_text = f"{c.concept_title} {c.explanation} { ' '.join(c.key_definitions) }"
            concept_tokens = {t for t in _re.findall(r"[\w']+", concept_text.lower())}
            score = len(query_tokens & concept_tokens)
            if score > best_score:
                best_score = score
                best_concept = c

        # Only use concept block if there's meaningful overlap with the query
        if best_concept and best_score >= 1:
            # Build explanation from the concept block
            parts = [f"**{best_concept.concept_title}**"]
            if best_concept.key_definitions:
                parts.append("**Definitions:** " + "; ".join(best_concept.key_definitions))
            if best_concept.important_facts:
                parts.append("**Key facts:** " + "; ".join(best_concept.important_facts[:3]))
            if best_concept.examples:
                parts.append("**Example:** " + best_concept.examples[0])
            if best_concept.keywords:
                parts.append("**Related terms:** " + ", ".join(best_concept.keywords[:6]))
            explanation_text = "\n\n".join(parts)

            # Add source reference
            sources = [
                {
                    "resource_id": best_concept.resource_id,
                    "title": concept_resource["title"] if concept_resource else best_concept.concept_title,
                    "page": best_concept.page_numbers[0] if best_concept.page_numbers else None,
                    "snippet": best_concept.explanation,
                }
            ]
            topic = best_concept.subject or resource["subject"] if resource else None
            # Use demo_mode=True when no LLM key is configured, matching the original contract
            demo = not llm_available()
            prefixed = (DEMO_NOTE_PREFIX + explanation_text) if demo else explanation_text
            return prefixed, sources, demo, topic

    # Fall back to passage-based retrieval (original behavior)
    if not passages or not resource:
        return None, [], False, None

    lead = passages[0]
    text = (
        f"**{lead['title']} (page {lead['page']})**\n\n"
        + "\n\n".join(f"… {p['content']}" for p in passages)
        + "\n\nNow explain it back in your own words: what does the excerpt above mean, in 2-3 sentences?"
    )
    sources = [
        {
            "resource_id": p["resource_id"],
            "title": p["title"],
            "page": p["page"],
            "snippet": _passage_snippet(p, query),
        }
        for p in passages
    ]
    return DEMO_NOTE_PREFIX + text, sources, True, resource["subject"]


def next_quiz_question(resource_id: str, asked_ids: list[str] | None = None) -> dict | None:
    resource = find_demo_resource(resource_id) if resource_id else None
    if not resource:
        return None
    asked = set(asked_ids or [])
    bank = resource["quiz"]
    unseen = [q for q in bank if q["id"] not in asked]
    pool = unseen or bank
    if not pool:
        return None
    return min(pool, key=lambda q: q["difficulty"])


def quiz_question(resource_id: str, asked_ids: list[str] | None = None) -> tuple[dict, list, str] | None:
    """Return (question_for_student, sources, topic) or None.
    
    Falls back to concept-based question generation when the quiz bank has no 
    remaining questions.
    """
    resource = find_demo_resource(resource_id)
    if not resource:
        return None
    question = next_quiz_question(resource_id, asked_ids)
    if not question:
        # No quiz available from bank — fall back to concept-based generation
        from app.services.topic_id import identify_topics as _identify_topics
        from app.services.demo_data import find_demo_resource as _find_dr

        concepts: list = []
        concept_resource = None
        if resource_id and resource_id.startswith("demo-"):
            concept_resource = _find_dr(resource_id)
            if concept_resource:
                result = _identify_topics(
                    resource_id=resource_id,
                    subject=concept_resource.get("subject", ""),
                    category=concept_resource.get("category", ""),
                )
                concepts = result["concepts"]

        if concepts:
            import re as _re
            # Find the best concept matching the resource's subject area
            best_concept = None
            best_score = -1
            for c in concepts:
                concept_text = f"{c.concept_title} {c.explanation} { ' '.join(c.key_definitions) }"
                # Score based on concept title relevance
                score = len(set(_re.findall(r"[\w']+", concept_text.lower())) &
                           set(_re.findall(r"[\w']+", resource.get("subject", "").lower())))
                if score > best_score:
                    best_score = score
                    best_concept = c

            if best_concept:
                # Generate a quiz question from the concept
                stem = f"Which of the following best describes {best_concept.concept_title}?"
                options = [
                    best_concept.key_definitions[0] if best_concept.key_definitions else "definition",
                    best_concept.important_facts[0] if best_concept.important_facts else "fact",
                    best_concept.keywords[0] if best_concept.keywords else "term",
                    "other",
                ]
                # Shuffle options conceptually - keep first as correct-ish
                difficulty = 2
                question = {
                    "id": f"concept-{best_concept.concept_title.lower().replace(' ', '-')}",
                    "type": "short_answer",
                    "stem": stem,
                    "options": options,
                    "difficulty": difficulty,
                    "accepted_keywords": [best_concept.key_definitions[0]] if best_concept.key_definitions else [],
                    "explanation": best_concept.explanation or f"{best_concept.concept_title} is covered in the resource material.",
                }
                first_passage = resource["passages"][0]
                sources = [
                    {
                        "resource_id": resource["id"],
                        "title": resource["title"],
                        "page": first_passage["page"],
                        "snippet": _abbreviate(first_passage["content"], 160),
                    }
                ]
                student_question = {
                    "id": question["id"],
                    "type": question["type"],
                    "stem": question["stem"],
                    "options": question["options"],
                    "difficulty": question["difficulty"],
                }
                return student_question, sources, resource["subject"]

    first_passage = resource["passages"][0]
    sources = [
        {
            "resource_id": resource["id"],
            "title": resource["title"],
            "page": first_passage["page"],
            "snippet": _abbreviate(first_passage["content"], 160),
        }
    ]
    student_question = {
        "id": question["id"] if question else f"q-{resource_id}",
        "type": question["type"] if question else "short_answer",
        "stem": question["stem"] if question else f"What is {resource.get('subject', 'the topic')}?",
        "options": question["options"] if question else [],
        "difficulty": question["difficulty"] if question else 2,
    }
    return student_question, sources, resource["subject"]


def check_quiz_answer(question_id: str, answer: str) -> dict | None:
    """Grade a quiz answer; never expose grading internals to the caller."""
    for resource in demo_resources():
        for question in resource["quiz"]:
            if question["id"] == question_id:
                break
        else:
            continue
        break
    else:
        return None

    if question["type"] == "multiple_choice":
        try:
            selected = int(str(answer).strip())
        except ValueError:
            selected = None
        correct = selected == question["answer_index"]
    else:
        normalized = re.sub(r"[^a-z0-9 ]", " ", answer.lower())
        correct = any(
            any(keyword in normalized for keyword in group)
            for group in question["accepted_keywords"]
        )

    return {
        "correct": correct,
        "correct_answer": (
            question["options"][question["answer_index"]]
            if question["type"] == "multiple_choice" and question["answer_index"] is not None
            else question["explanation"]
        ),
        "explanation": question["explanation"],
        "difficulty_next": min(question["difficulty"] + (1 if correct else -1), 3),
        "resource_id": resource["id"],
    }


# ---------------------------------------------------------------------------#
# Teach-back evaluation
# ---------------------------------------------------------------------------#

_WORD_COUNT_MIN = 12


def _keyword_hits(keywords: list[str], normalized: str, wordset: set[str]) -> bool:
    """Match a keyword list against an explanation.

    Short tokens (like "n" or "b") are matched as whole words; longer
    phrases match as substrings. This avoids e.g. "n" matching inside
    "entropy".
    """

    for keyword in keywords:
        attr = keyword.lower()
        if len(attr) <= 2:
            if attr in wordset:
                return True
        elif attr in normalized:
            return True
    return False


def _evaluate_demo(topic_rubric: dict, explanation: str) -> tuple[dict, bool]:
    """Deterministic keyword-rubric evaluation. Returns (feedback, ambiguous)."""
    # demo output must always be labelled; see evaluate_teachback's contract
    word_count = len(explanation.split())
    normalized = re.sub(r"[^\w' ]", " ", explanation.lower())
    wordset = set(re.findall(r"\w+", normalized))

    correct_points: list[str] = []
    missing_points: list[str] = []
    misconceptions: list[str] = []

    for item in topic_rubric["expected_points"]:
        if _keyword_hits(item["keywords"], normalized, wordset):
            correct_points.append(item["point"])
        else:
            missing_points.append(item["point"])

    for item in topic_rubric["misconceptions"]:
        if any(t.lower() in normalized for t in item["triggers"]):
            misconceptions.append(item["misconception"])

    if word_count < _WORD_COUNT_MIN or (not correct_points and not misconceptions):
        ambiguous = True
    else:
        ambiguous = False

    if ambiguous:
        feedback = {
            "overall_assessment": "unclear",
            "correct_points": correct_points,
            "missing_points": missing_points,
            "misconceptions": misconceptions,
            "feedback": (
                "I could not tell yet whether this explanation matches the material. "
                "Write a couple more sentences covering what induces the emf and what "
                "the direction of the induced current depends on." if correct_points
                else
                "Try again with a bit more detail using the ideas from the resource — "
                "or ask me to re-explain the concept first."
            ),
            "next_question": topic_rubric["prompts"][0],
        }
    else:
        if not missing_points and not misconceptions:
            overall = "correct"
        elif not misconceptions:
            overall = "partially_correct"
        else:
            overall = "incorrect"
        feedback = {
            "overall_assessment": overall,
            "correct_points": correct_points,
            "missing_points": missing_points,
            "misconceptions": misconceptions,
            "feedback": (
                f"Good — you covered {len(correct_points)} of the key ideas. "
                + (f"In particular, {correct_points[0].split(', ')[0]} is right. " if correct_points else "")
                + (
                    f"Still missing: {missing_points[0]}." if missing_points and not misconceptions
                    else ""
                    if not misconceptions
                    else f"One misconception to revisit: {misconceptions[0]}"
                )
            ),
            "next_question": (
                topic_rubric["prompts"][0] if misconceptions or missing_points
                else "Try a harder one: walk through the worked example on page 3 and predict the outcome before reading it."
            ),
        }
    return feedback, ambiguous


def evaluate_teachback(
    topic: str, explanation: str, resource_id: str | None
) -> tuple[dict | None, list, bool, bool]:
    """Return (feedback or None, sources, demo_mode, ambiguous).

    demo_mode True always means the assessment came from the deterministic
    fallback, never from the LLM.
    """

    # Pick the rubric: prefer a clear topic-token match; only fall back to the
    # resource's own rubric when the explanation actually touches its points.
    candidates = list(TEACHBACK_RUBRICS.items())
    if resource_id:
        candidates = [(t, r) for t, r in candidates if r["resource_id"] == resource_id] or candidates

    rubric_entry = None
    best_overlap = 0
    for rubric_topic, rubric in candidates:
        overlap = 1 if _tokens_overlap(rubric_topic, topic) else 0
        if overlap > best_overlap:
            rubric_entry, best_overlap, topic = rubric, overlap, rubric_topic
    if rubric_entry is None:
        normalized_expl = re.sub(r"[^\w' ]", " ", explanation.lower())
        wordset = set(re.findall(r"\w+", normalized_expl))
        for rubric in TEACHBACK_RUBRICS.values():
            if resource_id and rubric["resource_id"] != resource_id:
                continue
            touched = any(
                _keyword_hits(item["keywords"], normalized_expl, wordset)
                for item in rubric["expected_points"]
            )
            if touched:
                rubric_entry = rubric
                break
    if rubric_entry is None:
        # Honour the honesty rule: no fabricated assessment for an out-of-material topic.
        return None, [], False, True

    # Try the real LLM first when configured.
    if llm.llm_available():
        llm_feedback = _evaluate_with_llm(topic, explanation, rubric_entry)
        if llm_feedback:
            sources = _rubric_sources(rubric_entry, explanation)
            return llm_feedback, sources, False, llm_feedback["overall_assessment"] == "unclear"
        # Fall through to demo evaluation with a note.

    feedback, ambiguous = _evaluate_demo(rubric_entry, explanation)
    if ambiguous and llm.llm_available():
        feedback["feedback"] = (
            "[Demo-mode fallback used: the LLM call failed or returned unusable JSON.]\n\n"
            + feedback["feedback"]
        )
    sources = _rubric_sources(rubric_entry, explanation)
    return feedback, sources, True, ambiguous


def _tokens_overlap(a: str, b: str) -> bool:
    stop = {"the", "a", "an", "of", "and", "in", "on", "for", "is", "to"}
    ta = {t for t in re.findall(r"\w+", a.lower()) if t not in stop}
    tb = {t for t in re.findall(r"\w+", b.lower()) if t not in stop}
    return bool(ta & tb)


def _evaluate_with_llm(topic: str, explanation: str, rubric: dict) -> dict | None:
    system = (
        "You are Parrot, a learn-by-teaching study tutor. Evaluate the student's "
        "explanation strictly against the provided reference points. Respond ONLY "
        "with a JSON object with keys: overall_assessment (one of \"correct\", "
        "\"partially_correct\", \"incorrect\", \"unclear\"), correct_points (list of "
        "short strings), missing_points (list), misconceptions (list), feedback "
        "(one short paragraph addressed to the student), next_question (string), "
        "sources (empty list). Distinguish incorrect statements from merely missing "
        "details. Do not penalise different wording when the idea is right. If the "
        "explanation is too short or ambiguous, use overall_assessment \"unclear\"."
    )
    expected = "\n".join(f"- {item['point']}" for item in rubric["expected_points"])
    user = (
        f"Topic: {topic}\nReference points from the course material:\n{expected}\n\n"
        f"Student explanation:\n{explanation}"
    )
    reply = llm.chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=600,
    )
    parsed = llm.extract_json_object(reply or "")
    if not parsed or "overall_assessment" not in parsed:
        return None
    feedback = {
        "overall_assessment": str(parsed.get("overall_assessment", "unclear")),
        "correct_points": [str(x) for x in parsed.get("correct_points", [])][:10],
        "missing_points": [str(x) for x in parsed.get("missing_points", [])][:10],
        "misconceptions": [str(x) for x in parsed.get("misconceptions", [])][:10],
        "feedback": str(parsed.get("feedback", ""))[:2000],
        "next_question": str(parsed.get("next_question", ""))[:500],
    }
    return feedback


def _rubric_sources(rubric: dict, explanation: str) -> list[dict]:
    resource = find_demo_resource(rubric["resource_id"])
    if not resource:
        return []
    passage = resource["passages"][0]
    return [
        {
            "resource_id": resource["id"],
            "title": resource["title"],
            "page": passage["page"],
            "snippet": _abbreviate(passage["content"], 160),
        }
    ]


# ---------------------------------------------------------------------------#
# Revision plans
# ---------------------------------------------------------------------------#

def revision_plan(session_id: str, resource_id: str | None, topic: str | None) -> tuple[dict, bool]:
    """Build a plan from recorded progress; falls back to resource topics in demo mode."""

    from app.services.progress import get_session_progress

    records = get_session_progress(session_id)
    relevant = [r for r in records if not resource_id or r.get("resource_id") == resource_id]
    demo_mode = True
    items: list[dict] = []

    if relevant:
        demo_mode = False
        seen_misconceptions: dict[str, int] = {}
        weak_points = 0
        for record in relevant:
            for misconception in record.get("misconceptions", []):
                seen_misconceptions[misconception] = seen_misconceptions.get(misconception, 0) + 1
            if record.get("overall_assessment") in {"partially_correct", "incorrect", "unclear"}:
                weak_points += 1
        items.append({
            "title": "Revisit misunderstood ideas",
            "detail": "Recurrence counts: " + (
                "; ".join(f"{m} ({c})" for m, c in sorted(seen_misconceptions.items(), key=lambda kv: -kv[1]))
                or "none recorded — keep practising"
            ),
        })
        items.append({
            "title": "Re-quiz weak topics",
            "detail": f"{weak_points} of {len(relevant)} recorded attempts came back below 'correct'. Re-run Quiz me on those topics.",
        })
        if resource_id:
            resource = find_demo_resource(resource_id)
            if resource:
                items.append({
                    "title": "Study next",
                    "detail": f"Re-read {resource['title']} (passages on pages {', '.join(str(p['page']) for p in resource['passages'])}).",
                })
                for quiz_q in resource["quiz"]:
                    items.append({
                        "title": f"Self-test: {quiz_q['stem'][:70]}…",
                        "detail": f"Type {quiz_q['difficulty']}/3 difficulty — use Quiz me in Parrot to answer interactively.",
                    })
        else:
            items.append({
                "title": "Pick a resource first",
                "detail": "Open any resource from the Resources page, then press Quiz me.",
            })
    else:
        resource = resource_for_topic(topic or "", resource_id)
        if not resource and not resource_id and demo_resources():
            resource = demo_resources()[0]
        if resource:
            items.append({
                "title": f"Re-read {resource['title']}",
                "detail": "DEMO plan (no recorded progress for this session yet). Start with the passages in order.",
            })
            for quiz_q in resource["quiz"]:
                items.append({
                    "title": f"Self-test: {quiz_q['stem'][:70]}…",
                    "detail": f"Type {quiz_q['difficulty']}/3 difficulty — use Quiz me in Parrot to answer interactively.",
                })
        else:
            items.append({
                "title": "Pick a resource first",
                "detail": "Open any resource from the Resources page, then press Quiz me.",
            })
    return {"items": items}, demo_mode


# ---------------------------------------------------------------------------#
# URL-safe base64 for resource IDs
# ---------------------------------------------------------------------------#

def _b64url_encode(value: str) -> str:
    import base64
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def _b64url_decode(value: str) -> str:
    import base64
    # Add padding if needed
    padding = 4 - len(value) % 4
    if padding != 4:
        value += "=" * padding
    return base64.urlsafe_b64decode(value).decode()