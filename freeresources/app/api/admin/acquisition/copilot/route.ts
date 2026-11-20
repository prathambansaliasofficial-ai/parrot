import { all, one } from "@/lib/db";
import { fail, guardOrigin, requireAdminApi } from "@/lib/http";
import { aiConfig, streamChat, type ChatMessage, type ToolCall } from "@/lib/acquisition/ai";
import {
  COPILOT_TOOLS,
  conversationMessages,
  ensureConversation,
  executeConfirmedAction,
  isMutatingTool,
  proposeAction,
  runReadTool,
  saveMessage,
  systemPrompt,
} from "@/lib/acquisition/copilot";
import { getAcquisitionStats } from "@/lib/acquisition/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  let body: {
    message?: unknown;
    conversationId?: unknown;
    page?: unknown;
    actionId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON request body.", 400);
  }

  // Confirmation of a previously proposed mutation.
  if (typeof body.actionId === "string" && body.actionId) {
    const result = await executeConfirmedAction(body.actionId, userId);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return fail("Ask the copilot something first.", 422);
  if (message.length > 4000) return fail("Keep instructions under 4,000 characters.", 413);

  const config = aiConfig();
  if (!config.configured) {
    return fail(
      "No AI provider is configured. Set AI_API_KEY (optionally AI_BASE_URL and AI_MODEL) on the server to enable the copilot.",
      501,
    );
  }
  if (typeof body.actionId === "string") return fail("Confirmation could not be read.", 400);

  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;
  const conversationId = ensureConversation(
    typeof body.conversationId === "string" ? body.conversationId : null,
    userId,
    page,
  );
  saveMessage(conversationId, "user", message);

  const history = conversationMessages(conversationId);
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(page) }, ...history];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("meta", { conversationId, model: config.model });
        let assistantText = "";

        for (let round = 0; round < 3; round += 1) {
          let roundText = "";
          let calls: ToolCall[] = [];

          for await (const chunk of streamChat({ messages, tools: COPILOT_TOOLS })) {
            if (chunk.type === "text") {
              roundText += chunk.text;
              assistantText += chunk.text;
              send("text", { text: chunk.text });
            } else if (chunk.type === "tools") {
              calls = chunk.calls;
            }
          }

          if (!calls.length) break;

          messages.push({ role: "assistant", content: roundText || null, tool_calls: calls });

          let askedForConfirmation = false;
          for (const call of calls) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              input = {};
            }

            if (isMutatingTool(call.function.name)) {
              const actionId = proposeAction(conversationId, call.function.name, input, userId);
              askedForConfirmation = true;
              send("action", { actionId, tool: call.function.name, input });
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({ status: "proposed", actionId, note: "Waiting for administrator confirmation." }),
              });
              continue;
            }

            const result = await runReadTool(call.function.name, input);
            send("tool", { tool: call.function.name, ok: result.ok });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(result).slice(0, 12000),
            });
          }

          if (askedForConfirmation) break;
        }

        if (assistantText.trim()) saveMessage(conversationId, "assistant", assistantText);
        else saveMessage(conversationId, "assistant", "(No text returned; see the proposed action.)");

        send("done", { conversationId });
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "The copilot failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const conversations = all(
    `SELECT id, title, context_page AS page, updated_at AS updatedAt
       FROM copilot_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10`,
    [auth.user.id],
  );
  const pending = all(
    `SELECT id, tool, input, status, created_at AS createdAt FROM copilot_actions
      WHERE proposed_by = ? AND status = 'proposed' ORDER BY created_at DESC LIMIT 10`,
    [auth.user.id],
  );
  const latest = one<{ id: string }>(
    "SELECT id FROM copilot_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
    [auth.user.id],
  );
  const messages = latest
    ? all(
        `SELECT role, content, created_at AS createdAt FROM copilot_messages
          WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 50`,
        [latest.id],
      )
    : [];

  return Response.json(
    { configured: aiConfig().configured, model: aiConfig().model, conversations, pendingActions: pending, conversationId: latest?.id ?? null, messages, stats: getAcquisitionStats() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
