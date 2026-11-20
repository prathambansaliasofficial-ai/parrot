"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";

import type { FilterOptions } from "./resource-filters";

const SESSIONS = ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"];
const GROUP_LABELS: Record<string, string> = {
  pyq: "Previous year papers",
  notes: "Notes",
  syllabus: "Syllabus",
  practical: "Practical files",
  other: "Other resources",
};

export default function ContributeForm({
  options,
  maxMb,
  defaults,
  contributor,
}: {
  options: FilterOptions;
  maxMb: number;
  defaults: { university?: string; programme?: string; branch?: string; semester?: string; subject?: string };
  contributor?: { name: string; email: string };
}) {
  const [university, setUniversity] = useState(defaults.university ?? "");
  const [programme, setProgramme] = useState(defaults.programme ?? "");
  const [branch, setBranch] = useState(defaults.branch ?? "");
  const [semester, setSemester] = useState(defaults.semester ?? "");
  const [subjectSlug, setSubjectSlug] = useState(defaults.subject ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ reference: string; message: string } | null>(null);

  const uni = options.universities.find((u) => u.slug === university);
  const prog = options.programmes.find((p) => p.slug === programme);

  const branches = options.branches.filter(
    (b) => (!uni || b.universityId === uni.id) && (!prog || b.programmeId === prog.id),
  );
  const colleges = options.colleges.filter((c) => !uni || c.universitySlug === uni.slug);
  const subjects = options.subjects.filter(
    (s) =>
      (!uni || s.universitySlug === uni.slug) &&
      (!prog || s.programmeSlug === prog.slug) &&
      (!branch || s.branchSlug === branch) &&
      (!semester || String(s.semester) === semester),
  );

  const groupedCategories = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; group: string }[]>();
    for (const category of options.categories) {
      const list = map.get(category.group) ?? [];
      list.push(category);
      map.set(category.group, list);
    }
    return [...map.entries()];
  }, [options.categories]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFields((prev) => ({ ...prev, file: "" }));
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setFields((prev) => ({ ...prev, file: "Only PDF files are accepted." }));
      event.target.value = "";
      return;
    }
    if (selected.size > maxMb * 1024 * 1024) {
      setFile(null);
      setFields((prev) => ({ ...prev, file: `File is larger than ${maxMb} MB.` }));
      event.target.value = "";
      return;
    }
    setFile(selected);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    if (subjectSlug !== "__new" && subjectSlug) {
      form.delete("subjectName");
      form.delete("subjectCode");
    } else {
      form.delete("subjectSlug");
    }
    if (file) form.set("file", file);

    try {
      const response = await fetch("/api/contribute", { method: "POST", body: form });
      const result = (await response.json()) as {
        reference?: string;
        message?: string;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        setError(result.error ?? "Submission failed. Please try again.");
        setFields(result.fields ?? {});
        return;
      }
      setSuccess({ reference: result.reference!, message: result.message! });
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        <h2 className="mt-4 text-2xl">Submission received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{success.message}</p>
        <p className="mt-4 inline-block rounded-lg border border-line bg-paper px-4 py-2 font-mono text-sm">
          {success.reference}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary btn-sm">
            Track in dashboard
          </Link>
          <button type="button" onClick={() => setSuccess(null)} className="btn btn-secondary btn-sm">
            Submit another file
          </button>
        </div>
        <p className="mt-5 text-[0.7rem] text-muted">
          We review every upload manually. You will not be auto-published, and no download link exists until an
          admin approves it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">1 · About the file</legend>

        <Field label="Resource title" error={fields.title} htmlFor="title">
          <input
            id="title"
            name="title"
            className="input"
            required
            minLength={4}
            maxLength={160}
            placeholder="e.g. Data Structures — End Semester Paper, 2024-25"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resource category" error={fields.category} htmlFor="category">
            <select id="category" name="category" className="input" required defaultValue="">
              <option value="">Select a category</option>
              {groupedCategories.map(([group, categories]) => (
                <optgroup key={group} label={GROUP_LABELS[group] ?? group}>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Academic session" error={fields.session} htmlFor="session" hint="The exam or scheme year">
            <select id="session" name="session" className="input" defaultValue="">
              <option value="">Not sure</option>
              {SESSIONS.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Description"
          error={fields.description}
          htmlFor="description"
          hint="What does the file cover? Is it a full paper, one unit, or a scanned copy?"
        >
          <textarea id="description" name="description" className="input min-h-24" maxLength={1200} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="text-sm font-semibold">2 · Where it belongs</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="University" error={fields.university} htmlFor="university">
            <select
              id="university"
              name="university"
              className="input"
              required
              value={university}
              onChange={(event) => {
                setUniversity(event.target.value);
                setBranch("");
                setSubjectSlug("");
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

          <Field label="College (optional)" error={fields.college} htmlFor="college">
            <select id="college" name="college" className="input" defaultValue="">
              <option value="">University-level resource</option>
              {colleges.map((college) => (
                <option key={college.slug} value={college.slug}>
                  {college.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Programme" error={fields.programme} htmlFor="programme">
            <select
              id="programme"
              name="programme"
              className="input"
              required
              value={programme}
              onChange={(event) => {
                setProgramme(event.target.value);
                setBranch("");
                setSubjectSlug("");
              }}
            >
              <option value="">Select a programme</option>
              {options.programmes.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.shortName} — {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Branch / specialisation (optional)" error={fields.branch} htmlFor="branch">
            <select
              id="branch"
              name="branch"
              className="input"
              value={branch}
              onChange={(event) => {
                setBranch(event.target.value);
                setSubjectSlug("");
              }}
            >
              <option value="">Not branch-specific</option>
              {branches.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Semester" error={fields.semester} htmlFor="semester">
            <select
              id="semester"
              name="semester"
              className="input"
              required
              value={semester}
              onChange={(event) => {
                setSemester(event.target.value);
                setSubjectSlug("");
              }}
            >
              <option value="">Select semester</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  Semester {n}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subject" error={fields.subjectSlug ?? fields.subjectName} htmlFor="subjectSlug">
            <select
              id="subjectSlug"
              name="subjectSlug"
              className="input"
              value={subjectSlug}
              onChange={(event) => setSubjectSlug(event.target.value)}
            >
              <option value="">Select a subject</option>
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""} · Sem {s.semester}
                </option>
              ))}
              <option value="__new">+ Add a new subject</option>
            </select>
            {subjects.length === 0 && university && programme && (
              <p className="mt-1 text-[0.7rem] text-muted">
                No subject matches this combination yet. Use “Add a new subject”.
              </p>
            )}
          </Field>
        </div>

        {subjectSlug === "__new" && (
          <div className="grid gap-4 rounded-xl border border-dashed border-line bg-paper/60 p-4 sm:grid-cols-2">
            <Field label="New subject name" error={fields.subjectName} htmlFor="subjectName">
              <input
                id="subjectName"
                name="subjectName"
                className="input"
                required
                maxLength={120}
                placeholder="e.g. Operating Systems"
              />
            </Field>
            <Field label="Subject code (optional)" error={fields.subjectCode} htmlFor="subjectCode">
              <input
                id="subjectCode"
                name="subjectCode"
                className="input"
                maxLength={30}
                placeholder="e.g. BCS401"
              />
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="text-sm font-semibold">3 · The file and you</legend>

        <div>
          <span className="label">PDF file</span>
          <label
            htmlFor="file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-8 text-center transition hover:border-primary/40"
          >
            {file ? (
              <>
                <FileText size={22} className="text-primary" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB · click to replace
                </span>
              </>
            ) : (
              <>
                <Upload size={22} className="text-muted" />
                <span className="text-sm font-medium">Choose a PDF</span>
                <span className="text-xs text-muted">Max {maxMb} MB · text or scanned, but PDF only</span>
              </>
            )}
            <input
              id="file"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={onFileChange}
              required
            />
          </label>
          {fields.file && <p className="mt-1 text-xs text-danger">{fields.file}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={fields.contributorName} htmlFor="contributorName" hint="Shown as credit">
            <input
              id="contributorName"
              name="contributorName"
              className="input"
              required
              maxLength={80}
              defaultValue={contributor?.name ?? ""}
            />
          </Field>
          <Field label="Email" error={fields.email} htmlFor="email" hint="Only admins see this">
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              required
              defaultValue={contributor?.email ?? ""}
            />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending && <Loader2 size={15} className="animate-spin" />}
          Submit for review
        </button>
        <p className="text-[0.72rem] text-muted">
          By submitting you confirm you have the right to share this file. See our{" "}
          <Link href="/dmca" className="text-primary hover:underline">
            copyright policy
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[0.7rem] text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
