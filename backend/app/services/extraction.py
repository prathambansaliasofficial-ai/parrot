"""Text extraction from uploaded documents for Parrot.

Extracts paragraphs and headings from PDF, TXT, and DOCX files.
Detects scanned PDFs (no selectable text) and reports the need for OCR.
Preserves page numbers and section headings where possible.
"""

from __future__ import annotations

import re
from typing import List, Tuple

import fitz  # PyMuPDF
import docx

# ---------------------------------------------------------------------------
# Extraction orchestration
# ---------------------------------------------------------------------------

def extract_text(resource_id: str, file_path: str, ext: str, max_chars: int = 2_000_000) -> Tuple[str, dict]:
    """Extract plain‑text from a document.

    Returns (full_text, metadata).
    metadata contains: pages, section_headings, scanned, extraction_errors.
    """

    if ext == "pdf":
        text, meta = _extract_pdf(file_path, max_chars)
    elif ext == "txt":
        text, meta = _extract_txt(file_path)
    elif ext == "docx":
        text, meta = _extract_docx(file_path)
    else:
        raise ValueError(f"Unsupported extension: {ext}")

    # Post‑process: collapse excessive whitespace, preserve headings.
    text = _normalize_whitespace(text)
    return text, meta


def _extract_pdf(file_path: str, max_chars: int) -> Tuple[str, dict]:
    """Extract text from a PDF file.

    Returns (full_text, {pages: int, section_headings: list[str], scanned: bool, errors: list[str]}).
    """

    heading_keywords = {
        "chapter", "section", "appendix", "introduction", "conclusion",
        "abstract", "contents", "reference", "bibliography",
    }

    full_parts: list[str] = []
    section_headings: list[str] = []
    scanned = False
    errors: list[str] = []

    try:
        doc = fitz.open(file_path)
        page_count = len(doc)
    except Exception as exc:
        errors.append(f"Could not open PDF: {exc}")
        return "", {"pages": 0, "section_headings": [], "scanned": False, "errors": errors}

    for i in range(page_count):
        page = doc[i]
        # Try getting text as‑is; if empty, treat as scanned.
        text = page.get_text("text") or ""
        if not text.strip():
            scanned = True
        else:
            # Collect page‑level headings: look for lines that look like
            # title/caption lines (all‑caps or sentence‑case short lines).
            for line in text.split("\n"):
                stripped = line.strip()
                if not stripped:
                    continue
                # Heuristic: short line (≤ 120 chars) with no surrounding
                # whitespace‑heavy paragraph pattern.
                if len(stripped) <= 120 and not re.match(r"^\s*\d+[\s/].*$", stripped):
                    # Normal sentence‑case or title‑case short line → candidate heading
                    low = stripped.lower()
                    if any(kw in low for kw in heading_keywords) or (stripped[0].isupper() and len(stripped.split()) <= 8):
                        if stripped not in section_headings:
                            section_headings.append(stripped)
            full_parts.append(text)

        doc.close()
        full_text = "\n".join(full_parts)
        # Truncate if overly large (LLM context guard).
        if len(full_text) > max_chars:
            full_text = full_text[:max_chars] + "\n\n…[truncated]…"
            errors.append(f"Document truncated at {max_chars} chars.")

        return full_text, {
            "pages": page_count,
            "section_headings": section_headings,
            "scanned": scanned,
            "errors": errors,
        }


def _extract_txt(file_path: str) -> Tuple[str, dict]:
    """Extract text from a plain‑text file.

    Uses conservative heading heuristics so that ordinary course-note files
    are not split into spurious sections.
    """

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            raw = f.read()
    except Exception as exc:
        return "", {"pages": 0, "section_headings": [], "scanned": False, "errors": [f"Could not read TXT: {exc}"]}

    heading_keywords = {"introduction", "chapter", "section", "conclusion", "abstract"}
    headings: list[str] = []
    body_parts: list[str] = []
    lines = raw.split("\n")
    in_body = False  # becomes True after we see the first non‑heading line

    for line in lines:
        stripped = line.strip()
        if not stripped:
            in_body = False  # blank line resets the state
            body_parts.append("")
            continue
        low = stripped.lower()

        is_heading = False
        # 1. All‑caps lines short enough are headings.
        if stripped.isupper() and len(stripped) <= 120:
            is_heading = True
        # 2. Starts with a number followed by a period (e.g. "1. Intro").
        if not is_heading and re.match(r"^\d+[\.\)]\s", stripped):
            is_heading = True
        # 3. Known heading keyword — only if very short (<= 6 words) and we are
        #    still in heading‑finding mode (in_body is False).
        if not is_heading and any(kw in low for kw in heading_keywords) \
                and len(stripped.split()) <= 6 \
                and not in_body:
            is_heading = True

        if is_heading:
            if stripped not in headings:
                headings.append(stripped)
            in_body = False  # heading resets the body‑finding state
        else:
            in_body = True  # once we're in body, stay in body
            body_parts.append(stripped)

    full_text = "\n".join(body_parts)
    return full_text, {
        "pages": 1,
        "section_headings": headings,
        "scanned": False,
        "errors": [],
    }


def _extract_docx(file_path: str) -> Tuple[str, dict]:
    """Extract text from a DOCX file (ZIP‑based, using python-docx)."""

    try:
        doc = docx.Document(file_path)
    except Exception as exc:
        return "", {"pages": 1, "section_headings": [], "scanned": False, "errors": [f"Could not open DOCX: {exc}"], }

    full_parts: list[str] = []
    section_headings: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        # Heading heuristic: paragraph style is a heading style, or all‑caps short line,
        # or first word capitalized with <= 8 words and not all‑caps.
        is_heading = (
            para.style.name and "heading" in para.style.name.lower()
            or (text.isupper() and len(text) <= 120)
            or (text and text[0].isupper() and len(text.split()) <= 8 and not text.isupper())
        )
        if is_heading:
            if text not in section_headings:
                section_headings.append(text)
        else:
            full_parts.append(text)

    full_text = "\n".join(full_parts)
    return full_text, {
        "pages": 1,
        "section_headings": section_headings,
        "scanned": False,
        "errors": [],
    }


# ---------------------------------------------------------------------------
# Normalization (post‑extraction)
# ---------------------------------------------------------------------------

def _normalize_whitespace(text: str) -> str:
    """Collapse repetitive whitespace while preserving meaningful line breaks."""

    # Replace runs of whitespace (including tabs) with a single space,
    # but keep paragraph breaks (double newlines).
    text = re.sub(r"[ \t]+", " ", text)
    # Ensure single newlines become spaces; double newlines stay as paragraph breaks.
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Trim leading/trailing whitespace on each paragraph.
    paragraphs = text.split("\n\n")
    cleaned = "\n\n".join(p.strip() for p in paragraphs)
    return cleaned