/**
 * Applies db/schema.sql to the configured database. Idempotent.
 * Run: node scripts/migrate.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const dbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(root, "db", "freeresources.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
db.exec(fs.readFileSync(path.join(root, "db", "acquisition.sql"), "utf8"));

for (const [table, column, ddl] of [
  ["resources", "college_id", "ALTER TABLE resources ADD COLUMN college_id TEXT REFERENCES colleges(id) ON DELETE SET NULL"],
  ["contributions", "user_id", "ALTER TABLE contributions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL"],
]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) db.exec(ddl);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_resources_college ON resources(college_id)");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => row.name);

console.log(`Schema applied to ${dbPath}`);
console.log(`${tables.length} tables: ${tables.join(", ")}`);
