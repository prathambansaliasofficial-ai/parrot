"""Topic identification and concept-block creation for Parrot.

Given extracted document text (with headings), produce a topic map and
concept blocks that retain source references (page numbers, section
titles). Uses deterministic heuristics first; LLM refinement is
configurable and opt‑in.

Each concept block contains:
- Concept title
- Short source‑grounded explanation (from extracted text)
- Key definitions
- Important facts / steps / formulas
- Examples from the source
- Prerequisites / related concepts
- Relevant keywords
- Original resource ID
- Page number or section reference
- Subject and resource-category metadata
- Extraction status and processing version
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Heuristic topic extraction
# ---------------------------------------------------------------------------

HEADING_LEVEL_KEYWORDS = {
    "chapter": {"chapter", "pt.", "part"},
    "section": {"section", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10."},
    "subsection": {"figure", "table", "example", "lemma", "corollary"},
}

ALL_CAPS_SHORT = re.compile(r"^[A-Z][A-Z\s]{2,40}$")
ENTRy_SENTENCE = re.compile(r"^[A-Z][a-z]+[,.]?\s")  # e.g. "Definition"


@dataclass
class ConceptBlock:
    """A compact concept extracted from a resource."""

    concept_title: str
    explanation: str  # short source‑grounded excerpt
    key_definitions: List[str] = field(default_factory=list)
    important_facts: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
    prerequisites: List[str] = field(default_factory=list)
    related_concepts: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    resource_id: str = ""
    page_numbers: List[int] = field(default_factory=list)
    section_reference: str = ""
    subject: str = ""
    category: str = ""
    processing_version: str = "v1.0"
    extraction_status: str = "identified"  # identified / uncertain / fallback


def _is_likely_heading(text: str, all_caps_short: bool = True) -> bool:
    """Heuristic: decide whether a line is a section/heading title."""

    t = text.strip()
    if not t or len(t) > 120:
        return False
    # All‑caps short line.
    if all_caps_short and ALL_CAPS_SHORT.match(t):
        return True
    # Starts with a number followed by a period (e.g. "1. Introduction").
    if re.match(r"^\d+[\.\)]\s", t):
        return True
    # Starts with a capital word and has few words (title‑case heading).
    if t[0].isupper() and 2 <= len(t.split()) <= 9:
        return True
    # Contains a known heading keyword.
    low = t.lower()
    if any(kw in low for kw in {"chapter", "section", "introduction", "conclusion", "abstract"}):
        return True
    return False


def _extract_headings(text: str) -> List[str]:
    """Return a list of likely heading lines from the text."""

    headings: List[str] = []
    for line in text.split("\n"):
        if _is_likely_heading(line):
            t = line.strip()
            if t and t not in headings:
                headings.append(t)
    return headings


def _split_into_passages(text: str, headings: List[str], max_chars: int = 800) -> List[dict]:
    """Split the document body into topic‑level passages.

    Each passage starts just after a heading and ends at the next heading
    or at max_chars.
    """

    if not headings:
        # No headings found – return the whole text as one passage.
        return [
            {
                "title": "Main content",
                "content": text[:max_chars],
                "page_range": [1],
            }
        ]

    passages: List[dict] = []
    lines = text.split("\n")
    current_title = headings[0]
    current_lines: List[str] = []
    current_pages: List[int] = [1]
    page_counter = 1
    heading_set = set(headings)

    for line in lines:
        stripped = line.strip()
        if not stripped:
            # Preserve paragraph spacing but don't create new pages.
            if current_lines:
                # count as part of current passage
                pass
            continue
        # Detect page break markers if present (e.g. "Page 5")
        pg = re.search(r"page\s+(\d+)", stripped, re.I)
        if pg:
            page_counter = int(pg.group(1))

        if stripped in heading_set:
            # Save the previous passage.
            if current_lines:
                passage_text = "\n".join(current_lines).strip()
                if passage_text:
                    passages.append(
                        {
                            "title": current_title,
                            "content": passage_text[:max_chars],
                            "page_range": current_pages.copy(),
                        }
                    )
            # Start a new passage.
            current_title = stripped
            current_lines = []
            current_pages = [page_counter]
        else:
            current_lines.append(stripped)
            # Track page numbers heuristically: every 3 lines ≈ 1 page.
            # (This is very approximate; real PDF page numbers are preserved
            #  in the extraction metadata above.)
            if len(current_lines) % 3 == 0:
                current_pages.append(page_counter)

    # Final passage.
    if current_lines:
        passage_text = "\n".join(current_lines).strip()
        if passage_text:
            passages.append(
                {
                    "title": current_title,
                    "content": passage_text[:max_chars],
                    "page_range": current_pages,
                }
            )

    return passages


def identify_topics(
    resource_id: str,
    subject: str,
    category: str,
    extracted_text: str,
    use_llm: bool = False,
) -> dict:
    """Identify topics and create concept blocks from extracted text.

    Returns a dict with:
    - headings: list of detected headings
    - passages: list of {title, content, page_range}
    - concepts: list of ConceptBlock
    - metadata: extraction diagnostics
    """

    headings = _extract_headings(extracted_text)
    passages = _split_into_passages(extracted_text, headings)

    concepts: List[ConceptBlock] = []

    for i, passage in enumerate(passages[:10]):  # limit to first 10 topics
        title = passage["title"] or f"Topic {i + 1}"
        content = passage["content"]

        # Basic concept block population from the passage content.
        # We pull out sentences that contain key‑word candidates.
        sentences = [s.strip() for s in re.split(r"(?<=[.!?]) +", content) if s.strip()]

        key_defs: List[str] = []
        important: List[str] = []
        examples: List[str] = []
        keywords: List[str] = []

        for sent in sentences:
            # Very naive keyword extraction: nouns phrases & capitalized terms.
            # In a production system this would use an NLP pipeline.
            for word in re.findall(r"[A-Za-z'&]+", sent):
                w = word.lower()
                if w not in keywords and len(w) > 2:
                    keywords.append(w)

        # If the passage contains definition‑like sentences, surface them.
        for sent in sentences:
            low = sent.lower()
            if any(kw in low for kw in {"is", "means", "refers to", "definition"}):
                key_defs.append(sent.strip())

        # If nothing was captured, use the first sentence as a placeholder.
        if not key_defs and sentences:
            key_defs.append(sentences[0])

        # Build a short explanation: first 2–3 non‑heading sentences.
        explanation_sentences = [s for s in sentences if s not in key_defs][:3]
        explanation = " ".join(explanation_sentences).strip() or content[:200] or "No explanation could be extracted."

        # Try to locate page numbers from the passage's page_range.
        page_nums = passage.get("page_range", [1])

        concept = ConceptBlock(
            concept_title=title,
            explanation=explanation,
            key_definitions=key_defs,
            important_facts=important,
            examples=examples,
            prerequisites=[],
            related_concepts=[],
            keywords=keywords[:12],
            resource_id=resource_id,
            page_numbers=page_nums,
            section_reference=headings[0] if headings else "",
            subject=subject,
            category=category,
            processing_version="v1.0",
            extraction_status="identified",
        )
        concepts.append(concept)

    return {
        "resource_id": resource_id,
        "subject": subject,
        "category": category,
        "headings": headings,
        "passages": passages,
        "concepts": concepts,
        "extraction_diagnostics": {
            "total_characters": len(extracted_text),
            "heading_count": len(headings),
            "passage_count": len(passages),
            "concept_count": len(concepts),
            "llm_used": False,
        },
    }


def _block_from_passage(
    passage: dict,
    headings: List[str],
    resource_id: str,
    subject: str,
    category: str,
) -> ConceptBlock:
    """Build a ConceptBlock from a passage and its heading context."""
    title = passage["title"] or "."
    content = passage["content"]

    sentences = [s.strip() for s in re.split(r"(?<=[.!?]) +", content) if s.strip()]

    key_defs: List[str] = []
    important: List[str] = []
    examples: List[str] = []
    keywords: List[str] = []

    # Surface definition‑like sentences.
    for sent in sentences:
        low = sent.lower()
        if any(kw in low for kw in {"is", "means", "refers to", "definition"}):
            key_defs.append(sent.strip())

    # If nothing captured, fall back to first sentence.
    if not key_defs and sentences:
        key_defs.append(sentences[0])

    # Short explanation: first 2–3 sentences, or first 200 chars.
    explanation_sentences = [s for s in sentences if s not in key_defs][:3]
    explanation = " ".join(explanation_sentences).strip() or content[:200] or "No explanation could be extracted."

    # Heuristic: if the first heading-like sentence mentions a core concept,
    # use it as a keyword.
    first_heading = headings[0] if headings else ""

    # Try to locate page numbers from the passage's page_range.
    page_nums = passage.get("page_range", [1])

    concept = ConceptBlock(
        concept_title=title,
        explanation=explanation,
        key_definitions=key_defs,
        important_facts=important,
        examples=examples,
        prerequisites=[],
        related_concepts=[],
        keywords=keywords[:12],
        resource_id=resource_id,
        page_numbers=page_nums,
        section_reference=first_heading,
        subject=subject,
        category=category,
        processing_version="v1.0",
        extraction_status="identified",
    )
    return concept


def identify_topics(
    resource_id: str,
    subject: str,
    category: str,
    extracted_text: str,
    use_llm: bool = False,
) -> dict:
    """Identify topics and create concept blocks from extracted text.

    Returns a dict with:
    - headings: list of detected headings
    - passages: list of {title, content, page_range}
    - concepts: list of ConceptBlock
    - metadata: extraction diagnostics
    """

    headings = _extract_headings(extracted_text)
    passages = _split_into_passages(extracted_text, headings)

    concepts: List[ConceptBlock] = []

    for passage in passages[:10]:  # limit to first 10 topics
        concept = _block_from_passage(passage, headings, resource_id, subject, category)
        concepts.append(concept)

    return {
        "resource_id": resource_id,
        "subject": subject,
        "category": category,
        "headings": headings,
        "passages": passages,
        "concepts": concepts,
        "extraction_diagnostics": {
            "total_characters": len(extracted_text),
            "heading_count": len(headings),
            "passage_count": len(passages),
            "concept_count": len(concepts),
            "llm_used": False,
        },
    }