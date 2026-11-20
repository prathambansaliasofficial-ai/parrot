import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/components/page-header";
import ResourceBrowser from "@/components/resource-browser";
import SearchBar from "@/components/search-bar";
import { parseResourceFilters, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "Previous year question papers",
  description:
    "University-wise previous year question papers with subject code, examination session and semester. Preview before you download.",
  alternates: { canonical: "/pyqs" },
};

export default async function PyqsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseResourceFilters(params, { group: "pyq" });

  return (
    <>
      <PageHeader
        eyebrow="PYQ library"
        title="Previous year question papers"
        description="End-semester papers organised by university, course, branch, semester and examination session. Search a subject code like BCS301 to jump straight to its papers."
      >
        <div className="max-w-2xl">
          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-surface" />}>
            <SearchBar variant="compact" defaultValue={filters.q ?? ""} placeholder="Search by subject or subject code..." />
          </Suspense>
        </div>
      </PageHeader>

      <ResourceBrowser filters={filters} searchParams={params} basePath="/pyqs" />
    </>
  );
}
