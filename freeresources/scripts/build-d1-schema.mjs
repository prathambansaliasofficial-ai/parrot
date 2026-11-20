/**
 * Generates versioned D1 migrations from the existing SQLite schema.
 *
 * The SQLite schema is the source of truth for shape; D1 is SQLite, so the only
 * transformations needed are removing PRAGMA statements (D1 manages foreign keys
 * itself) and splitting baseline vs. acquisition schemas into ordered migrations.
 *
 *   node scripts/build-d1-schema.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "db", "d1");
fs.mkdirSync(outDir, { recursive: true });

function transform(file) {
  return fs
    .readFileSync(path.join(root, "db", file), "utf8")
    .split(/\r?\n/)
    .filter((line) => !/^\s*PRAGMA\b/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const migrations = [
  {
    name: "0001_baseline.sql",
    header:
      "-- D1 migration 0001: baseline site schema (universities, programmes, branches,\n" +
      "-- subjects, resources, users, contributions, requests, tickets, audit log).\n" +
      "-- Generated from db/schema.sql by scripts/build-d1-schema.mjs — edit the SQLite\n" +
      "-- schema and regenerate rather than hand-editing this file.\n\n",
    body: transform("schema.sql"),
  },
  {
    name: "0002_acquisition.sql",
    header:
      "-- D1 migration 0002: AKTU academic intelligence & acquisition schema.\n" +
      "-- Generated from db/acquisition.sql. Additive; does not touch the baseline.\n\n",
    body: transform("acquisition.sql"),
  },
];

for (const migration of migrations) {
  const target = path.join(outDir, migration.name);
  fs.writeFileSync(target, `${migration.header}${migration.body}\n`);
  console.log(`wrote ${path.relative(root, target)} (${migration.body.split("\n").length} lines)`);
}
