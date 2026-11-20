/**
 * Minimal Cloudflare D1 client over the REST API.
 *
 * The Next.js app is deployed to Vercel, which has no D1 binding, so reading the
 * Cloudflare database has to happen over HTTP. The credentials are read-only in
 * practice: they are used to copy rows into the local SQLite database at
 * startup (see lib/d1-hydrate.ts), never to serve queries directly.
 *
 * Configure with:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *   CLOUDFLARE_D1_API_TOKEN   (or CLOUDFLARE_API_TOKEN)
 */

const DEFAULT_API_BASE = "https://api.cloudflare.com/client/v4";

export type D1Config = {
  accountId: string;
  databaseId: string;
  token: string;
  apiBase: string;
};

type D1Response = {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { results?: Record<string, unknown>[]; success?: boolean }[];
};

/** Returns the D1 connection settings, or null when any part is missing. */
export function d1Config(): D1Config | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_D1_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) return null;
  return {
    accountId,
    databaseId,
    token,
    apiBase: (process.env.CLOUDFLARE_D1_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, ""),
  };
}

/** Runs one SQL statement against D1 and returns its rows. */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const config = d1Config();
  if (!config) {
    throw new Error(
      "Cloudflare D1 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_D1_API_TOKEN.",
    );
  }

  const response = await fetch(
    `${config.apiBase}/accounts/${config.accountId}/d1/database/${config.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => ({}))) as D1Response;
  if (!response.ok || payload.success === false) {
    const detail = payload.errors?.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(`D1 query failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  return (payload.result?.[0]?.results ?? []) as T[];
}
