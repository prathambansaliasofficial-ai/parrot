import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/components/page-header";
import ResourceBrowser from "@/components/resource-browser";
import SearchBar from "@/components/search-bar";
import { parseResourceFilters, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "University syllabus and curriculum",
  description:
    "Semester-wise university syllabus, subject-wise curriculum and scheme documents for engineering, computer applications and other programmes.",
  alternates: { canonical: "/syllabus" },
};

export default async function SyllabusPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseResourceFilters(params, { group: "syllabus" });

  return (
    <>
      <PageHeader
        eyebrow="Syllabus library"
        title="The syllabus, without the scavenger hunt"
        description="Unit-wise syllabus documents and curriculum files, grouped by university and semester. Always confirm the latest scheme with your department before planning exams."
      >
        <div className="max-w-2xl">
          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-surface" />}>
            <SearchBar variant="compact" defaultValue={filters.q ?? ""} placeholder="Search syllabus by subject or code..." />
          </Suspense>
        </div>
      </PageHeader>

      <ResourceBrowser filters={filters} searchParams={params} basePath="/syllabus" />
    </>
  );
}
