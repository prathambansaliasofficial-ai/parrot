"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParrot } from "./ParrotContext";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SourceRef {
  resource_id: string;
  title: string;
  page: number | null;
  snippet: string;
}

interface Question {
  id: string;
  type: "multiple_choice" | "short_answer";
  stem: string;
  options: string[];
  difficulty: number;
}

interface Feedback {
  overall_assessment: "correct" | "partially_correct" | "incorrect" | "unclear";
  correct_points: string[];
  missing_points: string[];
  misconceptions: string[];
  feedback: string;
  next_question: string;
}

interface PlanItem {
  title: string;
  detail: string;
}

interface Turn {
  role: "parrot" | "student";
  text: string;
  sources?: SourceRef[];
  question?: Question;
  answeredCorrect?: boolean;
  feedback?: Feedback;
  plan?: PlanItem[];
  demoMode?: boolean;
}

type Mode = "explain" | "quiz" | "teach_back" | "plan";

const QUICK_ACTIONS: { mode: Mode; label: string }[] = [
  { mode: "explain", label: "Explain this topic" },
  { mode: "quiz", label: "Quiz me" },
  { mode: "teach_back", label: "Test my understanding" },
  { mode: "plan", label: "Create a revision plan" },
];

const ASSESSMENT_LABELS: Record<Feedback["overall_assessment"], string> = {
  correct: "✓ Correct",
  partially_correct: "◐ Partially correct",
  incorrect: "✗ Not yet correct",
  unclear: "? Too short to assess",
};

function sessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "parrot-session-id";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = `web-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, id);
  }
  return id;
}

export default function ParrotWidget() {
  const { resource, isOpen, openWith, close } = useParrot();
  const open = isOpen;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askedIds = useRef<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(
    async (text: string, mode: Mode, echoStudent = true) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setError(null);
      setBusy(true);
      if (echoStudent) {
        setTurns((prev) => [...prev, { role: "student", text: trimmed }]);
      }
      try {
        const response = await fetch(`${API_BASE}/api/v1/tutor/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId(),
            message: trimmed,
            mode,
            resource_id: resource?.resourceId ?? null,
            focus_topic: resource?.focusTopic ?? resource?.subject ?? null,
            asked_question_ids: askedIds.current,
          }),
        });
        if (!response.ok) {
          throw new Error(`Backend responded ${response.status}`);
        }
        const data = await response.json();
        const turn: Turn = {
          role: "parrot",
          text: data.text ?? data.kind,
          sources: data.sources?.length ? data.sources : undefined,
          question: data.question ?? undefined,
          plan: data.plan?.items?.length ? data.plan.items : undefined,
          demoMode: data.demo_mode === true,
        };
        setTurns((prev) => [...prev, turn]);
      } catch (exc) {
        setError(
          `Could not reach the Parrot backend (${String(exc instanceof Error ? exc.message : exc)}). ` +
            "Is the FastAPI API running on " + API_BASE + "?",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, resource],
  );

  const answerQuestion = useCallback(
    async (question: Question, answer: string) => {
      setBusy(true);
      setTurns((prev) => [...prev, { role: "student", text: answer }]);
      try {
        const response = await fetch(`${API_BASE}/api/v1/tutor/quiz/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_id: question.id, answer }),
        });
        if (!response.ok) throw new Error(`Backend responded ${response.status}`);
        const graded = await response.json();
        setTurns((prev) => [
          ...prev,
          {
            role: "parrot",
            text: (graded.correct ? "Correct! " : "Not quite. ") + graded.explanation,
            demoMode: true,
          },
        ]);
        setTurns((prev) =>
          prev.map((turn) =>
            turn.question?.id === question.id ? { ...turn, answeredCorrect: graded.correct } : turn,
          ),
        );
        askedIds.current = [...askedIds.current, question.id];
        const next = await fetch(`${API_BASE}/api/v1/tutor/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId(),
            message: "Next question",
            mode: "quiz",
            resource_id: resource?.resourceId ?? null,
            focus_topic: resource?.focusTopic ?? resource?.subject ?? null,
            asked_question_ids: askedIds.current,
          }),
        });
        if (next.ok) {
          const data = await next.json();
          if (data.question) {
            askedIds.current = [...askedIds.current, data.question.id];
            setTurns((prev) => [
              ...prev,
              { role: "parrot", text: data.text, question: data.question, sources: data.sources, demoMode: data.demo_mode === true },
            ]);
          }
        }
      } catch (exc) {
        setError(`Could not check that answer (${exc instanceof Error ? exc.message : String(exc)}).`);
      } finally {
        setBusy(false);
      }
    },
    [resource],
  );

  const submitTeachBack = useCallback(async () => {
    const explanation = input.trim();
    if (!explanation || busy) return;
    const topic = resource?.focusTopic || resource?.subject || "Faraday's law";
    setInput("");
    setTurns((prev) => [...prev, { role: "student", text: explanation }]);
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/tutor/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId(),
          topic,
          resource_id: resource?.resourceId ?? null,
          explanation,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ?? `Backend responded ${response.status}`);
      }
      const data = await response.json();
      setTurns((prev) => [
        ...prev,
        { role: "parrot", text: data.feedback.feedback, sources: data.sources, feedback: data.feedback, demoMode: data.demo_mode === true },
      ]);
    } catch (exc) {
      setError(`Could not evaluate the explanation (${exc instanceof Error ? exc.message : String(exc)}).`);
    } finally {
      setBusy(false);
    }
  }, [busy, input, resource]);

  const onSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const activeQuestion = [...turns].reverse().find((t) => t.role === "parrot" && t.question && t.answeredCorrect === undefined);
      if (activeQuestion?.question) {
        void answerQuestion(activeQuestion.question, input.trim());
        setInput("");
      } else if (lastTeachBackPrompt(turns)) {
        void submitTeachBack();
      } else {
        void send(input, "explain");
        setInput("");
      }
    },
    [turns, input, answerQuestion, submitTeachBack, send],
  );

  const panelOpen = open;

  return (
    <>
      <button
        className="parrot-launcher"
        onClick={() => (isOpen ? close() : openWith(resource))}
        aria-expanded={panelOpen}
        aria-controls="parrot-panel"
        aria-label={panelOpen ? "Close Parrot AI" : "Open Parrot AI study companion"}
        title="Parrot AI — learn by teaching"
      >
        {panelOpen ? "×" : "🦜"}
      </button>

      {panelOpen && (
        <section id="parrot-panel" className="parrot-panel" aria-label="Parrot AI study panel" role="dialog">
          <header className="parrot-panel-header">
            <div className="parrot-identity">
              <span className="parrot-badge" aria-hidden="true">🦜</span>
              <div>
                <strong>Parrot AI</strong>
                <p className="parrot-status">
                  {resource ? `Studying: ${resource.title}` : "No resource open — general study help"}
                </p>
              </div>
            </div>
            <div className="parrot-controls">
              <button className="parrot-minimise" onClick={close} aria-label="Minimise panel">—</button>
              <button className="parrot-minimise" onClick={close} aria-label="Close panel">×</button>
            </div>
          </header>

          <div className="parrot-quick-actions" aria-label="Suggested actions">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.mode}
                disabled={busy}
                onClick={() => void send(action.mode === "explain" ? `Explain ${resource?.subject ? resource.subject : resource?.title ? `the key ideas in ${resource.title}` : "this topic"}` : action.label, action.mode, true)}
              >
                {action.label}
              </button>
            ))}
          </div>

          {turns.length === 0 && !busy && (
            <div className="parrot-empty" role="status">
              <p>
                <strong>Squawk! Ready to study?</strong>
              </p>
              <p>
                {resource
                  ? "Ask about this resource, request a quiz, or practise explaining the idea — I check it against the material."
                  : "Open a resource from the Resources page for grounded study help, or ask a general question."}
              </p>
            </div>
          )}

          <div className="parrot-history" ref={scrollRef}>
            {turns.map((turn, index) => (
              <article key={index} className={`parrot-turn parrot-turn-${turn.role}`}>
                {turn.role === "parrot" && turn.demoMode && turn.sources === undefined && !turn.feedback && (
                  <span className="parrot-demo-tag">demo mode — deterministic sample output, no LLM key configured</span>
                )}
                <p className="parrot-message">{turn.text}</p>
                {turn.question && turn.answeredCorrect === undefined && (
                  <div className="parrot-question">
                    {turn.question.options.map((option, optIndex) => (
                      <button
                        key={optIndex}
                        className="parrot-option"
                        disabled={busy}
                        onClick={() => void answerQuestion(turn.question!, String(optIndex))}
                      >
                        {option}
                      </button>
                    ))}
                    {turn.question.type === "short_answer" && (
                      <span className="parrot-option-hint">Type your answer below and press send.</span>
                    )}
                  </div>
                )}
                {turn.feedback && (
                  <div className={`parrot-feedback parrot-feedback-${turn.feedback.overall_assessment}`}>
                    <strong>{ASSESSMENT_LABELS[turn.feedback.overall_assessment]}</strong>
                    {turn.feedback.correct_points.length > 0 && (
                      <ul>{turn.feedback.correct_points.map((point, i) => <li key={i}>✓ {point}</li>)}</ul>
                    )}
                    {turn.feedback.missing_points.length > 0 && (
                      <ul>{turn.feedback.missing_points.map((point, i) => <li key={i}>○ Missing: {point}</li>)}</ul>
                    )}
                    {turn.feedback.misconceptions.length > 0 && (
                      <ul>{turn.feedback.misconceptions.map((point, i) => <li key={i}>⚠ Misconception: {point}</li>)}</ul>
                    )}
                    <p className="parrot-next">Follow-up: {turn.feedback.next_question}</p>
                  </div>
                )}
                {turn.plan && (
                  <ol className="parrot-plan">
                    {turn.plan.map((item, i) => (
                      <li key={i}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {turn.sources && (
                  <div className="parrot-sources">
                    <span>Sources</span>
                    {turn.sources.map((source, i) => (
                      <span key={i} className="parrot-source">
                        {source.title}
                        {source.page != null ? ` · p.${source.page}` : ""} — “{source.snippet}”
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {busy && <p className="parrot-loading" role="status" aria-live="polite">Parrot is thinking…</p>}
            {error && (
              <p className="parrot-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <form className="parrot-composer" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                lastTeachBackPrompt(turns) && !pendingQuestion(turns)
                  ? "Explain the concept in your own words…"
                  : resource
                    ? `Ask about ${resource.subject || resource.title}…`
                    : "Ask a study question…"
              }
              aria-label="Message Parrot AI"
              maxLength={2000}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send message">
              {busy ? "…" : "Send"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function pendingQuestion(turns: Turn[]): Question | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role === "parrot" && turn.question && turn.answeredCorrect === undefined) {
      return turn.question;
    }
  }
  return null;
}

function lastTeachBackPrompt(turns: Turn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role === "student") return false;
    if (turn.text.toLowerCase().includes("explain it in your own words") || turn.text.toLowerCase().includes("teach this back")) {
      return true;
    }
  }
  return false;
}
