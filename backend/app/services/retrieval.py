"""Keyword-overlap retrieval over demo passages.

Deliberately simple: tokenise the query, score each passage by weighted
keyword hits, and return the top passages with full source metadata.
When Supabase/pgvector is configured this service is bypassed for storage
retrieval, but scoring stays shared so both paths return the same shape.
"""

from __future__ import annotations

import re

from app.services.demo_data import demo_resources, find_demo_resource

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
    "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on",
    "or", "please", "that", "the", "this", "to", "was", "what", "when",
    "which", "who", "why", "with", "you", "your",
}

# Higher weight when a token appears repeatedly in a passage.
_TOKEN_PATTERN = re.compile(r"[\w+']+")


def _tokenise(text: str) -> set[str]:
    tokens = {t.lower().strip("'") for t in _TOKEN_PATTERN.findall(text.lower())}
    return tokens - STOPWORDS


def score_passage(query_tokens: set[str], content: str) -> int:
    tokens = _tokenise(content)
    return len(query_tokens & tokens)


def retrieve_passages(
    query: str,
    resource_id: str | None = None,
    top_k: int = 3,
    min_score: int = 1,
) -> list[dict]:
    """Return the most relevant passages with source metadata.

    Each result: {resource_id, title, course, semester, college, page, content}.
    Empty list means the available material does not match the query.
    """

    query_tokens = _tokenise(query)
    if not query_tokens:
        return []

    candidates: list[tuple[int, dict]] = []
    for resource in demo_resources():
        if resource_id and resource["id"] != resource_id:
            continue
        for passage in resource["passages"]:
            score = score_passage(query_tokens, passage["content"])
            if score >= min_score:
                candidates.append((score, {
                    "resource_id": resource["id"],
                    "title": resource["title"],
                    "course": resource["course"],
                    "semester": resource["semester"],
                    "college": resource["college"],
                    "page": passage["page"],
                    "content": passage["content"],
                }))

    candidates.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in candidates[:top_k]]


def resource_for_topic(topic: str | None, resource_id: str | None) -> dict | None:
    """Find the demo resource that best matches a topic or resource id."""

    if resource_id:
        return find_demo_resource(resource_id)
    if not topic:
        return None
    topic_tokens = _tokenise(topic)
    best, best_score = None, 0
    for resource in demo_resources():
        score = score_passage(topic_tokens, resource["title"] + " " + " ".join(resource["topics"]))
        if score > best_score:
            best, best_score = resource, score
    return best
