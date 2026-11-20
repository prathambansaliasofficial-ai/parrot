"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bird, Loader2, Send, X } from "lucide-react";

type Mode = "explain" | "quiz" | "plan";

type Question = {
  id: string;
  type: "multiple_choice" | "short_answer";
  stem: string;
  options: string[];
};

type PlanItem = { title: string; detail: string };

type Turn = {
  role: "parrot" | "student";
  text: string;
  demo?: boolean;
  question?: Question;
  plan?: PlanItem[];
};

type ApiReply = {
  text?: string;
  demo_mode?: boolean;
  question?: Question | null;
  plan?: { items?: PlanItem[] } | null;
  explanation?: string;
  correct?: boolean;
};

const QUICK_ACTIONS: { label: string; mode: Mode }[] = [
  { label: "Explain", mode: "explain" },
  { label: "Quiz me", mode: "quiz" },
  { label: "Revision plan", mode: "plan" },
];

function sessionId(): string {
  if (typeof window === "undefined") return "free-resources";
  const key = "fr-parrot-session";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = `fr-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, id);
  }
  return id;
}

export default function ParrotAI() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);
  const askedIds = useRef<string[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<{ topic?: string }>).detail;
      if (detail?.topic) setTopic(detail.topic);
      setOpen(true);
    }
    window.addEventListener("parrot:open", handleOpen);
    return () => window.removeEventListener("parrot:open", handleOpen);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const ask = useCallback(
    async (message: string, mode: Mode) => {
      if (!message.trim() || busy) return;
      setBusy(true);
      setError("");
      setPendingQuestion(null);
      setTurns((current) => [...current, { role: "student", text: message }]);

      try {
        const response = await fetch("/api/parrot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "message",
            payload: {
              session_id: sessionId(),
              message,
              mode,
              focus_topic: topic || null,
              resource_id: null,
              asked_question_ids: askedIds.current,
            },
          }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiReply & { error?: string };
        if (!response.ok) throw new Error(data.error || `Tutor responded ${response.status}`);

        setTurns((current) => [
          ...current,
          {
            role: "parrot",
            text: data.text || "I could not find an answer for that.",
            demo: data.demo_mode === true,
            question: data.question ?? undefined,
            plan: data.plan?.items ?? undefined,
          },
        ]);
        setPendingQuestion(data.question ?? null);
        if (data.question) askedIds.current = [...askedIds.current, data.question.id];
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Parrot AI is unavailable.");
      } finally {
        setBusy(false);
      }
    },
    [busy, topic],
  );

  const answer = useCallback(
    async (question: Question, value: string, display = value) => {
      if (!value.trim() || busy) return;
      setBusy(true);
      setError("");
      setTurns((current) => [...current, { role: "student", text: display }]);
      setPendingQuestion(null);
      askedIds.current = [...askedIds.current, question.id];

      try {
        const response = await fetch("/api/parrot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "answer",
            payload: { question_id: question.id, answer: value },
          }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiReply & { error?: string };
        if (!response.ok) throw new Error(data.error || `Tutor responded ${response.status}`);
        setTurns((current) => [
          ...current,
          {
            role: "parrot",
            text: `${data.correct ? "Correct. " : "Not quite. "}${data.explanation ?? ""}`.trim(),
            demo: true,
          },
        ]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Parrot AI is unavailable.");
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput("");
    if (pendingQuestion) void answer(pendingQuestion, value);
    else void ask(value, "explain");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="parrot-panel"
        aria-label={open ? "Close Parrot AI" : "Open Parrot AI study helper"}
        className="fixed bottom-5 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-on-primary shadow-lg transition hover:bg-primary-hover"
      >
        {open ? <X size={17} /> : <Bird size={17} />}
        <span>Parrot AI</span>
      </button>

      {open && (
        <section
          id="parrot-panel"
          role="dialog"
          aria-label="Parrot AI study helper"
          className="fixed bottom-20 right-4 z-50 flex max-h-[min(34rem,calc(100vh-7rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint text-primary">
                <Bird size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold">Parrot AI</p>
                <p className="max-w-[14rem] truncate text-[0.68rem] text-muted">
                  {topic ? `Studying: ${topic}` : "General study help"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Parrot AI"
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
            {QUICK_ACTIONS.map((action) => {
              const subject = topic || "data structures";
              const message =
                action.mode === "explain"
                  ? `Explain ${subject}`
                  : action.mode === "quiz"
                    ? `Quiz me on ${subject}`
                    : `Create a revision plan for ${subject}`;
              return (
                <button
                  key={action.mode}
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(message, action.mode)}
                  className="chip shrink-0 hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  {action.label}
                </button>
              );
            })}
          </div>

          <div ref={historyRef} className="min-h-32 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turns.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-sm font-medium">Ready to study?</p>
                <p className="mx-auto mt-1 max-w-[17rem] text-xs leading-relaxed text-muted">
                  Ask a question, get a quiz, or make a quick revision plan.
                </p>
              </div>
            )}

            {turns.map((turn, index) => (
              <div key={index} className={turn.role === "student" ? "flex justify-end" : ""}>
                <div
                  className={
                    turn.role === "student"
                      ? "max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-xs text-on-primary"
                      : "max-w-[92%] text-xs leading-relaxed"
                  }
                >
                  <p className="whitespace-pre-line">{turn.text}</p>

                  {turn.demo && (
                    <p className="mt-1.5 text-[0.6rem] uppercase tracking-wide text-muted">Demo mode</p>
                  )}

                  {turn.plan && turn.plan.length > 0 && (
                    <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
                      {turn.plan.map((item) => (
                        <li key={item.title}>
                          <span className="font-medium">{item.title}</span>
                          <span className="text-muted"> — {item.detail}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {turn.question && turn.question === pendingQuestion && (
                    <div className="mt-2 space-y-1.5">
                      {turn.question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={busy}
                          onClick={() => void answer(turn.question!, String(turn.question!.options.indexOf(option)), option)}
                          className="block w-full rounded-lg border border-line bg-paper px-2.5 py-2 text-left text-xs transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
                        >
                          {option}
                        </button>
                      ))}
                      {turn.question.type === "short_answer" && (
                        <p className="text-[0.66rem] text-muted">Type your answer below and send.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" /> Parrot is thinking…
              </p>
            )}
            {error && <p className="rounded-lg bg-danger/10 px-2.5 py-2 text-[0.7rem] text-danger">{error}</p>}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={pendingQuestion ? "Type your answer…" : "Ask a study question…"}
              aria-label="Message Parrot AI"
              maxLength={2000}
              className="input h-9 flex-1 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
