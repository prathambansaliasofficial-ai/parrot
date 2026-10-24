"""Local Fetch.ai uAgent chat scaffold.

This starter replies with a setup message. Resource-grounded tutoring and ASI:1
calls will be added after the API and demo-resource flow are connected.
"""

import os

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()


def build_agent(seed: str) -> Agent:
    agent = Agent(
        name="parrot-study-agent",
        seed=seed,
        port=8001,
        endpoint=["http://127.0.0.1:8001/submit"],
    )
    chat_protocol = Protocol(spec=chat_protocol_spec)

    @chat_protocol.on_message(ChatMessage)
    async def handle_chat(ctx: Context, sender: str, message: ChatMessage) -> None:
        await ctx.send(
            sender,
            ChatMessage(
                content=[
                    TextContent(
                        type="text",
                        text=(
                            "Parrot's Fetch.ai agent is connected. "
                            "Course-resource retrieval and ASI:1 tutoring are the next step."
                        ),
                    )
                ]
            ),
        )

    @chat_protocol.on_message(ChatAcknowledgement)
    async def handle_ack(
        ctx: Context, sender: str, message: ChatAcknowledgement
    ) -> None:
        ctx.logger.info("Received chat acknowledgement from %s", sender)

    agent.include(chat_protocol, publish_manifest=True)
    return agent


if __name__ == "__main__":
    seed = os.getenv("UAGENT_SEED")
    if not seed or seed.startswith("replace-"):
        raise SystemExit("Set a private UAGENT_SEED in agent/.env before starting.")
    build_agent(seed).run()
