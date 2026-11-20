import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/components/page-header";
import ResourceBrowser from "@/components/resource-browser";
import SearchBar from "@/components/search-bar";
import { parseResourceFilters, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "Explore academic resources",
  description:
    "Browse previous year papers, notes, syllabus and practical files across Indian universities. Filter by university, course, branch, semester, subject and session.",
  alternates: { canonical: "/resources" },
};

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseResourceFilters(params);

  return (
    <>
      <PageHeader
        eyebrow="The library"
        title="Explore academic resources"
        description="One catalogue for every university, course and semester. Combine filters to narrow thousands of files down to the exact paper or notes you need."
      >
        <div className="max-w-2xl">
          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-surface" />}>
            <SearchBar variant="compact" defaultValue={filters.q ?? ""} />
          </Suspense>
        </div>
      </PageHeader>

      <ResourceBrowser filters={filters} searchParams={params} basePath="/resources" />
    </>
  );
}
