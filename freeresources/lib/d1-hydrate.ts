import { ensureAdminAccount, getDb, type Row } from "./db";
import { d1Config, d1Query } from "./d1-remote";

/**
 * Copies the Cloudflare D1 contents into the local SQLite database.
 *
 * Why this exists: the site's data layer is synchronous `better-sqlite3`, which
 * cannot talk to D1 directly, and Vercel gives every instance a fresh, empty
 * `/tmp` filesystem. Without this step a deployment always renders an empty
 * catalog even though the D1 database holds real rows.
 *
 * Called once per server instance from instrumentation.ts. It only runs when D1
 * is configured AND the local database has no catalog data yet, so local
 * development (which fills its own database) is never touched.
 *
 * All rows are fetched before anything is written: if a D1 read fails, the local
 * database is left exactly as it was.
 */

const TABLES_WITH_DATA = ["universities", "resources"] as const;

export type HydrationResult = {
  skipped: boolean;
  reason?: string;
  rows: number;
  tables: Record<string, number>;
};

function tableNames(db: ReturnType<typeof getDb>): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((row) => row.name);
}

/** Foreign-key dependency order, so inserts satisfy FKs. */
function orderedTables(db: ReturnType<typeof getDb>, tables: string[]): string[] {
  const deps = new Map<string, Set<string>>(tables.map((name) => [name, new Set<string>()]));
  for (const name of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { table?: string }[];
    for (const fk of fks) {
      if (fk.table && fk.table !== name && deps.has(fk.table)) deps.get(name)!.add(fk.table);
    }
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (seen.has(table) || visiting.has(table)) return;
    visiting.add(table);
    for (const dep of deps.get(table) ?? []) visit(dep);
    visiting.delete(table);
    seen.add(table);
    ordered.push(table);
  };
  for (const name of tables) visit(name);
  for (const name of tables) if (!seen.has(name)) ordered.push(name);
  return ordered;
}

function columnsOf(db: ReturnType<typeof getDb>, table: string): string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((column) => column.name);
}

function countHasData(db: ReturnType<typeof getDb>): boolean {
  for (const table of TABLES_WITH_DATA) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number };
      if (Number(row.c) > 0) return true;
    } catch {
      // Table missing in an older local schema: ignore.
    }
  }
  return false;
}

export async function hydrateFromD1(): Promise<HydrationResult> {
  if (!d1Config()) {
    return { skipped: true, reason: "Cloudflare D1 is not configured", rows: 0, tables: {} };
  }

  const db = getDb();
  if (countHasData(db)) {
    return { skipped: true, reason: "Local database already has catalog data", rows: 0, tables: {} };
  }

  // 1. Read everything first. A failed read aborts without touching local data.
  const snapshot: { table: string; columns: string[]; rows: Row[] }[] = [];
  for (const table of orderedTables(db, tableNames(db))) {
    const rows = await d1Query<Row>(`SELECT * FROM "${table}"`);
    if (rows.length === 0) continue;

    // D1 may hold columns this schema has not migrated yet, and vice versa:
    // only copy the intersection so a mismatch is harmless.
    const local = columnsOf(db, table);
    const columns = Object.keys(rows[0]).filter((column) => local.includes(column));
    if (columns.length === 0) continue;

    snapshot.push({ table, columns, rows: rows.map((row) => row) });
  }

  // 2. Swap in one transaction: delete dependants first, then insert parents
  //    first so foreign keys hold.
  const inserted: Record<string, number> = {};
  let total = 0;

  db.pragma("defer_foreign_keys = true");
  try {
    const swap = db.transaction(() => {
      for (const { table } of [...snapshot].reverse()) {
        db.prepare(`DELETE FROM "${table}"`).run();
      }
      for (const { table, columns, rows } of snapshot) {
        const statement = db.prepare(
          `INSERT OR REPLACE INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) ` +
            `VALUES (${columns.map(() => "?").join(", ")})`,
        );
        for (const row of rows) statement.run(...columns.map((column) => row[column] as never));
        inserted[table] = rows.length;
        total += rows.length;
      }
    });
    swap();
  } finally {
    db.pragma("defer_foreign_keys = false");
  }

  // The swap may have removed the bootstrap admin if D1 has no users table.
  ensureAdminAccount(db);

  return { skipped: false, rows: total, tables: inserted };
}

/** Inspection helper: reports what a hydration would copy, without writing. */
export async function describeD1(): Promise<{ tables: Record<string, number>; rows: number }> {
  const tables = await d1Query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const counts: Record<string, number> = {};
  let rows = 0;
  for (const { name } of tables) {
    const [row] = await d1Query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${name}"`);
    const count = Number(row?.c ?? 0);
    if (count > 0) {
      counts[name] = count;
      rows += count;
    }
  }
  return { tables: counts, rows };
}
