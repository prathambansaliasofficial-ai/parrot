import type { ResourceFilters } from "./queries";

export type SearchParams = Record<string, string | string[] | undefined>;

export function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export function parseResourceFilters(params: SearchParams, overrides: Partial<ResourceFilters> = {}): ResourceFilters {
  const page = Number(first(params.page) ?? "1");
  return {
    q: first(params.q)?.slice(0, 120),
    university: first(params.university),
    college: first(params.college),
    programme: first(params.programme),
    branch: first(params.branch),
    semester: first(params.semester),
    subject: first(params.subject),
    category: first(params.category),
    group: first(params.group),
    session: first(params.session),
    format: first(params.format),
    sort: first(params.sort) ?? "recent",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: 12,
    ...overrides,
  };
}
