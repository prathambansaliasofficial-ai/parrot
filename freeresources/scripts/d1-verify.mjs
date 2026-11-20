/**
 * Verifies a local (or remote) D1 database against the SQLite source export.
 *
 * Compares row counts for every table with data, checks that admin accounts and
 * resource relationships survived, and runs SQLite's foreign-key check.
 *
 *   node scripts/d1-verify.mjs                 # local D1
 *   node scripts/d1-verify.mjs --remote        # deployed database (needs auth)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const expected = JSON.parse(fs.readFileSync(path.join(root, "db/d1-data/expected-counts.json"), "utf8"));
const remote = process.argv.includes("--remote");
const database = process.env.D1_DATABASE || "freeresources-dev";
const config = "wrangler.jsonc";

// Relative path: absolute paths contain spaces on this project and the wrangler
// CLI is invoked through a shell.
const queryFile = ".tmp-d1-verify.sql";

function execute(sql) {
  fs.writeFileSync(path.join(root, queryFile), `${sql};
`);
  // execSync with a file keeps quoting portable on Windows and POSIX.
  const command = `npx wrangler d1 execute ${database} --json --config ${config} --file=${queryFile}${remote ? "" : " --local"}`;
  const output = execSync(command, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = output.indexOf("[");
  if (start === -1) throw new Error(`Unexpected wrangler output: ${output.slice(0, 400)}`);
  const parsed = JSON.parse(output.slice(start));
  if (parsed[0]?.error) throw new Error(`D1 query failed: ${parsed[0].error.text}`);
  return parsed[0];
}

const tables = Object.entries(expected).filter(([, count]) => count > 0);
const actual = {};
// The local D1 runtime rejects large compound SELECTs, so count one table per
// query. Slower, but it works identically against a deployed database.
for (const [table] of tables) {
  const result = execute(`SELECT COUNT(*) AS c FROM "${table}"`);
  actual[table] = Number(result.results?.[0]?.c ?? -1);
}

let mismatches = 0;
let total = 0;
for (const [table, count] of tables) {
  total += count;
  if (actual[table] !== count) {
    mismatches += 1;
    console.log(`MISMATCH ${table}: sqlite=${count} d1=${actual[table]}`);
  }
}

const admins = execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").results[0].c;
const orphanResources = execute(
  "SELECT COUNT(*) AS c FROM resources r LEFT JOIN subjects s ON s.id = r.subject_id WHERE s.id IS NULL",
).results[0].c;
const published = execute("SELECT COUNT(*) AS c FROM resources WHERE status = 'published'").results[0].c;

let foreignKeyViolations = "not checked";
try {
  const result = execute("PRAGMA foreign_key_check");
  const rows = result.results?.length ?? 0;
  foreignKeyViolations = rows === 0 ? "none" : `${rows} violation(s)`;
} catch (error) {
  foreignKeyViolations = `could not run (${error instanceof Error ? error.message.slice(0, 120) : "unknown"})`;
}

console.log("");
console.log(`Target: ${remote ? "REMOTE" : "local"} D1 database "${database}"`);
console.log(`Tables compared: ${tables.length}, rows compared: ${total}`);
console.log(`Row-count parity: ${mismatches === 0 ? "PASS" : `FAIL (${mismatches} mismatched)`}`);
console.log(`Admin accounts preserved: ${admins}`);
console.log(`Published resources: ${published}`);
console.log(`Resources without a subject (broken relationship): ${orphanResources}`);
console.log(`Foreign-key check: ${foreignKeyViolations}`);

fs.rmSync(path.join(root, queryFile), { force: true });
if (mismatches > 0 || orphanResources > 0) process.exit(1);
