/**
 * Index-page discovery for official sources.
 *
 * This is the Cloudflare-native counterpart of the Node crawler's
 * `official_index` provider. It reads a source's declared index page, keeps only
 * syllabus-like PDF links on the same registrable host, and records candidates
 * in D1. It never scrapes search engine result pages and never follows a link to
 * a different domain.
 *
 * The full Node crawler still owns depth-limited multi-page crawling; this
 * worker path is deliberately shallow and idempotent.
 */
import type { Env } from "./types";

const ACADEMIC_FILE = /(syllabus|curricul|scheme|course[_-]?structure|regulation)/i;
const MAX_HTML_BYTES = 3_000_000;

type SourceRow = { id: string; domain: string; index_url: string | null; credibility: number };

function absolutise(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/** Minimal robots check: a global Disallow is honoured, everything else is allowed. */
async function robotsAllows(indexUrl: string): Promise<boolean> {
  try {
    const origin = new URL(indexUrl).origin;
    const response = await fetch(`${origin}/robots.txt`, { redirect: "follow" });
    if (!response.ok) return true; // No robots file (AKTU returns 404): nothing to honour.
    const body = (await response.text()).slice(0, 20_000);
    const globalDisallow = body
      .split(/\r?\n/)
      .some((line) => /^\s*disallow:\s*\/\s*$/i.test(line));
    return !globalDisallow;
  } catch {
    return false;
  }
}

export async function runDiscovery(env: Env, runId: string): Promise<void> {
  const limit = Math.max(1, Number(env.ACQUISITION_MAX_CANDIDATES_PER_RUN) || 5);

  await env.DB.prepare("UPDATE discovery_runs SET status = 'running', started_at = datetime('now') WHERE id = ?")
    .bind(runId)
    .run();

  const sources = await env.DB.prepare(
    `SELECT id, domain, index_url, credibility FROM discovery_sources
      WHERE enabled = 1 AND index_url IS NOT NULL AND index_url <> ''
      ORDER BY credibility DESC LIMIT 5`,
  ).all<SourceRow>();

  let inspected = 0;
  let inserted = 0;
  const skipped: { url: string; reason: string }[] = [];

  for (const source of sources.results) {
    const indexUrl = source.index_url!;
    if (!(await robotsAllows(indexUrl))) {
      skipped.push({ url: indexUrl, reason: "robots.txt disallows crawling" });
      continue;
    }

    let html: string;
    try {
      const response = await fetch(indexUrl, { redirect: "follow", headers: { accept: "text/html" } });
      if (!response.ok) {
        skipped.push({ url: indexUrl, reason: `HTTP ${response.status}` });
        continue;
      }
      html = (await response.text()).slice(0, MAX_HTML_BYTES);
    } catch (error) {
      skipped.push({ url: indexUrl, reason: error instanceof Error ? error.message : "fetch failed" });
      continue;
    }
    inspected += 1;

    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    for (const href of hrefs) {
      if (inserted >= limit) break;
      const absolute = absolutise(href, indexUrl);
      if (!absolute || !/\.pdf($|\?)/i.test(absolute)) continue;
      const filename = decodeURIComponent(absolute.split("/").pop() ?? "");
      if (!ACADEMIC_FILE.test(filename)) continue;
      if (!sameHost(absolute, indexUrl) && !sameHost(absolute, `https://${source.domain}`)) {
        skipped.push({ url: absolute, reason: "different host from the declared source" });
        continue;
      }

      // Global URL dedupe: a PDF already recorded anywhere is not re-queued.
      const exists = await env.DB.prepare("SELECT 1 AS found FROM discovered_candidates WHERE url = ? LIMIT 1")
        .bind(absolute)
        .first<{ found: number }>();
      if (exists?.found) {
        skipped.push({ url: absolute, reason: "already discovered" });
        continue;
      }

      await env.DB.prepare(
        `INSERT OR IGNORE INTO discovered_candidates
           (id, run_id, url, domain, title, source_id, score, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          runId,
          absolute.slice(0, 2000),
          new URL(absolute).hostname.replace(/^www\./, ""),
          filename.slice(0, 500),
          source.id,
          // Recency and explicit scheme/year in the filename raise the score.
          source.credibility + (/202[5-9]/.test(filename) ? 0.15 : 0),
          "Linked from the official index page",
        )
        .run();
      inserted += 1;

      await env.DB.prepare(
        `UPDATE discovery_sources
            SET last_checked_at = datetime('now'), success_count = success_count + 1
          WHERE id = ?`,
      )
        .bind(source.id)
        .run();
    }
  }

  await env.DB.prepare(
    `UPDATE discovery_runs SET status = 'completed', finished_at = datetime('now'), stats = ?, error = NULL
      WHERE id = ?`,
  )
    .bind(JSON.stringify({ sources: sources.results.length, inspected, inserted, skipped: skipped.slice(0, 40) }), runId)
    .run();
}
