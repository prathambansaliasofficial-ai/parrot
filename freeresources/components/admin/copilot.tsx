"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Send, Settings2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type PendingAction = { actionId: string; tool: string; input: Record<string, unknown> };

const SUGGESTIONS = [
  "What is our AKTU syllabus coverage right now?",
  "Find missing subjects in the AKTU CSE syllabus database.",
  "Show me documents that failed processing today.",
  "Which colleges follow the AKTU CSE curriculum?",
];

/** Floating operations copilot. Streams replies; mutations require confirmation. */
export default function AdminCopilot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/acquisition/copilot", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as {
        configured: boolean;
        model: string;
        conversationId: string | null;
        pendingActions: { id: string; tool: string; input: string }[];
        messages: { role: string; content: string }[];
      };
      setConfigured(data.configured);
      setModel(data.model);
      setConversationId(data.conversationId);
      setMessages(
        data.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
      );
      setPending(
        data.pendingActions.map((action) => ({
          actionId: action.id,
          tool: action.tool,
          input: JSON.parse(action.input || "{}") as Record<string, unknown>,
        })),
      );
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    if (open && configured === null) void load();
  }, [open, configured, load]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setError("");
    setBusy(true);
    setInput("");
    setMessages((current) => [...current, { role: "user", content: text }, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/admin/acquisition/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId, page: pathname }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "The copilot is unavailable.");
        setMessages((current) => current.slice(0, -1));
        return;
      }
      if (!response.body) throw new Error("No response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const lines = block.split("\n");
          const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!event || !data) continue;
          const parsed = JSON.parse(data) as Record<string, unknown>;

          if (event === "meta") setConversationId(String(parsed.conversationId));
          if (event === "text") {
            setMessages((current) => {
              const copy = [...current];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + String(parsed.text) };
              return copy;
            });
          }
          if (event === "action") {
            setPending((current) => [
              ...current,
              {
                actionId: String(parsed.actionId),
                tool: String(parsed.tool),
                input: (parsed.input as Record<string, unknown>) ?? {},
              },
            ]);
          }
          if (event === "error") setError(String(parsed.message));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The copilot request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction(action: PendingAction) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/acquisition/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.actionId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; data?: unknown };
      setPending((current) => current.filter((item) => item.actionId !== action.actionId));
      if (!response.ok || !data.ok) {
        setError(data.error ?? "The action failed.");
      } else {
        setMessages((current) => [
          ...current,
          { role: "assistant", content: `Confirmed and executed: ${action.tool}. Result: ${JSON.stringify(data.data)}` },
        ]);
      }
    } catch {
      setError("The action could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-paper shadow-lg transition hover:opacity-90"
        >
          <Bot size={16} /> Ops copilot
        </button>
      )}

      {open && (
        <aside className="fixed bottom-4 right-4 z-40 flex h-[min(34rem,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <header className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Bot size={15} className="text-primary" />
            <p className="text-xs font-semibold">Acquisition copilot</p>
            {model && <span className="truncate text-[0.62rem] text-muted">{model}</span>}
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-ink" aria-label="Close copilot">
              <X size={15} />
            </button>
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-xs">
            {configured === false && (
              <div className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[0.7rem]">
                <p className="flex items-center gap-1 font-medium">
                  <Settings2 size={12} /> AI provider not configured
                </p>
                <p className="mt-1 text-muted">
                  Set <code>AI_API_KEY</code> on the server (optionally <code>AI_BASE_URL</code> and <code>AI_MODEL</code>) to
                  enable the copilot. Inspection and control still work in the Acquisition pages.
                </p>
              </div>
            )}

            {messages.length === 0 && configured !== false && (
              <div className="space-y-1.5">
                <p className="text-muted">Ask about coverage, jobs, documents or institutions:</p>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="block w-full rounded-lg border border-line px-2.5 py-1.5 text-left text-[0.7rem] hover:border-primary/50 hover:bg-paper"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[90%] rounded-lg bg-mint px-2.5 py-1.5"
                    : "max-w-[95%] whitespace-pre-wrap rounded-lg bg-paper px-2.5 py-1.5"
                }
              >
                {message.content || (busy ? "…" : "")}
              </div>
            ))}

            {pending.map((action) => (
              <div key={action.actionId} className="rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-accent">Needs confirmation</p>
                <p className="mt-0.5 font-mono text-[0.68rem]">{action.tool}</p>
                <pre className="mt-1 max-h-24 overflow-auto rounded bg-paper/70 p-1.5 text-[0.62rem]">
                  {JSON.stringify(action.input, null, 2)}
                </pre>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmAction(action)}
                  className="btn btn-primary btn-sm mt-1.5"
                >
                  <Check size={12} /> Confirm and run
                </button>
              </div>
            ))}

            {error && <p className="rounded-lg border border-red-300/60 bg-red-50 px-2.5 py-1.5 text-[0.7rem] text-red-800">{error}</p>}
            {busy && <Loader2 size={13} className="animate-spin text-muted" />}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-1.5 border-t border-line p-2"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={configured === false ? "Configure AI_API_KEY first" : "Ask the copilot…"}
              className="input h-8 flex-1 text-xs"
              disabled={configured === false}
            />
            <button type="submit" disabled={busy || configured === false} className="btn btn-primary btn-sm" aria-label="Send">
              <Send size={13} />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
