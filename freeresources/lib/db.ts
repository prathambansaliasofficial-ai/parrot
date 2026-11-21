import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** Resolved lazily so a worker that loads .env after imports still gets the path. */
function dbPath(): string {
  if (process.env.DATABASE_PATH) return path.resolve(process.env.DATABASE_PATH);
  // Vercel's runtime filesystem is read-only apart from /tmp. Cloudflare Workers
  // use D1 and never reach this code path.
  if (process.env.VERCEL) return path.join("/tmp", "freeresources.db");
  return path.join(process.cwd(), "db", "freeresources.db");
}

let instance: Database.Database | null = null;

/**
 * Returns the shared SQLite connection, creating the database and applying the
 * baseline schema on first use. Safe to call from server components and routes.
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);

  // Additive acquisition schema (AKTU academic intelligence). Kept in its own
  // file so the baseline schema stays readable and both stay idempotent.
  db.exec(fs.readFileSync(path.join(process.cwd(), "db", "acquisition.sql"), "utf8"));

  // Columns added after the first release. CREATE TABLE IF NOT EXISTS does not
  // alter existing databases, so apply additive migrations explicitly.
  const additions: [table: string, column: string, ddl: string][] = [
    [
      "resources",
      "college_id",
      "ALTER TABLE resources ADD COLUMN college_id TEXT REFERENCES colleges(id) ON DELETE SET NULL",
    ],
    [
      "contributions",
      "user_id",
      "ALTER TABLE contributions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL",
    ],
    ["discovery_sources", "index_url", "ALTER TABLE discovery_sources ADD COLUMN index_url TEXT"],
    [
      "document_assets",
      "document_type",
      "ALTER TABLE document_assets ADD COLUMN document_type TEXT",
    ],
    [
      "document_assets",
      "covers_semesters",
      "ALTER TABLE document_assets ADD COLUMN covers_semesters TEXT",
    ],
  ];
  for (const [table, column, ddl] of additions) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) db.exec(ddl);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_resources_college ON resources(college_id)");

  ensureAdminAccount(db);

  instance = db;
  return db;
}

const DEFAULT_ADMIN_EMAIL = "admin@freeresources.in";
/**
 * Local-development fallback only. Production refuses this value outright — see
 * `ensureAdminAccount`. It is intentionally the same string the project used to
 * ship as a "default credential"; keeping it here lets an existing local
 * database stay usable while making it impossible to bootstrap a deployment
 * with it.
 */
const DEFAULT_ADMIN_PASSWORD = "FreeResources@2026";
const MIN_ADMIN_PASSWORD_LENGTH = 12;

/**
 * True for a deployable build. `NODE_ENV` covers `next start` / any container;
 * `VERCEL_ENV` covers preview and production deployments, where `NODE_ENV` is
 * also "production" but the build step can run without secrets present.
 */
function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
}

/**
 * Guarantees an administrator exists so /admin is reachable in every
 * environment. The previous flow only created the account through
 * `npm run db:seed`, which a deployment never runs — leaving the portal
 * permanently stuck on "log in" with an empty users table.
 *
 * Security rules:
 * - Existing administrators are never touched or overwritten.
 * - The check is for an `admin` row, not just any user: a student signing up
 *   first must not permanently block administrator bootstrap.
 * - Outside production, the documented development password is used when
 *   `ADMIN_PASSWORD` is unset, so a fresh checkout works offline.
 * - In production, bootstrap only runs with an explicit `ADMIN_PASSWORD` that
 *   is not the documented development password and is at least 12 characters.
 *   Otherwise it logs an error and creates nothing; /admin stays locked rather
 *   than accepting a publicly known password.
 */
export function ensureAdminAccount(db: Database.Database): void {
  const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number };
  if (Number(admins.c) > 0) return;

  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const configured = process.env.ADMIN_PASSWORD?.trim() ?? "";

  if (isProductionRuntime()) {
    if (!configured) {
      console.error(
        "[freeresources] No administrator exists and ADMIN_PASSWORD is not set. Refusing to create an account with the development password in production; set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) and restart.",
      );
      return;
    }
    if (configured === DEFAULT_ADMIN_PASSWORD || configured.length < MIN_ADMIN_PASSWORD_LENGTH) {
      console.error(
        `[freeresources] Refusing to create the administrator: ADMIN_PASSWORD is the documented development password or shorter than ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (email === DEFAULT_ADMIN_EMAIL) {
      console.warn(
        "[freeresources] ADMIN_EMAIL is unset, so the administrator uses the documented address. Set ADMIN_EMAIL to a mailbox you control.",
      );
    }
  }

  const password = configured || DEFAULT_ADMIN_PASSWORD;
  const salt = randomBytes(16).toString("hex");
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

  try {
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, role) VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'admin')",
    ).run(email, "Administrator", hash);
  } catch {
    // The email is unique. If it already belongs to a non-admin account, that
    // account must not be silently promoted or replaced.
    console.error(
      `[freeresources] Could not create the administrator: ${email} already exists as a non-admin account. Promote it deliberately or choose another ADMIN_EMAIL.`,
    );
    return;
  }

  if (configured) {
    console.info("[freeresources] Created the bootstrap administrator from ADMIN_EMAIL / ADMIN_PASSWORD.");
  } else {
    console.warn(
      "[freeresources] Created the local administrator with the development password. Set ADMIN_EMAIL and ADMIN_PASSWORD to override it; production refuses this password.",
    );
  }
}

export type Row = Record<string, unknown>;

/** Convenience helper: fetch the first row or undefined. */
export function one<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

/** Convenience helper: fetch all rows. */
export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/** Convenience helper: run a mutation and return the change info. */
export function run(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).run(...params);
}

export function transaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const wrapped = db.transaction(fn);
  return wrapped(db);
}
