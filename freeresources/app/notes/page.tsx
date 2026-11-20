import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/components/page-header";
import ResourceBrowser from "@/components/resource-browser";
import SearchBar from "@/components/search-bar";
import { parseResourceFilters, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "Notes, handwritten notes and question banks",
  description:
    "Handwritten notes, digital class notes, toppers' notes, important questions, unit-wise notes and revision material for Indian university courses.",
  alternates: { canonical: "/notes" },
};

export default async function NotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseResourceFilters(params, { group: "notes" });

  return (
    <>
      <PageHeader
        eyebrow="Notes library"
        title="Notes that match your syllabus"
        description="Handwritten, typed, unit-wise and toppers' notes — each kept as its own category, so a question bank never gets mixed up with a revision sheet."
      >
        <div className="max-w-2xl">
          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-surface" />}>
            <SearchBar variant="compact" defaultValue={filters.q ?? ""} placeholder="Search notes by subject or code..." />
          </Suspense>
        </div>
      </PageHeader>

      <ResourceBrowser filters={filters} searchParams={params} basePath="/notes" />
    </>
  );
}
