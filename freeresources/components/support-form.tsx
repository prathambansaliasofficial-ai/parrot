"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Field } from "./contribute-form";

const CATEGORIES = [
  { value: "broken-download", label: "Broken download link" },
  { value: "incorrect-resource", label: "Incorrect resource" },
  { value: "missing-resource", label: "Missing resource" },
  { value: "copyright", label: "Copyright concern" },
  { value: "technical-issue", label: "Technical issue" },
  { value: "general-enquiry", label: "General enquiry" },
  { value: "business-enquiry", label: "Business / advertising" },
];

export default function SupportForm({
  resource,
  defaultCategory,
}: {
  resource?: { id: string; title: string; slug: string } | null;
  defaultCategory?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ reference: string; message: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        reference?: string;
        message?: string;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        setError(result.error ?? "Ticket could not be created. Please try again.");
        setFields(result.fields ?? {});
        return;
      }
      setSuccess({ reference: result.reference!, message: result.message! });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="card p-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint text-primary">
          <CheckCircle2 size={24} />
        </span>
        <h2 className="mt-4 text-2xl">Ticket created</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{success.message}</p>
        <p className="mt-4 inline-block rounded-lg border border-line bg-paper px-4 py-2 font-mono text-sm">
          {success.reference}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={resource ? `/resource/${resource.slug}` : "/"} className="btn btn-secondary btn-sm">
            {resource ? "Back to resource" : "Back home"}
          </Link>
          <button type="button" onClick={() => setSuccess(null)} className="btn btn-ghost btn-sm">
            Open another ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {resource && <input type="hidden" name="resourceId" value={resource.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="sup-name" error={fields.name}>
          <input id="sup-name" name="name" className="input" required maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="sup-email" error={fields.email}>
          <input id="sup-email" name="email" type="email" className="input" required />
        </Field>
      </div>

      <Field label="Category" htmlFor="sup-category" error={fields.category}>
        <select
          id="sup-category"
          name="category"
          className="input"
          required
          defaultValue={defaultCategory ?? "broken-download"}
        >
          {CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Subject" htmlFor="sup-subject" error={fields.subject}>
        <input
          id="sup-subject"
          name="subject"
          className="input"
          required
          maxLength={140}
          defaultValue={resource ? `Issue with: ${resource.title}` : ""}
        />
      </Field>

      <Field
        label="What happened?"
        htmlFor="sup-message"
        error={fields.message}
        hint="Include the subject code, what you expected, and what you saw instead."
      >
        <textarea id="sup-message" name="message" className="input min-h-32" required maxLength={2000} />
      </Field>

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending && <Loader2 size={15} className="animate-spin" />}
        Create ticket
      </button>
    </form>
  );
}
