import Link from "next/link";
import { Suspense } from "react";

import EmptyState from "@/components/empty-state";
import Pagination from "@/components/pagination";
import ResourceCard from "@/components/resource-card";
import ResourceFilters from "@/components/resource-filters";
import SortSelect from "@/components/sort-select";
import { getFilterOptions, listResources, resourceFacets, type ResourceFilters as Filters } from "@/lib/queries";
import { CATEGORY_GROUPS } from "@/lib/site";
import type { SearchParams } from "@/lib/params";
import { first } from "@/lib/params";

export default function ResourceBrowser({
  filters,
  searchParams,
  basePath,
}: {
  filters: Filters;
  searchParams: SearchParams;
  basePath: string;
}) {
  const results = listResources(filters);
  const facets = resourceFacets({ ...filters, page: undefined });
  const options = getFilterOptions();
  const sampleCount = results.items.filter((item) => item.isSample).length;
  const activeGroup = filters.group ?? "all";

  const groupHref = (group: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...searchParams, group, page: undefined })) {
      const single = first(value);
      if (single) next.set(key, single);
    }
    if (group === "all") next.delete("group");
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
        <Link
          href={groupHref("all")}
          className={`chip shrink-0 !px-3 !py-1.5 ${
            activeGroup === "all" ? "border-transparent bg-primary text-on-primary" : ""
          }`}
        >
          All files
          <span className="opacity-70">{facets.total}</span>
        </Link>
        {CATEGORY_GROUPS.map((group) => {
          const count = facets.byGroup.find((g) => g.slug === group.slug)?.count ?? 0;
          return (
            <Link
              key={group.slug}
              href={groupHref(group.slug)}
              className={`chip shrink-0 !px-3 !py-1.5 ${
                activeGroup === group.slug ? "border-transparent bg-primary text-on-primary" : ""
              }`}
            >
              {group.short}
              <span className="opacity-70">{count}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-7 lg:flex-row">
        <Suspense fallback={<div className="card h-24 w-full animate-pulse lg:w-64" />}>
          <ResourceFilters
            options={options}
            group={filters.group && filters.group !== "all" ? filters.group : undefined}
          />
        </Suspense>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              <strong className="font-semibold text-ink">{facets.total}</strong>{" "}
              {facets.total === 1 ? "file" : "files"}
              {filters.q ? (
                <>
                  {" "}
                  for <span className="font-medium text-ink">“{filters.q}”</span>
                </>
              ) : null}
            </p>
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
          </div>

          {results.items.length === 0 ? (
            <EmptyState
              title="No resources match these filters"
              description="Try clearing a filter or searching for the subject code instead. If the material genuinely does not exist yet, request it and we will look for it."
              actionHref="/request"
              actionLabel="Request this resource"
            >
              <Link href={basePath} className="btn btn-secondary btn-sm">
                Clear filters
              </Link>
            </EmptyState>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.items.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>

              {sampleCount > 0 && (
                <p className="mt-5 rounded-lg border border-line bg-surface px-4 py-3 text-[0.75rem] leading-relaxed text-muted">
                  {sampleCount} of these files {sampleCount === 1 ? "is a" : "are"} labelled{" "}
                  <span className="badge-sample">Sample</span> — demonstration uploads that show how the library
                  works. They are not verified university papers.
                </p>
              )}

              <Pagination
                page={results.page}
                pages={results.pages}
                params={searchParams}
                basePath={basePath}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
