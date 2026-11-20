import { all, one, run } from "../db";
import { ACQUISITION_USER_AGENT, assertFetchableUrl, robotsAllows } from "./safety";
import { addCandidate, candidateStatus, createJob, createRun, setRunStatus } from "./queue";
import { auditAcquisition, getSettings, listCoverageGaps } from "./store";

/**
 * Coverage-driven discovery.
 *
 * Providers are pluggable: the official-domain sitemap crawler needs no API key,
 * Brave Web Search is used when BRAVE_SEARCH_API_KEY is present, and additional
 * providers can be added without touching callers.
 */

export type SubjectContext = {
  universitySlug: string;
  programmeSlug: string;
  branchSlug: string | null;
  semester: number;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  curriculumId: string | null;
  kind: "syllabus";
};

export type DiscoveredUrl = { url: string; title?: string | null; snippet?: string | null; provider: string };

export interface SearchProvider {
  id: string;
  label: string;
  configured(): boolean;
  discover(query: string, context: SubjectContext): Promise<DiscoveredUrl[]>;
}

/* ------------------------------------------------------------------ sitemap */

const MAX_SITEMAP_URLS = 6000;
const MAX_SITEMAP_DOCS = 6;

async function readSitemap(url: string, depth: number, collected: string[]): Promise<void> {
  if (depth > 1 || collected.length >= MAX_SITEMAP_URLS) return;
  const target = new URL(url);
  if (!(await robotsAllows(target))) return;
  const response = await fetch(target, {
    headers: { "User-Agent": ACQUISITION_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return;
  const text = (await response.text()).slice(0, 4_000_000);
  const entries = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1]);
  const isIndex = /<sitemapindex/i.test(text);
  for (const entry of entries) {
    if (collected.length >= MAX_SITEMAP_URLS) return;
    const decoded = entry.replace(/&amp;/g, "&");
    if (isIndex) await readSitemap(decoded, depth + 1, collected);
    else collected.push(decoded);
  }
}

async function sitemapUrls(domain: string): Promise<string[]> {
  const collected: string[] = [];
  const origins = [`https://${domain}`, `https://www.${domain}`];
  for (const origin of origins) {
    for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
      try {
        await readSitemap(`${origin}${path}`, 0, collected);
      } catch {
        // Try the next candidate.
      }
      if (collected.length > 0) return collected;
    }
    // Fall back to sitemaps declared in robots.txt.
    try {
      const robots = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": ACQUISITION_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (robots.ok) {
        const text = await robots.text();
        const maps = [...text.matchAll(/^sitemap:\s*(\S+)$/gim)].map((match) => match[1]);
        for (const map of maps.slice(0, MAX_SITEMAP_DOCS)) {
          await readSitemap(map, 0, collected);
        }
      }
    } catch {
      // No robots-based sitemaps.
    }
    if (collected.length > 0) return collected;
  }
  return collected;
}

function relevance(url: string, context: SubjectContext): number {
  const haystack = decodeURIComponent(url).toLowerCase().replace(/[-_/]+/g, " ");
  const nameWords = context.subjectName.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  let hits = 0;
  for (const word of nameWords) if (haystack.includes(word)) hits += 1;
  const hasSyllabus = /syllab|curricul|course.?structure|scheme/.test(haystack);
  const hasSemester = new RegExp(`sem(ester)?\\s*${context.semester}\\b`).test(haystack);
  const hasBranch = context.branchSlug ? haystack.includes(context.branchSlug.replace(/-/g, " ")) : false;
  return (
    (nameWords.length ? hits / nameWords.length : 0) * 0.6 +
    (hasSyllabus ? 0.25 : 0) +
    (hasSemester ? 0.1 : 0) +
    (hasBranch ? 0.05 : 0)
  );
}

/* ------------------------------------------------- official index crawling */

const CRAWL_MAX_PAGES = 80;
const CRAWL_MAX_DEPTH = 2;
const CRAWL_DELAY_MS = 700;
const CRAWL_MAX_PDFS = 40;

/** Index pages worth visiting before generic site navigation. */
function isIndexPage(url: string): boolean {
  return /syllab|curricul|course.?structure|academic|programme|program/i.test(decodeURIComponent(url));
}

