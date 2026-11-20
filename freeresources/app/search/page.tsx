import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Search as SearchIcon, Sparkles } from "lucide-react";

import EmptyState from "@/components/empty-state";
import Pagination from "@/components/pagination";
import ResourceCard from "@/components/resource-card";
import SearchBar from "@/components/search-bar";
import {
  getTrendingSearches,
  listSubjects,
  recordSearch,
  searchSite,
} from "@/lib/queries";
import { first, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "Search the library",
  description:
    "Search across universities, courses, subjects, subject codes and resource titles. Try BCS301, Data Structures or DTU CSE semester 3.",
  robots: { index: false, follow: true },
};

const GROUP_LABELS: Record<string, string> = {
  pyq: "Previous year papers",
  notes: "Notes",
  syllabus: "Syllabus",
  practical: "Practical files",
  other: "Other",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").trim();
  const page = Number(first(params.page) ?? "1") || 1;

  if (!q) {
    const trending = getTrendingSearches(8);
    const subjects = listSubjects({})
      .filter((s) => s.resourceCount > 0)
      .sort((a, b) => b.resourceCount - a.resourceCount)
      .slice(0, 8);

    return (
      <>
        <section className="border-b border-line bg-surface/60">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <p className="eyebrow">Search</p>
            <h1 className="mt-2 text-[2rem] sm:text-[2.6rem]">Find the exact paper, note or syllabus</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Search by university, course, branch, subject name or subject code. “DTU CSE 3rd sem” and “BCS301”
              both work.
            </p>
            <div className="mx-auto mt-7 max-w-2xl text-left">
              <Suspense fallback={<div className="h-14 rounded-full border border-line bg-surface" />}>
                <SearchBar variant="hero" autoFocus />
              </Suspense>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-lg">Popular searches</h2>
            {trending.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No searches recorded yet. Try a subject code such as <strong>BCS301</strong>.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {trending.map((item) => (
                  <li key={item.query}>
                    <Link
                      href={`/search?q=${encodeURIComponent(item.query)}`}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-surface-2 hover:text-primary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <SearchIcon size={13} className="text-muted" /> {item.query}
                      </span>
                      <span className="text-xs text-muted">{item.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-lg">Subjects with material</h2>
            {subjects.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No subjects have published files yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {subjects.map((subject) => (
                  <li key={subject.id}>
                    <Link
                      href={`/subjects/${subject.slug}`}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-surface-2 hover:text-primary"
                    >
                      <span className="truncate">
                        {subject.name}
                        {subject.code ? ` · ${subject.code}` : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{subject.resourceCount} files</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </>
    );
  }

  const results = await searchSite(q, { page });
  const total = results.resources.total;
  const hasAny =
    total > 0 ||
    results.subjects.length > 0 ||
    results.universities.length > 0 ||
    results.programmes.length > 0;

  recordSearch(q, total);

  const parsed = results.parsed;
  const activeChips: { label: string; remove?: string }[] = [];
  if (parsed.university) activeChips.push({ label: `University: ${parsed.university.name}` });
  if (parsed.branch) activeChips.push({ label: `Branch: ${parsed.branch.name}` });
  if (parsed.semester) activeChips.push({ label: `Semester ${parsed.semester}` });
  if (parsed.group) activeChips.push({ label: GROUP_LABELS[parsed.group] ?? parsed.group });

  return (
    <>
      <section className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="eyebrow">Search results</p>
          <h1 className="mt-2 text-[1.8rem] leading-tight sm:text-[2.3rem]">
            “{results.raw}”
          </h1>
          <p className="mt-2 text-sm text-muted">
            {total} {total === 1 ? "file" : "files"} · {results.subjects.length} subjects ·{" "}
            {results.universities.length} universities
          </p>

          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[0.7rem] uppercase tracking-wide text-muted">Interpreted as</span>
              {activeChips.map((chip) => (
                <span key={chip.label} className="chip border-transparent bg-mint text-primary">
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 max-w-2xl">
            <Suspense fallback={<div className="h-12 rounded-full border border-line bg-surface" />}>
              <SearchBar variant="compact" defaultValue={q} />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {results.fuzzyTerm && (
          <p className="mb-5 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-ink">
            <Sparkles size={14} className="text-accent" />
            No exact match. Showing results for <strong>{results.fuzzyTerm}</strong> instead.
          </p>
        )}

        {!hasAny ? (
          <div className="space-y-6">
            <EmptyState
              title={`Nothing matched “${results.raw}”`}
              description="Try a shorter query, a subject code, or clear the university and semester words. If the material is missing from the library, request it and an admin will look for it."
              actionHref={`/request?subject=${encodeURIComponent(results.raw)}`}
              actionLabel="Request this resource"
            >
              <Link href="/resources" className="btn btn-secondary btn-sm">
                Browse all resources
              </Link>
            </EmptyState>
            <div className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
              <p className="font-medium text-ink">Search tips</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.8rem]">
                <li>Use a subject code exactly as printed: BCS301, BCS401.</li>
                <li>Include the university abbreviation and semester: “DTU CSE 3rd sem”.</li>
                <li>A category word narrows the shelf: “Data Structures notes”.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {total > 0 && (
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl">Files</h2>
                  <span className="text-xs text-muted">
                    Page {results.resources.page} of {results.resources.pages}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {results.resources.items.map((resource) => (
                    <ResourceCard key={resource.id} resource={resource} />
                  ))}
                </div>
                <Pagination
                  page={results.resources.page}
                  pages={results.resources.pages}
                  params={params}
                  basePath="/search"
                />
              </section>
            )}

            {results.subjects.length > 0 && (
              <section>
                <h2 className="text-xl">Subjects</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {results.subjects.map((subject) => (
                    <li key={subject.id}>
                      <Link
                        href={`/subjects/${subject.slug}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-primary/40"
                      >
                        <span>
                          <span className="text-sm font-medium">
                            {subject.name}
                            {subject.code ? ` · ${subject.code}` : ""}
                          </span>
                          <span className="mt-0.5 block text-[0.7rem] text-muted">
                            {subject.universityShort} · Semester {subject.semester}
                          </span>
                        </span>
                        <span className="shrink-0 text-[0.7rem] text-muted">{subject.resourceCount} files</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {results.universities.length > 0 && (
              <section>
                <h2 className="text-xl">Universities</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {results.universities.map((university) => (
                    <Link
                      key={university.slug}
                      href={`/universities/${university.slug}`}
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm transition hover:border-primary/40 hover:bg-mint/40"
                    >
                      <span className="font-medium">{university.shortName}</span>
                      <span className="text-xs text-muted">{university.state}</span>
                      <ArrowRight size={13} className="text-muted" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {results.programmes.length > 0 && (
              <section>
                <h2 className="text-xl">Courses</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {results.programmes.map((programme) => (
                    <Link
                      key={programme.slug}
                      href={`/courses/${programme.slug}`}
                      className="chip !px-3 !py-1.5 hover:border-primary/40 hover:text-primary"
                    >
                      {programme.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <p className="border-t border-line pt-5 text-xs text-muted">
              Not finding it?{" "}
              <Link href="/request" className="text-primary hover:underline">
                Request the resource
              </Link>{" "}
              or{" "}
              <Link href="/contribute" className="text-primary hover:underline">
                contribute what you already have
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </>
  );
}
