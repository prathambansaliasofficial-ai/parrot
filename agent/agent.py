"""Parrot Fetch.ai uAgent — chat-protocol gateway to the tutoring API.

The agent does not reimplement tutoring. It routes ASI:One / Agent Chat
Protocol messages to the FastAPI tutoring endpoints (the same services the
website uses), so retrieval, evaluation and progress live in one place.

Deterministic demo mode is labelled in replies whenever the backend reports
it, so mock output is never presented as real model output.

Run (after `pip install -r requirements.txt`, with a private UAGENT_SEED in
agent/.env):

    python agent.py

Agentverse registration and ASI:One access additionally require
AGENTVERSE_API_KEY; see DEVELOPMENT.md for the exact remaining steps.
"""

from __future__ import annotations

import os

import httpx
from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

API_BASE_URL = os.getenv("PARROT_API_BASE_URL", "http://localhost:8000").rstrip("/")
REQUEST_TIMEOUT = 30.0

RESOURCE_ALIASES = {
    "faraday": "demo-faraday-notes",
    "induction": "demo-faraday-notes",
    "physics": "demo-faraday-notes",
    "python": "demo-python-notes",
    "list": "demo-python-notes",
    "loop": "demo-python-notes",
    "programming": "demo-python-notes",
    "code": "demo-python-notes",
}


def _guess_resource(text: str) -> str | None:
    lowered = text.lower()
    for token, resource_id in RESOURCE_ALIASES.items():
        if token in lowered:
            return resource_id
    return None


def _post(path: str, payload: dict) -> dict:
    response = httpx.post(f"{API_BASE_URL}{path}", json=payload, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def _tutor_reply(session_id: str, text: str, asked: list[str]) -> str:
    """Route a plain-language chat message to the matching tutoring capability."""

    lowered = text.lower()
    resource_id = _guess_resource(text)
    body: dict = {"session_id": session_id, "message": text}
    if resource_id:
        body["resource_id"] = resource_id

    try:
        if any(k in lowered for k in ("quiz", "test me", "question me")):
            body["mode"] = "quiz"
            body["asked_question_ids"] = asked
            data = _post("/api/v1/tutor/message", body)
            question = data.get("question")
            if question:
                asked.append(question["id"])
                options = "\n".join(
                    f"  {chr(65 + i)}) {opt}" for i, opt in enumerate(question.get("options", []))
                    if opt
                )
                text_out = f"{data['text']}\n\n{question['stem']}"
                if options:
                    text_out += f"\n{options}\n\nReply with the option letter or your answer."
                if data.get("sources"):
                    title = data["sources"][0]["title"]
                    text_out += f"\n\n(from: {title})"
                return text_out
            return data.get("text", "I couldn't build a question from the current material.")

        if "explain back" in lowered or "teach back" in lowered or ("explain" in lowered and "my own words" in lowered):
            # Teach-back: student explanation is evaluated against the rubric.
            topic = body.get("focus_topic") or _guess_resource(text) or "Faraday's law"
            data = _post(
                "/api/v1/tutor/evaluate",
                {
                    "session_id": session_id,
                    "topic": "Python lists and loops" if resource_id == "demo-python-notes" else "Faraday's law",
                    "resource_id": resource_id,
                    "explanation": text,
                },
            )
            feedback = data["feedback"]
            lines = [
                f"Assessment: {feedback['overall_assessment']}",
                "Correct: " + ("; ".join(feedback["correct_points"]) or "—"),
                "Missing: " + ("; ".join(feedback["missing_points"]) or "—"),
            ]
            if feedback["misconceptions"]:
                lines.append("Misconceptions: " + "; ".join(feedback["misconceptions"]))
            lines.append(feedback["feedback"])
            lines.append(f"Next: {feedback['next_question']}")
            if data.get("demo_mode"):
                lines.insert(0, "[Parrot demo mode — deterministic evaluation, no LLM key configured]")
            return "\n\n".join(lines)

        if "revision plan" in lowered or "plan my" in lowered or "study plan" in lowered:
            data = _post(
                "/api/v1/tutor/message",
                {**body, "mode": "plan"},
            )
            items = data.get("plan", {}).get("items", [])
            lines = [data.get("text", "Revision plan:")]
            for item in items:
                lines.append(f"• {item['title']} — {item['detail']}")
            if data.get("demo_mode"):
                lines.insert(0, "[Parrot demo mode — no recorded LLM/progress backend configured]")
            return "\n".join(lines)

        # Default: explanation grounded in the resource material.
        data = _post("/api/v1/tutor/message", {**body, "mode": "explain"})
        text_out = data.get("text", "I could not retrieve material for that.")
        if data.get("demo_mode"):
            text_out = "[Parrot demo mode — deterministic retrieval, no LLM key configured]\n\n" + text_out
        return text_out
    except httpx.HTTPError as exc:
        return (
            f"I could not reach the tutoring API at {API_BASE_URL} "
            f"({type(exc).__name__}). Make sure the FastAPI backend is running. "
            "Nothing was invented in place of a real answer."
        )


def build_agent(seed: str) -> Agent:
    agent = Agent(
        name="parrot-study-agent",
        seed=seed,
        port=8001,
        endpoint=["http://127.0.0.1:8001/submit"],
    )
    chat_protocol = Protocol(spec=chat_protocol_spec)
    asked_questions: list[str] = []

    @chat_protocol.on_message(ChatMessage)
    async def handle_chat(ctx: Context, sender: str, message: ChatMessage) -> None:
        await ctx.send(
            sender,
            ChatMessage(content=[TextContent(type="text", text=_ack_text(message))]),
        )
        for content in message.content:
            if isinstance(content, TextContent) and content.text:
                reply = _tutor_reply(f"agent-{sender[:12]}", content.text, asked_questions)
                await ctx.send(sender, ChatMessage(content=[TextContent(type="text", text=reply)]))

    @chat_protocol.on_message(ChatAcknowledgement)
    async def handle_ack(ctx: Context, sender: str, message: ChatAcknowledgement) -> None:
        ctx.logger.info("Received chat acknowledgement from %s", sender)

    agent.include(chat_protocol, publish_manifest=True)
    return agent


def _ack_text(message: ChatMessage) -> str:
    return (
        "Parrot's Fetch.ai agent is connected and will answer through the "
        "tutoring API. Try: 'Quiz me on Faraday's law', 'Explain magnetic "
        "flux', or explain a concept back."
    )


if __name__ == "__main__":
    seed = os.getenv("UAGENT_SEED")
    if not seed or seed.startswith("replace-"):
        raise SystemExit("Set a private UAGENT_SEED in agent/.env before starting.")
    build_agent(seed).run()