/**
 * Recency from the URL itself (AKTU encodes 2026-27 as both 2026-27 and 2627).
 * Official repositories keep a decade of superseded syllabi online, so without
 * this the crawler surfaces 2018 ordinances before the current scheme.
 */
function recencyBoost(url: string): number {
  const haystack = decodeURIComponent(url);
  const currentYear = new Date().getFullYear();
  const full = [...haystack.matchAll(/(20\d{2})/g)].map((match) => Number(match[1]));
  const pairs = [...haystack.matchAll(/(?:^|[^0-9])(2[0-9])(2[0-9])(?:[^0-9]|$)/g)].map(
    (match) => 2000 + Number(match[1]),
  );
  const years = [...full, ...pairs].filter((year) => year >= 2010 && year <= currentYear + 3);
  if (years.length === 0) return 0;
  const best = Math.max(...years);
  if (best >= currentYear) return 0.12;
  if (best === currentYear - 1) return 0.06;
  if (best <= currentYear - 5) return -0.12;
  return -0.05;
}

function extractHrefs(html: string, base: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']/gi)) {
    const raw = match[1].trim();
    if (!raw || /^(mailto:|javascript:|tel:|data:)/i.test(raw)) continue;
    try {
      const resolved = new URL(raw.replace(/&amp;/g, "&"), base);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      resolved.hash = "";
      found.push(resolved.toString());
    } catch {
      // Ignore malformed links.
    }
  }
  return found;
}

