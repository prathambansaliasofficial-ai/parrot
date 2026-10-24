"""LLM access via an OpenAI-compatible chat-completions endpoint.

The backend is wired to ASI:One / ASI:1 by default (ASI_ONE_BASE_URL /
ASI_ONE_API_KEY / ASI_ONE_MODEL env vars). If no API key is configured, or
the request fails or times out, the callers must fall back to clearly
labelled demo mode — mock responses are never presented as real LLM output.
"""

from __future__ import annotations

import json
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ChatRole = str
ChatMessage = dict[str, str]  # {"role": ChatRole, "content": str}

REQUEST_TIMEOUT_SECONDS = 25.0


def llm_available() -> bool:
    settings = get_settings()
    return bool(settings.asi_one_api_key)


def chat_completion(messages: list[ChatMessage], max_tokens: int = 700) -> str | None:
    """Call the configured OpenAI-compatible endpoint; None on any failure."""

    settings = get_settings()
    if not settings.asi_one_api_key:
        return None

    base_url = (settings.asi_one_base_url or "https://api.asi1.ai/v1").rstrip("/")
    url = f"{base_url}/chat/completions"
    payload = {
        "model": settings.asi_one_model or "asi1",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    headers = {
        "Authorization": f"Bearer {settings.asi_one_api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return content if isinstance(content, str) and content.strip() else None
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
        # Log the failure type only; never log request bodies or credentials.
        logger.warning("LLM completion failed (%s); caller should use demo mode", type(exc).__name__)
        return None


def extract_json_object(text: str) -> dict | None:
    """Best-effort extraction of the first JSON object from an LLM reply."""

    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None
