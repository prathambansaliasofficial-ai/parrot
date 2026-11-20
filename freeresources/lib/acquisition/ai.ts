import { z } from "zod";

/**
 * Provider-agnostic chat client (OpenAI-compatible wire format).
 *
 * Works with Google Gemini's OpenAI-compatible endpoint, OpenRouter, OpenAI and
 * any compatible gateway by changing AI_BASE_URL / AI_MODEL. Keys stay server-side.
 */

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export function aiConfig() {
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  return { baseUrl, apiKey, model, configured: Boolean(apiKey) };
}

export class AiNotConfigured extends Error {
  constructor() {
    super("No AI provider is configured. Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL).");
  }
}

type CompletionResult = { content: string; toolCalls: ToolCall[]; usage?: Record<string, number> };

async function request(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const config = aiConfig();
  if (!config.configured) throw new AiNotConfigured();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, ...body }),
    signal: signal ?? AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 500);
    throw new Error(`AI provider returned HTTP ${response.status}: ${text}`);
  }
  return response;
}

export async function completeChat(input: {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  json?: boolean;
}): Promise<CompletionResult> {
  const body: Record<string, unknown> = {
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
  };
  if (input.tools?.length) {
    body.tools = input.tools;
    body.tool_choice = "auto";
  }
  if (input.json) body.response_format = { type: "json_object" };

  const started = Date.now();
  const response = await request(body);
  const data = (await response.json()) as {
    choices?: {
      message?: { content?: string | null; tool_calls?: ToolCall[] };
    }[];
    usage?: Record<string, number>;
  };
  const message = data.choices?.[0]?.message;
  console.log(
    `[ai] model=${aiConfig().model} ms=${Date.now() - started} prompt=${data.usage?.prompt_tokens ?? "?"} completion=${data.usage?.completion_tokens ?? "?"}`,
  );
  return {
    content: message?.content ?? "",
    toolCalls: message?.tool_calls ?? [],
    usage: data.usage,
  };
}

/**
 * Structured-output schema for document classification. Every field is nullable:
 * a field the document does not state is reported as null rather than guessed.
 */
const NullableText = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  });

const NullableSemester = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
  });

export const DocumentClassificationSchema = z.object({
  title: NullableText,
  subject: NullableText,
  subjectCode: NullableText,
  programme: NullableText,
  branch: NullableText,
  semester: NullableSemester,
  kind: NullableText,
  academicYear: NullableText,
  confidence: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value) => {
      const parsed = value === null || value === undefined || value === "" ? Number.NaN : Number(value);
      if (!Number.isFinite(parsed)) return 0;
      const normalised = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
      return Math.max(0, Math.min(1, normalised));
    }),
  notes: NullableText,
});

export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;

export type StreamChunk = { type: "text"; text: string } | { type: "tools"; calls: ToolCall[] } | { type: "done"; content: string };

/** Streams assistant text; tool calls are emitted whole once the stream ends. */
export async function* streamChat(input: {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk> {
  const body: Record<string, unknown> = {
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
    stream: true,
  };
  if (input.tools?.length) {
    body.tools = input.tools;
    body.tool_choice = "auto";
  }

  const response = await request(body, input.signal);
  if (!response.body) throw new Error("The AI provider returned an empty stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: ToolCall[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let parsed: {
        choices?: {
          delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] };
        }[];
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.content) {
        content += delta.content;
        yield { type: "text", text: delta.content };
      }
      for (const call of delta?.tool_calls ?? []) {
        const index = call.index ?? toolCalls.length;
        const existing = toolCalls[index];
        if (!existing) {
          toolCalls[index] = {
            id: call.id ?? `call_${index}`,
            type: "function",
            function: { name: call.function?.name ?? "", arguments: call.function?.arguments ?? "" },
          };
        } else {
          if (call.function?.name) existing.function.name = call.function.name;
          if (call.function?.arguments) existing.function.arguments += call.function.arguments;
        }
      }
    }
  }

  const calls = toolCalls.filter(Boolean);
  if (calls.length) yield { type: "tools", calls };
  yield { type: "done", content };
}

/** Structured extraction used by the classification stage. Never invents values. */
export async function classifyDocument(input: {
  filename: string;
  url: string | null;
  text: string;
}): Promise<{
  title: string | null;
  subject: string | null;
  subjectCode: string | null;
  programme: string | null;
  branch: string | null;
  semester: number | null;
  kind: string | null;
  academicYear: string | null;
  confidence: number;
  notes: string;
}> {
  const result = await completeChat({
    json: true,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You extract academic metadata from Indian university syllabus documents. Return JSON only. " +
          "If a field is not explicitly present in the text, return null for it — never guess codes, credits, semesters or years. " +
          'Schema: {"title":string|null,"subject":string|null,"subjectCode":string|null,"programme":string|null,"branch":string|null,"semester":number|null,"kind":string|null,"academicYear":string|null,"confidence":number,"notes":string}',
      },
      {
        role: "user",
        content: `Filename: ${input.filename}\nSource: ${input.url ?? "unknown"}\n\nDocument text (truncated):\n${input.text.slice(0, 12000)}`,
      },
    ],
  });
  let json: unknown = null;
  try {
    json = JSON.parse(result.content);
  } catch {
    json = null;
  }

  const parsed = DocumentClassificationSchema.safeParse(json ?? {});
  if (!parsed.success || json === null) {
    const detail = parsed.success
      ? "not valid JSON"
      : parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("; ");
    console.warn(`[ai] classification rejected (${detail})`);
    return {
      title: null,
      subject: null,
      subjectCode: null,
      programme: null,
      branch: null,
      semester: null,
      kind: null,
      academicYear: null,
      confidence: 0,
      notes: `The AI response failed schema validation (${detail}); enter metadata manually.`,
    };
  }

  const value = parsed.data;
  return {
    ...value,
    notes: (value.notes ?? "").slice(0, 500),
  };
}
