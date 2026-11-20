import dns from "node:dns/promises";
import net from "node:net";

/**
 * Network safety for autonomous fetching.
 *
 * Every URL is validated before it is used: scheme, embedded credentials, port,
 * literal addresses and DNS answers are all checked so a discovered link cannot
 * be turned into an SSRF probe of the local network or a cloud metadata service.
 * robots.txt is consulted for every host before a document is retrieved.
 */

export class FetchBlocked extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
  }
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 40 * 1024 * 1024;

function allowLocal(): boolean {
  return process.env.ACQUISITION_ALLOW_LOCAL_FETCH === "1";
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
  }
  return false;
}

export async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlocked("That is not a valid URL.", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchBlocked("Only http and https sources are allowed.", "bad_scheme");
  }
  if (url.username || url.password) {
    throw new FetchBlocked("URLs with embedded credentials are not fetched.", "credentials_in_url");
  }
  const local = allowLocal();
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!local && port !== 80 && port !== 443) {
    throw new FetchBlocked("Non-standard ports are not fetched.", "bad_port");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host) && !local) {
      throw new FetchBlocked("Private network addresses are not fetched.", "private_address");
    }
    return url;
  }
  if (host === "localhost" && !local) {
    throw new FetchBlocked("Local hostnames are not fetched.", "private_address");
  }
  try {
    const answers = await dns.lookup(host, { all: true, verbatim: true });
    if (!local && answers.some((answer) => isPrivateAddress(answer.address))) {
      throw new FetchBlocked("That host resolves to a private address.", "private_address");
    }
  } catch (error) {
    if (error instanceof FetchBlocked) throw error;
    throw new FetchBlocked("That source host could not be resolved.", "dns_failure");
  }
  return url;
}

/* ------------------------------------------------------------------ robots */

type RobotsRules = { disallow: string[]; allow: string[]; fetchedAt: number };
const robotsCache = new Map<string, RobotsRules>();
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;

function rulesFrom(text: string, agent: string): RobotsRules {
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    } else if (key === "allow" && current) {
      if (value) current.allow.push(value);
    }
  }
  const wanted = agent.toLowerCase();
  const matching = groups.filter((group) =>
    group.agents.some((value) => value === wanted || (value === "*" && false)),
  );
  const fallback = groups.filter((group) => group.agents.includes("*"));
  const chosen = matching.length ? matching : fallback;
  return {
    disallow: chosen.flatMap((group) => group.disallow),
    allow: chosen.flatMap((group) => group.allow),
    fetchedAt: Date.now(),
  };
}

export const ACQUISITION_USER_AGENT = "FreeResourcesBot/1.0 (+https://freeresources.in/about)";

export async function robotsAllows(target: URL): Promise<boolean> {
  const origin = target.origin;
  const cached = robotsCache.get(origin);
  let rules = cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS ? cached : null;
  if (!rules) {
    try {
      const robotsUrl = new URL("/robots.txt", origin);
      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": ACQUISITION_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
      });
      const text = response.ok ? (await response.text()).slice(0, 200_000) : "";
      rules = rulesFrom(text, "FreeResourcesBot");
    } catch {
      rules = { disallow: [], allow: [], fetchedAt: Date.now() };
    }
    robotsCache.set(origin, rules);
  }
  const targetPath = `${target.pathname}${target.search}`;
  const matches = (rule: string) => {
    const clean = rule.replace(/\*$/, "");
    return clean === "/" ? true : targetPath.startsWith(clean);
  };
  if (rules.allow.some(matches)) return true;
  return !rules.disallow.some(matches);
}

/* ------------------------------------------------------------------- fetch */

export type FetchedDocument = {
  bytes: Buffer;
  finalUrl: string;
  contentType: string;
  pageUrl: string | null;
};

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared && declared > maxBytes) {
    throw new FetchBlocked(`Document is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`, "too_large");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FetchBlocked(`Document is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`, "too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

/** Fetches a PDF with SSRF checks, robots respect, redirect limits and size caps. */
export async function fetchPdf(url: string, options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<FetchedDocument> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let current = await assertFetchableUrl(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await robotsAllows(current))) {
      throw new FetchBlocked(`robots.txt disallows ${current.pathname} on ${current.host}.`, "robots_disallowed");
    }
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": ACQUISITION_USER_AGENT, Accept: "application/pdf,*/*;q=0.5" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new FetchBlocked("The source redirected without a location.", "bad_redirect");
      current = await assertFetchableUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw new FetchBlocked(`The source answered with HTTP ${response.status}.`, `http_${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const bytes = await readCapped(response, maxBytes);
    const looksPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    if (contentType.includes("text/html") || (!looksPdf && contentType.includes("text/"))) {
      throw new FetchBlocked("The source returned a web page, not a PDF.", "not_pdf");
    }
    if (!looksPdf) {
      throw new FetchBlocked("The downloaded file is not a PDF.", "not_pdf");
    }
    return { bytes, finalUrl: current.toString(), contentType: "application/pdf", pageUrl: null };
  }

  throw new FetchBlocked("Too many redirects.", "too_many_redirects");
}
