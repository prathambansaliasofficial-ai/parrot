import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Storage abstraction for acquired academic documents.
 *
 * The local driver is the default and needs no credentials. The R2 driver is an
 * S3-compatible Cloudflare R2 client (SigV4, server-side only) selected when the
 * R2_* environment variables are present. Nothing in the browser ever sees a key.
 *
 * Required R2 configuration (either bucket variable name is accepted):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME (or R2_BUCKET), optional R2_ENDPOINT, R2_PUBLIC_BASE_URL
 */

export type StorageDriverId = "local" | "r2";

export type StorageConfig = {
  driver: StorageDriverId;
  localRoot: string;
  endpoint?: string;
  accountId?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
  configured: boolean;
  missing: string[];
  /** True when R2 was requested but credentials are incomplete. */
  fellBack: boolean;
};

export function storageConfig(): StorageConfig {
  const env = process.env;
  const localRoot = env.ACQUISITION_STORAGE_DIR
    ? path.resolve(env.ACQUISITION_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "acquisition");

  const bucket = env.R2_BUCKET_NAME || env.R2_BUCKET || undefined;
  const endpoint = (env.R2_ENDPOINT || "").replace(/\/+$/, "") || undefined;

  const missing: string[] = [];
  if (!bucket) missing.push("R2_BUCKET_NAME");
  if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!env.R2_ACCOUNT_ID && !endpoint) missing.push("R2_ACCOUNT_ID (or R2_ENDPOINT)");

  const wantsR2 = env.ACQUISITION_STORAGE_DRIVER === "r2";
  const driver: StorageDriverId = wantsR2 && missing.length === 0 ? "r2" : "local";

  return {
    driver,
    localRoot,
    endpoint,
    accountId: env.R2_ACCOUNT_ID,
    bucket,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    configured: missing.length === 0,
    missing,
    fellBack: wantsR2 && missing.length > 0,
  };
}

export interface StorageDriver {
  id: StorageDriverId;
  put(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** A time-limited download URL, or null when the driver serves local files. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string | null>;
  localPath(key: string): string | null;
}

/* ------------------------------------------------------------------- local */

class LocalDriver implements StorageDriver {
  id: StorageDriverId = "local";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!key || key.includes("..") || path.isAbsolute(key)) {
      throw new Error("Invalid storage key.");
    }
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error("Invalid storage key.");
    }
    return target;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // Already gone.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(): Promise<string | null> {
    return null;
  }

  localPath(key: string): string {
    return this.resolve(key);
  }
}

/* ---------------------------------------------------------------------- r2 */

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function hex(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** RFC 3986 encoding required by SigV4. */
function uriEncode(value: string, keepSlash = false): string {
  return value
    .split("")
    .map((char) => {
      if (/[A-Za-z0-9_.~-]/.test(char)) return char;
      if (char === "/" && keepSlash) return char;
      return Array.from(new TextEncoder().encode(char))
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    })
    .join("");
}

class R2Driver implements StorageDriver {
  id: StorageDriverId = "r2";
  private readonly host: string;
  private readonly region = "auto";
  private readonly service = "s3";

  constructor(private readonly config: StorageConfig) {
    if (config.endpoint) {
      this.host = new URL(config.endpoint).host;
    } else {
      this.host = `${config.accountId}.r2.cloudflarestorage.com`;
    }
  }

  private presign(method: "GET" | "HEAD" | "PUT" | "DELETE", key: string, expires: number) {
    if (!this.config.accessKeyId || !this.config.secretAccessKey || !this.config.bucket) {
      throw new Error("R2 storage is not configured.");
    }
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const canonicalUri = `/${this.config.bucket}/${uriEncode(key, true)}`;
    const params: [string, string][] = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", `${this.config.accessKeyId}/${scope}`],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", String(expires)],
      ["X-Amz-SignedHeaders", "host"],
    ];
    const canonicalQuery = params
      .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
      .sort()
      .join("&");
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${this.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hex(canonicalRequest)].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.config.secretAccessKey}`, dateStamp), this.region), this.service),
      "aws4_request",
    );
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
    return `https://${this.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private async send(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    key: string,
    body?: Buffer,
    contentType = "application/pdf",
  ) {
    const url = this.presign(method, key, 300);
    const headers: Record<string, string> = {};
    if (method === "PUT") {
      headers["Content-Type"] = contentType;
      headers["Content-Length"] = String(body?.byteLength ?? 0);
    }
    const response = await fetch(url, {
      method,
      body: body ? new Uint8Array(body) : undefined,
      headers,
    });
    if (!response.ok) {
      const detail = method === "PUT" ? (await response.text().catch(() => "")).slice(0, 300) : "";
      throw new Error(`R2 ${method} failed with ${response.status}${detail ? `: ${detail}` : ""}.`);
    }
    return response;
  }

  async put(key: string, bytes: Buffer, contentType = "application/pdf"): Promise<void> {
    await this.send("PUT", key, bytes, contentType);
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.send("GET", key);
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.send("DELETE", key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.send("HEAD", key);
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(key: string, expiresInSeconds = 900): Promise<string | null> {
    return this.presign("GET", key, Math.min(Math.max(expiresInSeconds, 60), 604800));
  }

  localPath(): string | null {
    return null;
  }
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;
  const config = storageConfig();
  if (config.fellBack) {
    console.warn(
      `[storage] ACQUISITION_STORAGE_DRIVER=r2 but R2 is incomplete (${config.missing.join(", ")}); using the local driver.`,
    );
  }
  cached = config.driver === "r2" ? new R2Driver(config) : new LocalDriver(config.localRoot);
  return cached;
}

/** Deterministic, hash-addressed object keys. Display names never identify objects. */
export function assetKey(sha256: string, kind: "original" | "optimized" = "original"): string {
  const prefix = sha256.slice(0, 2);
  return kind === "original"
    ? `assets/${prefix}/${sha256}.pdf`
    : `derivatives/${prefix}/${sha256}-optimized.pdf`;
}
