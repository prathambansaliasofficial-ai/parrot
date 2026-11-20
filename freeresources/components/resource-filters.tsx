"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export type FilterOptions = {
  universities: { id: string; slug: string; name: string; shortName: string }[];
  colleges: { id: string; slug: string; name: string; universitySlug: string }[];
  programmes: { id: string; slug: string; name: string; shortName: string }[];
  branches: { id: string; slug: string; name: string; universityId: string; programmeId: string }[];
  subjects: {
    id: string;
    slug: string;
    name: string;
    code: string | null;
    semester: number;
    universitySlug: string;
    universityShort: string;
    programmeSlug: string;
    branchSlug: string | null;
  }[];
  categories: { id: string; slug: string; name: string; group: string }[];
  sessions: string[];
};

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ResourceFilters({
  options,
  group,
  locked,
}: {
  options: FilterOptions;
  group?: string;
  locked?: { university?: string; programme?: string; subject?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const current = {
    q: searchParams.get("q") ?? "",
    university: searchParams.get("university") ?? "",
    college: searchParams.get("college") ?? "",
    programme: searchParams.get("programme") ?? "",
    branch: searchParams.get("branch") ?? "",
    semester: searchParams.get("semester") ?? "",
    subject: searchParams.get("subject") ?? "",
    category: searchParams.get("category") ?? "",
    session: searchParams.get("session") ?? "",
    format: searchParams.get("format") ?? "",
  };

  const uni = options.universities.find((u) => u.slug === (locked?.university ?? current.university));
  const programme = options.programmes.find((p) => p.slug === (locked?.programme ?? current.programme));

  const branches = useMemo(
    () =>
      options.branches.filter(
        (b) => (!uni || b.universityId === uni.id) && (!programme || b.programmeId === programme.id),
      ),
    [options.branches, uni, programme],
  );

  const subjects = useMemo(
    () =>
      options.subjects.filter(
        (s) =>
          (!uni || s.universitySlug === uni.slug) &&
          (!programme || s.programmeSlug === programme.slug) &&
          (!current.branch || s.branchSlug === current.branch) &&
          (!current.semester || String(s.semester) === current.semester),
      ),
    [options.subjects, uni, programme, current.branch, current.semester],
  );

  const categories = options.categories.filter((c) => !group || c.group === group);
  const colleges = options.colleges.filter((c) => !uni || c.universitySlug === uni.slug);

  const activeCount = Object.entries(current).filter(([key, value]) => key !== "q" && value).length;

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    if (key === "university") {
      next.delete("college");
      next.delete("branch");
      next.delete("subject");
    }
    if (key === "programme") {
      next.delete("branch");
      next.delete("subject");
    }
    if (key === "branch" || key === "semester") next.delete("subject");
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    update("q", query.trim());
  }

  return (
    <aside className="lg:w-64 lg:shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-secondary mb-3 w-full justify-between lg:hidden"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal size={15} /> Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[0.65rem] text-on-primary">{activeCount}</span>
          )}
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      <div className={`${open ? "block" : "hidden"} card p-4 lg:sticky lg:top-24 lg:block`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Refine results</p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => router.push(pathname, { scroll: false })}
              className="inline-flex items-center gap-1 text-[0.7rem] text-muted hover:text-danger"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        <form onSubmit={applySearch} className="mt-4">
          <label className="label" htmlFor="filter-q">
            Search within results
          </label>
          <div className="flex gap-1.5">
            <input
              id="filter-q"
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Subject or code"
            />
            <button type="submit" className="btn btn-secondary btn-sm shrink-0">
              Go
            </button>
          </div>
        </form>

        <div className="mt-4 space-y-3.5">
          {!locked?.university && (
            <Select
              label="University"
              value={current.university}
              onChange={(v) => update("university", v)}
              placeholder="All universities"
              options={options.universities.map((u) => ({ value: u.slug, label: u.shortName }))}
            />
          )}

          {colleges.length > 0 && !locked?.university && (
            <Select
              label="College"
              value={current.college}
              onChange={(v) => update("college", v)}
              placeholder="All colleges"
              options={colleges.map((c) => ({ value: c.slug, label: c.name }))}
            />
          )}

          {!locked?.programme && (
            <Select
              label="Programme"
              value={current.programme}
              onChange={(v) => update("programme", v)}
              placeholder="All programmes"
              options={options.programmes.map((p) => ({ value: p.slug, label: p.shortName }))}
            />
          )}

          {branches.length > 0 && (
            <Select
              label="Branch"
              value={current.branch}
              onChange={(v) => update("branch", v)}
              placeholder="All branches"
              options={branches.map((b) => ({ value: b.slug, label: b.name }))}
            />
          )}

          <Select
            label="Semester"
            value={current.semester}
            onChange={(v) => update("semester", v)}
            placeholder="All semesters"
            options={SEMESTERS.map((s) => ({ value: String(s), label: `Semester ${s}` }))}
          />

          {!locked?.subject && (
            <Select
              label="Subject"
              value={current.subject}
              onChange={(v) => update("subject", v)}
              placeholder="All subjects"
              options={subjects.map((s) => ({
                value: s.slug,
                label: `${s.name}${s.code ? ` (${s.code})` : ""} · ${s.universityShort}`,
              }))}
            />
          )}

          {(!group || group === "all") && (
            <Select
              label="Category"
              value={current.category}
              onChange={(v) => update("category", v)}
              placeholder="All categories"
              options={categories.map((c) => ({ value: c.slug, label: c.name }))}
            />
          )}

          {group && group !== "all" && categories.length > 0 && (
            <Select
              label="Resource type"
              value={current.category}
              onChange={(v) => update("category", v)}
              placeholder="All types"
              options={categories.map((c) => ({ value: c.slug, label: c.name }))}
            />
          )}

          <Select
            label="Academic session"
            value={current.session}
            onChange={(v) => update("session", v)}
            placeholder="All sessions"
            options={options.sessions.map((s) => ({ value: s, label: s }))}
          />

          <Select
            label="File format"
            value={current.format}
            onChange={(v) => update("format", v)}
            placeholder="Any format"
            options={[{ value: "pdf", label: "PDF" }]}
          />
        </div>

        <p className="mt-5 rounded-lg bg-paper px-3 py-2 text-[0.68rem] leading-relaxed text-muted">
          Filters combine. Pick a university first to see its branches and subjects.
        </p>
      </div>
    </aside>
  );
}

function Select({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