/** A document that is plausibly a syllabus/curriculum artefact, by URL alone. */
export function isAcademicDocument(url: string): boolean {
  const haystack = decodeURIComponent(url).toLowerCase();
  if (/ordinance/i.test(haystack)) return false;
  return (
    /\.pdf(\?|#|$)/.test(haystack) &&
    /syllab|curricul|course.?structure|evaluation.?scheme|regulation/.test(haystack)
  );
}

/**
 * Crawls the monitored official domains' public HTML pages and collects PDF
 * links. AKTU publishes no sitemap (robots.txt and sitemap.xml both 404), so
 * without this provider the official source would never be discoverable.
 * Bounded to 60 pages per domain, same-origin only, sequential with a delay,
 * and robots.txt is checked for every request.
 */
class OfficialIndexProvider implements SearchProvider {
  id = "official_index";
  label = "Official website index";

  configured(): boolean {
    return true;
  }

  async discover(_query: string, context: SubjectContext): Promise<DiscoveredUrl[]> {
    const sources = all<{ domain: string; index_url: string | null }>(
      `SELECT domain, index_url FROM discovery_sources
        WHERE enabled=1 AND kind IN ('official','college')
        ORDER BY credibility DESC LIMIT 3`,
    );
    const found: DiscoveredUrl[] = [];
    for (const source of sources) {
      const pdfs = await this.crawlDomain(source.domain, context, source.index_url);
      for (const url of pdfs) found.push({ url, title: decodeURIComponent(url.split("/").pop() ?? url), provider: this.id });
    }
    return found;
  }

  private async crawlDomain(domain: string, context: SubjectContext, indexUrl: string | null): Promise<string[]> {
    const bare = domain.replace(/^www\./, "");
    const visited = new Set<string>();
    const preferred: { url: string; depth: number }[] = [];
    // A declared index page (for example AKTU's syllabus.html) is the entry
    // point. Without it a blind homepage crawl spends its budget on galleries
    // and press releases and never reaches the academic documents.
    const queue: { url: string; depth: number }[] = [
      { url: indexUrl || `https://${bare}/`, depth: 0 },
    ];
    const pdfs: string[] = [];
    let pages = 0;
    const debug = process.env.ACQUISITION_CRAWL_DEBUG === "1";

    while ((preferred.length > 0 || queue.length > 0) && pages < CRAWL_MAX_PAGES && pdfs.length < CRAWL_MAX_PDFS) {
      const next = preferred.shift() ?? queue.shift()!;
      if (visited.has(next.url)) continue;
      visited.add(next.url);

      let target: URL;
      try {
        target = new URL(next.url);
      } catch {
        continue;
      }
      if (!target.hostname.endsWith(bare)) continue;
      if (!(await robotsAllows(target))) continue;

      pages += 1;
      let html = "";
      try {
        const response = await fetch(target, {
          headers: { "User-Agent": ACQUISITION_USER_AGENT },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) continue;
        if (!(response.headers.get("content-type") ?? "").includes("html")) continue;
        html = (await response.text()).slice(0, 1_500_000);
      } catch {
        continue;
      }

      const links = extractHrefs(html, next.url);
      if (debug) console.log(`[crawl:${bare}] page ${pages} ${next.url} links=${links.length} pdfs=${pdfs.length}`);
      for (const link of links) {
        if (/\.pdf(\?|#|$)/i.test(link)) {
          if (isAcademicDocument(link) || relevance(link, context) >= 0.35) pdfs.push(link);
        } else if (next.depth < CRAWL_MAX_DEPTH && link.includes(bare)) {
          const entry = { url: link, depth: next.depth + 1 };
          // Syllabus/curriculum index pages are visited first: AKTU's homepage
          // links enough unrelated pages to exhaust the page budget otherwise.
          (isIndexPage(link) ? preferred : queue).push(entry);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS));
    }

    return [...new Set(pdfs)];
  }
}

class SitemapProvider implements SearchProvider {
  id = "official_sitemap";
  label = "Official domain sitemaps";

  configured(): boolean {
    return true;
  }

  async discover(_query: string, context: SubjectContext): Promise<DiscoveredUrl[]> {
    const sources = all<{ domain: string; credibility: number }>(
      `SELECT domain, credibility FROM discovery_sources
        WHERE enabled=1 AND kind IN ('official','college','repository')
        ORDER BY credibility DESC LIMIT 5`,
    );
    const found: DiscoveredUrl[] = [];
    for (const source of sources) {
      const urls = await sitemapUrls(source.domain);
      const pdfs = urls
        .filter((url) => /\.pdf(\?|#|$)/i.test(url))
        .map((url) => ({ url, score: relevance(url, context) }))
        .filter((entry) => entry.score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
      for (const entry of pdfs) {
        found.push({ url: entry.url, title: entry.url.split("/").pop() ?? entry.url, provider: this.id });
      }
    }
    return found;
  }
}

/* ------------------------------------------------------------------- brave */

class BraveProvider implements SearchProvider {
  id = "brave";
  label = "Brave Web Search";

  configured(): boolean {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY);
  }

  async discover(query: string, _context: SubjectContext): Promise<DiscoveredUrl[]> {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return [];
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Brave search failed with HTTP ${response.status}.`);
    const data = (await response.json()) as {
      web?: { results?: { url?: string; title?: string; description?: string }[] };
    };
    return (data.web?.results ?? [])
      .filter((result) => result.url && /\.pdf(\?|#|$)/i.test(result.url))
      .map((result) => ({
        url: result.url!,
        title: result.title ?? null,
        snippet: result.description ?? null,
        provider: this.id,
      }));
  }
}

export function searchProviders(): SearchProvider[] {
  return [new SitemapProvider(), new OfficialIndexProvider(), new BraveProvider()];
}

/** Reports which providers are usable, for the admin UI and health checks. */
export function providerStatus(): { id: string; label: string; configured: boolean }[] {
  return searchProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: provider.configured(),
  }));
}

/* ------------------------------------------------------------- query build */

export function queriesForSubject(context: SubjectContext): string {
  const branch = context.branchSlug ? context.branchSlug.replace(/-/g, " ").toUpperCase() : "";
  return [
    `AKTU ${context.programmeSlug.replace(/-/g, " ")} ${branch} semester ${context.semester} ${context.subjectName} syllabus pdf`,
    `site:aktu.ac.in ${context.subjectName} syllabus ${context.subjectCode ?? ""}`.trim(),
  ].join(" | ");
}

/* --------------------------------------------------------------- run scope */

export type DiscoveryScope = {
  universitySlug?: string;
  programmeSlug?: string;
  branchSlug?: string;
  semester?: number;
  subjectId?: string;
  url?: string;
  limit?: number;
};

export function candidateContext(reason: string | null): SubjectContext | null {
  if (!reason) return null;
  try {
    const parsed = JSON.parse(reason) as { context?: SubjectContext };
    return parsed.context ?? null;
  } catch {
    return null;
  }
}

export function candidateNote(reason: string | null): string {
  if (!reason) return "";
  try {
    const parsed = JSON.parse(reason) as { note?: string };
    return parsed.note ?? "";
  } catch {
    return reason;
  }
}

function scoreCandidate(url: string, provider: SearchProvider, domainCredibility: number, context: SubjectContext): number {
  let score = 0.15;
  if (/\.pdf(\?|#|$)/i.test(url)) score += 0.25;
  score += Math.min(domainCredibility, 1) * 0.35;
  score += relevance(url, context) * 0.4;
  if (provider.id === "brave") score += 0.05;
  if (isAcademicDocument(url)) score += 0.03;
  score += recencyBoost(url);
  if (/ordinance/i.test(decodeURIComponent(url))) score -= 0.25;
  return Math.round(Math.min(score, 1) * 100) / 100;
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- the run */

export async function executeDiscoveryRun(runId: string, userId: string | null): Promise<void> {
  const settings = getSettings();
  const runRow = one<{ id: string; mode: string; scope: string | null; status: string }>(
    "SELECT id, mode, scope, status FROM discovery_runs WHERE id = ?",
    [runId],
  );
  if (!runRow) throw new Error("Discovery run not found.");
  if (runRow.status === "cancelled" || runRow.status === "paused") return;

  setRunStatus(runId, "running");
  const scope = (runRow.scope ? JSON.parse(runRow.scope) : {}) as DiscoveryScope;
  const threshold = Number(settings.auto_select_threshold);

  const contexts: SubjectContext[] = [];
  if (scope.subjectId) {
    const subject = one<{
      id: string;
      name: string;
      code: string | null;
      semester: number;
      programme_slug: string;
      branch_slug: string | null;
      university_slug: string;
      curriculum_id: string | null;
    }>(
      `SELECT s.id, s.name, s.code, s.semester, p.slug AS programme_slug, b.slug AS branch_slug,
              u.slug AS university_slug,
              (SELECT cu.id FROM curricula cu WHERE cu.university_id=s.university_id
                AND cu.programme_id=s.programme_id AND IFNULL(cu.branch_id,'')=IFNULL(s.branch_id,'')
                LIMIT 1) AS curriculum_id
         FROM subjects s JOIN universities u ON u.id=s.university_id
         JOIN programmes p ON p.id=s.programme_id LEFT JOIN branches b ON b.id=s.branch_id
        WHERE s.id = ?`,
      [scope.subjectId],
    );
    if (subject) {
      contexts.push({
        universitySlug: subject.university_slug,
        programmeSlug: subject.programme_slug,
        branchSlug: subject.branch_slug,
        semester: subject.semester,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code,
        curriculumId: subject.curriculum_id,
        kind: "syllabus",
      });
    }
  }

  if (contexts.length === 0) {
    const gaps = listCoverageGaps(scope.universitySlug ?? "aktu", Math.min(Number(scope.limit ?? 5), 25));
    for (const gap of gaps) {
      if (scope.programmeSlug && gap.programme_short.toLowerCase() !== scope.programmeSlug.toLowerCase()) continue;
      if (scope.semester && gap.semester !== Number(scope.semester)) continue;
      contexts.push({
        universitySlug: gap.university_slug,
        programmeSlug: gap.programme_short.toLowerCase().replace(/\s+/g, "-"),
        branchSlug: gap.branch_name ? gap.branch_name.toLowerCase().replace(/\s+/g, "-") : null,
        semester: gap.semester,
        subjectId: gap.subject_id,
        subjectName: gap.name,
        subjectCode: gap.code,
        curriculumId: gap.curriculum_id,
        kind: "syllabus",
      });
    }
  }

  const providers = searchProviders().filter((provider) => provider.configured());
  const sourceRows = all<{ domain: string; credibility: number; id: string }>(
    "SELECT id, domain, credibility FROM discovery_sources WHERE enabled=1",
  );
  const credibilityFor = (domain: string) =>
    sourceRows.find((row) => domain === row.domain || domain.endsWith(`.${row.domain}`))?.credibility ?? 0.3;

  let discovered = 0;
  let selected = 0;
  const errors: string[] = [];
  // One crawl can surface dozens of plausible PDFs. Queueing them all would
  // start a large download burst, so only the best few auto-select per run;
  // everything else stays as a reviewer-selectable candidate.
  const AUTO_QUEUE_PER_RUN = 5;
  let autoQueued = 0;

  for (const context of contexts) {
    const query = queriesForSubject(context);
    for (const provider of providers) {
      let results: DiscoveredUrl[] = [];
      try {
        results = await provider.discover(query, context);
      } catch (error) {
        errors.push(`${provider.id}: ${error instanceof Error ? error.message : "provider failed"}`);
        continue;
      }

      for (const result of results.slice(0, 40)) {
        const domain = domainOf(result.url);
        if (!domain) continue;
        try {
          await assertFetchableUrl(result.url);
        } catch {
          continue;
        }
        const score = scoreCandidate(result.url, provider, credibilityFor(domain), context);
        const id = addCandidate({
          runId,
          url: result.url,
          domain,
          title: result.title,
          snippet: result.snippet,
          sourceId: sourceRows.find((row) => row.domain === domain)?.id ?? null,
          score,
          reason: JSON.stringify({ note: `${provider.label} · query: ${query.split(" | ")[0]}`, context }),
        });
        if (!id) continue;
        discovered += 1;

        // Authored sources are still reviewed; high-confidence hits are queued
        // for processing but never published without an administrator.
        if (score >= threshold && autoQueued < AUTO_QUEUE_PER_RUN) {
          autoQueued += 1;
          const jobId = createJob({
            candidateId: id,
            payload: {
              ...context,
              categorySlug: "syllabus",
              confidence: score,
              sourceProvider: provider.id,
            },
            stage: "selected",
            state: "queued",
          });
          candidateStatus(id, "selected");
          run("UPDATE discovered_candidates SET job_id = ? WHERE id = ?", [jobId, id]);
          selected += 1;
        }
      }
    }
  }

  const stats = { contexts: contexts.length, providers: providers.map((p) => p.id), discovered, selected, errors: errors.slice(0, 5) };
  setRunStatus(runId, "completed", { stats });
  auditAcquisition(userId, "acquisition.discovery.completed", "discovery_run", runId, stats);
}

/** Adds a single administrator-supplied URL to a run and queues it for review. */
export function addManualCandidate(input: {
  runId: string;
  url: string;
  context: SubjectContext;
  userId: string | null;
}): string {
  const domain = domainOf(input.url);
  if (!domain) throw new Error("Enter a full http(s) URL.");
  const id = addCandidate({
    runId: input.runId,
    url: input.url,
    domain,
    title: input.url.split("/").pop() ?? input.url,
    score: 1,
    reason: JSON.stringify({ note: "Added manually by an administrator", context: input.context }),
  });
  if (!id) throw new Error("That URL is already in this run.");
  const jobId = createJob({
    candidateId: id,
    payload: { ...input.context, categorySlug: "syllabus", confidence: 1, sourceProvider: "manual" },
    stage: "selected",
    state: "queued",
  });
  candidateStatus(id, "selected");
  run("UPDATE discovered_candidates SET job_id = ? WHERE id = ?", [jobId, id]);
  auditAcquisition(input.userId, "acquisition.candidate.added", "discovered_candidate", id, { url: input.url });
  return jobId;
}

/** Creates a run for one manually supplied URL. */
export function createManualRun(url: string, context: SubjectContext, userId: string | null): { runId: string; jobId: string } {
  const runId = createRun({ mode: "manual", scope: { url, subjectId: context.subjectId }, userId });
  const jobId = addManualCandidate({ runId, url, context, userId });
  setRunStatus(runId, "completed", { stats: { discovered: 1, selected: 1, mode: "manual" } });
  return { runId, jobId };
}
