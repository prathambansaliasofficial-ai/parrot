"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Field } from "./contribute-form";
import type { FilterOptions } from "./resource-filters";

export default function RequestForm({
  options,
  defaults,
}: {
  options: Pick<FilterOptions, "universities" | "programmes" | "branches" | "categories" | "colleges">;
  defaults: { university?: string; programme?: string; branch?: string; semester?: string; subject?: string };
}) {
  const [university, setUniversity] = useState(defaults.university ?? "");
  const [programme, setProgramme] = useState(defaults.programme ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ reference: string; message: string } | null>(null);

  const uni = options.universities.find((u) => u.slug === university);
  const prog = options.programmes.find((p) => p.slug === programme);
  const branches = options.branches.filter(
    (b) => (!uni || b.universityId === uni.id) && (!prog || b.programmeId === prog.id),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());

    try {
      const response = await fetch("/api/requests", {
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
        setError(result.error ?? "Request failed. Please try again.");
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
        <h2 className="mt-4 text-2xl">Request logged</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{success.message}</p>
        <p className="mt-4 inline-block rounded-lg border border-line bg-paper px-4 py-2 font-mono text-sm">
          {success.reference}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/resources" className="btn btn-primary btn-sm">
            Browse the library
          </Link>
          <button type="button" onClick={() => setSuccess(null)} className="btn btn-secondary btn-sm">
            Make another request
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="University" htmlFor="req-university" error={fields.university}>
          <select
            id="req-university"
            name="university"
            className="input"
            required
            value={university}
            onChange={(event) => {
              setUniversity(event.target.value);
              setProgramme("");
            }}
          >
            <option value="">Select a university</option>
            {options.universities.map((u) => (
              <option key={u.slug} value={u.slug}>
                {u.shortName} — {u.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Programme" htmlFor="req-programme" error={fields.programme}>
          <select
            id="req-programme"
            name="programme"
            className="input"
            required
            value={programme}
            onChange={(event) => setProgramme(event.target.value)}
          >
            <option value="">Select a programme</option>
            {options.programmes.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.shortName} — {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Branch (optional)" htmlFor="req-branch" error={fields.branch}>
          <select id="req-branch" name="branch" className="input" defaultValue={defaults.branch ?? ""}>
            <option value="">Not branch-specific</option>
            {branches.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Semester (optional)" htmlFor="req-semester" error={fields.semester}>
          <select id="req-semester" name="semester" className="input" defaultValue={defaults.semester ?? ""}>
            <option value="">Not sure</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                Semester {n}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Subject name" htmlFor="req-subject" error={fields.subjectName}>
          <input
            id="req-subject"
            name="subjectName"
            className="input"
            required
            maxLength={120}
            defaultValue={defaults.subject ?? ""}
            placeholder="e.g. Engineering Mathematics III"
          />
        </Field>

        <Field label="Subject code (optional)" htmlFor="req-code" error={fields.subjectCode}>
          <input id="req-code" name="subjectCode" className="input" maxLength={30} placeholder="e.g. BAS301" />
        </Field>

        <Field label="Resource type wanted" htmlFor="req-category" error={fields.category}>
          <select id="req-category" name="category" className="input" defaultValue="">
            <option value="">Anything useful</option>
            {options.categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Your email" htmlFor="req-email" error={fields.email}>
          <input id="req-email" name="email" type="email" className="input" required />
        </Field>
      </div>

      <Field
        label="Additional details (optional)"
        htmlFor="req-details"
        error={fields.details}
        hint="Exam year, unit numbers, or where you have already looked."
      >
        <textarea id="req-details" name="details" className="input min-h-24" maxLength={1000} />
      </Field>

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending && <Loader2 size={15} className="animate-spin" />}
        Submit request
      </button>
    </form>
  );
}
