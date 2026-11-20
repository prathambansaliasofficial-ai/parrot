import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import UniversityCard from "@/components/university-card";
import { first, type SearchParams } from "@/lib/params";
import { getUniversityStates, listUniversities } from "@/lib/queries";
import { UNIVERSITY_TYPES } from "@/lib/site";

export const metadata: Metadata = {
  title: "University directory",
  description:
    "Browse supported Indian universities and colleges. Filter by state and university type, then jump into programmes, semesters and subject resources.",
  alternates: { canonical: "/universities" },
};

export default async function UniversitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = first(params.q) ?? "";
  const state = first(params.state) ?? "";
  const type = first(params.type) ?? "";

  const universities = listUniversities({ q: q || undefined, state: state || undefined, type: type || undefined });
  const states = getUniversityStates();
  const totalSubjects = universities.reduce((sum, u) => sum + u.subjectCount, 0);

  return (
    <>
      <PageHeader
        eyebrow="University directory"
        title="Find your university"
        description={`${universities.length} universities across ${states.length} states, with ${totalSubjects} subjects mapped to their actual course structure. More institutions are added as material is contributed.`}
      >
        <form method="get" className="grid max-w-3xl gap-2 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="University name, city or abbreviation"
              className="input !pl-9"
              aria-label="Search universities"
            />
          </div>
          <select name="state" defaultValue={state} className="input" aria-label="Filter by state">
            <option value="">All states</option>
            {states.map((item) => (
              <option key={item.state} value={item.state}>
                {item.state} ({item.count})
              </option>
            ))}
          </select>
          <select name="type" defaultValue={type} className="input" aria-label="Filter by university type">
            <option value="">All types</option>
            {UNIVERSITY_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            Apply
          </button>
        </form>
        {(q || state || type) && (
          <Link href="/universities" className="mt-3 inline-block text-xs text-muted underline underline-offset-2">
            Clear all filters
          </Link>
        )}
      </PageHeader>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {universities.length === 0 ? (
          <EmptyState
            title="No university matches that search"
            description="Check the spelling or clear the filters. If your university is genuinely missing, request it and we will add its academic structure."
            actionHref="/request"
            actionLabel="Request your university"
          />
        ) : (
          <>
            <p className="mb-5 text-sm text-muted">
              Showing <strong className="text-ink">{universities.length}</strong>{" "}
              {universities.length === 1 ? "university" : "universities"}
              {state ? ` in ${state}` : ""}
              {type ? ` · ${type}` : ""}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {universities.map((university) => (
                <UniversityCard key={university.id} university={university} />
              ))}
            </div>
          </>
        )}

        <div className="mt-12 rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg">Missing your institution?</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            The hierarchy is fully database-driven: an admin can add a university, its colleges, programmes,
            branches and subjects without touching code. Send us the details and we will set it up.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/request" className="btn btn-primary btn-sm">
              Request a university
            </Link>
            <Link href="/contribute" className="btn btn-secondary btn-sm">
              Contribute material
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
