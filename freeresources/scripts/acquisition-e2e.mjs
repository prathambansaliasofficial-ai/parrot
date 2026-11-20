/**
 * End-to-end acceptance test for the acquisition system.
 *
 * Exercises the real HTTP API, the real worker process, the real SQLite schema
 * and real PDF bytes served over HTTP:
 *
 *   login → add URL → worker processing → approval → publication → duplicate rejection
 *
 * Requires the dev server to be running (BASE_URL, default http://localhost:3100)
 * and Ghostscript is optional (compression reports "unavailable" without it).
 *
 *   node scripts/acquisition-e2e.mjs
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import Database from "better-sqlite3";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "db", "freeresources.db");
const EMAIL = process.env.ADMIN_EMAIL || "admin@freeresources.in";
const PASSWORD = process.env.ADMIN_PASSWORD || "FreeResources@2026";
const PDF_PORT = Number(process.env.TEST_PDF_PORT || 4111);

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const nonce = Math.random().toString(36).slice(2, 10).toUpperCase();
  const pages = [
    ["DATA STRUCTURES (BCS301)", `AKTU B.Tech CSE Semester 3 syllabus — run ${nonce}`, "UNIT 1 Introduction to data structures, arrays, linked lists, stacks and queues."],
    ["UNIT 2 Trees, binary search trees, AVL trees and graph representations.", "UNIT 3 Sorting algorithms, hashing and file organisation.", ""],
    ["UNIT 4 Dynamic programming, greedy methods and complexity analysis.", "", ""],
  ];
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    let y = 780;
    for (const line of lines) {
      if (!line) continue;
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 24;
    }
  }
  return Buffer.from(await doc.save());
}

function runWorker() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/worker.ts", "--once"], {
      cwd: process.cwd(),
      env: { ...process.env, ACQUISITION_ALLOW_LOCAL_FETCH: "1", DATABASE_PATH: DB_PATH, WORKER_POLL_MS: "50" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}

async function api(pathname, options = {}, cookie = "") {
  const response = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 300);
  }
  return { status: response.status, data, cookie: response.headers.get("set-cookie") ?? "" };
}

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const raw = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const cookie = raw.map((value) => value.split(";")[0]).join("; ");
  return { status: response.status, cookie };
}

async function main() {
  const pdfBytes = await makePdf();
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/syllabus")) {
      response.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": String(pdfBytes.length) });
      response.end(pdfBytes);
      return;
    }
    response.writeHead(404).end("not found");
  });
  await new Promise((resolve) => server.listen(PDF_PORT, "127.0.0.1", resolve));
  const pdfUrl = `http://localhost:${PDF_PORT}/syllabus-ds.pdf`;

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const subject = db
    .prepare(
      `SELECT s.id, s.name, s.semester, u.slug AS university_slug
         FROM subjects s JOIN universities u ON u.id = s.university_id
        WHERE u.slug = 'aktu' AND s.status = 'published'
        ORDER BY s.semester LIMIT 1`,
    )
    .get();
  if (!subject) {
    console.error("No AKTU subject found; run scripts/seed.mjs and scripts/seed-aktu-acquisition.mjs first.");
    process.exit(1);
  }

  console.log(`\nAcquisition E2E against ${BASE} (subject: ${subject.name})\n`);

  // 0. Unauthenticated access is refused.
  const anonymous = await api("/api/admin/acquisition/actions", {
    method: "POST",
    body: JSON.stringify({ action: "start_discovery" }),
  });
  check("unauthenticated action is rejected", anonymous.status === 401 || anonymous.status === 403, `got ${anonymous.status}`);

  const session = await login();
  check("admin login", session.status === 200 && session.cookie.includes("fr_session"), `got ${session.status}`);

  // 1. A URL is queued.
  const queued = await api("/api/admin/acquisition/actions", {
    method: "POST",
    body: JSON.stringify({ action: "add_manual_url", url: pdfUrl, subjectId: subject.id }),
  }, session.cookie);
  check("URL queued for processing", queued.status === 200 && queued.data?.ok === true, JSON.stringify(queued.data));

  // 2. Worker processes it to the approval gate.
  const firstRun = await runWorker();
  check("worker exited cleanly", firstRun.code === 0, firstRun.output.slice(-500));

  const job = db
    // created_at has one-second resolution; rowid breaks ties deterministically
    // so the job this run just queued is the one inspected.
    .prepare("SELECT * FROM ingestion_jobs WHERE candidate_id IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get();
  check("job reached awaiting_approval", job?.state === "awaiting_approval", job ? `${job.state} @ ${job.stage}` : "no job");

  const asset = job?.asset_id ? db.prepare("SELECT * FROM document_assets WHERE id = ?").get(job.asset_id) : null;
  check("PDF validated with a page count", asset?.page_count === 3, asset ? String(asset.page_count) : "no asset");
  check("text was extracted", (asset?.text_content ?? "").length > 40, `${(asset?.text_content ?? "").length} chars`);
  const versions = asset ? db.prepare("SELECT * FROM document_versions WHERE asset_id = ?").all(asset.id) : [];
  check("original version recorded", versions.some((version) => version.kind === "original"));
  check(
    "optimised derivative is separate (or honestly absent)",
    versions.filter((version) => version.kind === "optimized").length <= 1,
  );
  check("source URL recorded", Boolean(asset?.source_url), asset?.source_url ?? "missing");

  // 3. Approval and publication.
  const approved = await api("/api/admin/acquisition/actions", {
    method: "POST",
    body: JSON.stringify({ action: "approve_job", jobId: job.id, filename: "AKTU_BTECH_CSE_SEM3_DATA-STRUCTURES_SYLLABUS.pdf" }),
  }, session.cookie);
  check("approval accepted", approved.status === 200 && approved.data?.ok === true, JSON.stringify(approved.data));

  const secondRun = await runWorker();
  check("worker published the document", secondRun.code === 0, secondRun.output.slice(-500));

  const done = db.prepare("SELECT * FROM ingestion_jobs WHERE id = ?").get(job.id);
  check("job completed", done?.state === "completed", done?.state);

  const resource = done?.published_resource_id
    ? db.prepare("SELECT * FROM resources WHERE id = ?").get(done.published_resource_id)
    : null;
  check("public resource published", resource?.status === "published", resource?.status ?? "missing");
  const files = resource ? db.prepare("SELECT * FROM resource_files WHERE resource_id = ?").all(resource.id) : [];
  check("serving file registered", files.length === 1 && files[0].size_bytes > 0);

  const syllabus = db
    .prepare("SELECT * FROM syllabus_versions WHERE source_asset_id = ?")
    .all(asset?.id ?? "");
  check("verified syllabus version attached", syllabus.length === 1, `${syllabus.length} rows`);
  const units = syllabus.length
    ? db.prepare("SELECT * FROM syllabus_units WHERE syllabus_version_id = ?").all(syllabus[0].id)
    : [];
  check("units parsed from the document", units.length >= 2, `${units.length} units`);

  // 4. Duplicate prevention.
  const again = await api("/api/admin/acquisition/actions", {
    method: "POST",
    body: JSON.stringify({ action: "add_manual_url", url: `${pdfUrl}?copy=1`, subjectId: subject.id }),
  }, session.cookie);
  check("second URL queued", again.status === 200, JSON.stringify(again.data));
  await runWorker();

  const duplicateJob = db
    .prepare("SELECT * FROM ingestion_jobs ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get();
  check("duplicate job skipped", duplicateJob?.state === "skipped", duplicateJob?.state);
  const assetCount = db.prepare("SELECT COUNT(*) AS count FROM document_assets WHERE sha256 = ?").get(asset?.sha256 ?? "");
  check("duplicate file not stored again", Number(assetCount.count) === 1, `${assetCount.count} assets with that hash`);

  // 5. Job controls.
  const retry = await api("/api/admin/acquisition/actions", {
    method: "POST",
    body: JSON.stringify({ action: "retry_job", jobId: duplicateJob.id }),
  }, session.cookie);
  check("retry re-queues a job", retry.status === 200 && retry.data?.ok === true);
  const retried = db.prepare("SELECT state FROM ingestion_jobs WHERE id = ?").get(duplicateJob.id);
  check("retried job is queued", retried?.state === "queued", retried?.state);

  const cancel = await api("/api/admin/acquisition/actions", {
    method: "POST",
    body: JSON.stringify({ action: "cancel_job", jobId: duplicateJob.id }),
  }, session.cookie);
  check("cancel stops a job", cancel.status === 200);
  const cancelled = db.prepare("SELECT state FROM ingestion_jobs WHERE id = ?").get(duplicateJob.id);
  check("cancelled job keeps its records", cancelled?.state === "cancelled" && Boolean(db.prepare("SELECT id FROM document_assets WHERE id = ?").get(asset.id)));

  // 6. Review queue and audit trail.
  const events = db.prepare("SELECT COUNT(*) AS count FROM ingestion_job_events WHERE job_id = ?").get(job.id);
  check("pipeline events recorded", Number(events.count) >= 8, `${events.count} events`);
  const audit = db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity IN ('ingestion_job','discovered_candidate')").get();
  check("admin actions audited", Number(audit.count) >= 3, `${audit.count} audit rows`);

  // 7. Coverage gaps reflect the new publication.
  const gap = db
    .prepare(
      `SELECT COUNT(*) AS count FROM resources r JOIN categories c ON c.id=r.category_id
        WHERE r.subject_id = ? AND r.status='published' AND c.group_slug='syllabus'`,
    )
    .get(subject.id);
  check("subject syllabus coverage incremented", Number(gap.count) >= 1);

  server.close();
  db.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
