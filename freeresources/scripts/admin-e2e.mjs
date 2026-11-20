/**
 * End-to-end checks for the admin workflows against a running dev server.
 * Usage: node scripts/admin-e2e.mjs
 * Creates and then removes its own records; restores homepage settings.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const BASE = process.env.E2E_BASE || "http://localhost:3100";
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "db", "freeresources.db");

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail && !condition ? ` — ${detail}` : ""}`);
}

async function call(urlPath, { method = "GET", body, cookie, headers = {} } = {}) {
  return fetch(`${BASE}${urlPath}`, {
    method,
    body,
    redirect: "manual",
    headers: {
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
  });
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const tag = Date.now().toString(36).toUpperCase();
const created = { resources: [], universityId: null, contribution: null, request: null, ticket: null, userId: null };
let adminCookie = "";
let originalSettings = {};

try {
  /* ---------------------------------------------------------------- auth */
  const unauthPage = await call("/admin");
  check("signed-out /admin redirects", unauthPage.status === 307, `got ${unauthPage.status}`);

  const unauthApi = await call("/api/admin/entities/universities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Nope" }),
  });
  check("signed-out admin API returns 401", unauthApi.status === 401, `got ${unauthApi.status}`);

  const login = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@freeresources.in", password: "FreeResources@2026" }),
  });
  adminCookie = cookieFrom(login);
  check("admin login", login.status === 200 && adminCookie.includes("fr_session"), `got ${login.status}`);

  const evil = await call("/api/admin/settings", {
    method: "PATCH",
    cookie: adminCookie,
    headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
    body: JSON.stringify({ home_headline: "x", home_subhead: "x" }),
  });
  check("foreign origin blocked", evil.status === 403, `got ${evil.status}`);

  /* --------------------------------------------------------------- pages */
  for (const page of [
    "/admin",
    "/admin/entities/universities",
    "/admin/entities/colleges",
    "/admin/entities/programmes",
    "/admin/entities/branches",
    "/admin/entities/subjects",
    "/admin/entities/categories",
    "/admin/entities/academic-years",
    "/admin/entities/faqs",
    "/admin/entities/community-links",
    "/admin/entities/advertisements",
    "/admin/entities/announcements",
    "/admin/resources",
    "/admin/resources/new",
    "/admin/contributions",
    "/admin/requests",
    "/admin/tickets",
    "/admin/settings",
    "/admin/analytics",
    "/admin/entities/universities/new",
    "/admin/entities/colleges/new",
    "/admin/entities/programmes/new",
    "/admin/entities/branches/new",
    "/admin/entities/subjects/new",
    "/admin/entities/categories/new",
    "/admin/entities/academic-years/new",
    "/admin/entities/faqs/new",
    "/admin/entities/community-links/new",
    "/admin/entities/advertisements/new",
    "/admin/entities/announcements/new",
  ]) {
    const response = await call(page, { cookie: adminCookie });
    check(`page ${page}`, response.status === 200, `got ${response.status}`);
  }

  /* ---------------------------------------------------------- entity CRUD */
  const invalidEntity = await call("/api/admin/entities/universities", {
    method: "POST",
    cookie: adminCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "" }),
  });
  check("entity validation rejects empty name", invalidEntity.status === 422, `got ${invalidEntity.status}`);

  const createUniversity = await call("/api/admin/entities/universities", {
    method: "POST",
    cookie: adminCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `E2E Test University ${tag}`,
      short_name: "E2E",
      slug: "",
      state: "Delhi",
      city: "New Delhi",
      type: "Private",
      status: "draft",
      website: "",
      logo_url: "",
      featured: false,
      description: "Temporary record created by the admin end-to-end test.",
    }),
  });
  const createdUniversity = await json(createUniversity);
  created.universityId = createdUniversity.id ?? null;
  check("create university", createUniversity.status === 201 && created.universityId, `got ${createUniversity.status}`);

  if (created.universityId) {
    const updateUniversity = await call(`/api/admin/entities/universities/${created.universityId}`, {
      method: "PATCH",
      cookie: adminCookie,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `E2E Test University ${tag} Updated`,
        short_name: "E2E",
        slug: "",
        state: "Delhi",
        city: "New Delhi",
        type: "Private",
        status: "draft",
        website: "",
        logo_url: "",
        featured: false,
        description: "Updated by the end-to-end test.",
      }),
    });
    check("update university", updateUniversity.status === 200, `got ${updateUniversity.status}`);

    const editPage = await call(`/admin/entities/universities/${created.universityId}`, { cookie: adminCookie });
    check("entity edit page", editPage.status === 200, `got ${editPage.status}`);

    const search = await call(`/admin/entities/universities?q=${encodeURIComponent(tag)}`, { cookie: adminCookie });
    const searchHtml = await search.text();
    check("university searchable in admin", search.status === 200 && searchHtml.includes(tag));
  }

  /* ------------------------------------------------------- resource upload */
  const subject = db
    .prepare(
      `SELECT s.id, s.code, s.name, s.semester, u.slug AS universitySlug
         FROM subjects s JOIN universities u ON u.id=s.university_id
        WHERE u.status='published' AND s.status='published' LIMIT 1`,
    )
    .get();
  const category = db.prepare(`SELECT id, slug FROM categories ORDER BY sort_order LIMIT 1`).get();
  check("have seed subject/category for upload", Boolean(subject && category));

  const uploads = fs
    .readdirSync(path.join(process.cwd(), "storage", "uploads"))
    .filter((file) => file.endsWith(".pdf"));
  const pdfBytes = fs.readFileSync(path.join(process.cwd(), "storage", "uploads", uploads[0]));

  let resourceId = null;
  let resourceSlug = null;
  if (subject && category && pdfBytes) {
    const title = `E2E Uploaded Resource ${tag}`;
    const form = new FormData();
    form.set("title", title);
    form.set("subject_id", subject.id);
    form.set("category_id", category.id);
    form.set("session", "2025-26");
    form.set("description", "Temporary file created by the admin end-to-end test.");
    form.set("status", "published");
    form.set("contributor_name", "E2E runner");
    form.set("file", new File([pdfBytes], "e2e-upload.pdf", { type: "application/pdf" }));

    const upload = await call("/api/admin/resources", { method: "POST", cookie: adminCookie, body: form });
    const uploadBody = await json(upload);
    resourceId = uploadBody.id ?? null;
    resourceSlug = uploadBody.slug ?? null;
    if (resourceId) created.resources.push(resourceId);
    check("upload PDF resource", upload.status === 201 && resourceId, `got ${upload.status} ${JSON.stringify(uploadBody)}`);

    if (resourceId) {
      const resourceEditPage = await call(`/admin/resources/${resourceId}`, { cookie: adminCookie });
      check("resource edit page", resourceEditPage.status === 200, `got ${resourceEditPage.status}`);

      const fileRow = db.prepare(`SELECT id FROM resource_files WHERE resource_id=? LIMIT 1`).get(resourceId);
      check("resource file stored", Boolean(fileRow));
      const preview = await call(`/api/admin/resources/${resourceId}/files/${fileRow?.id}`, { cookie: adminCookie });
      check("admin file preview", preview.status === 200 && preview.headers.get("content-type") === "application/pdf");

      const publicPage = await call(`/resource/${resourceSlug}`);
      check("uploaded resource is public", publicPage.status === 200, `got ${publicPage.status}`);

      const editForm = new FormData();
      editForm.set("title", `${title} Revised`);
      editForm.set("subject_id", subject.id);
      editForm.set("category_id", category.id);
      editForm.set("session", "2025-26");
      editForm.set("description", "Updated by the end-to-end test.");
      editForm.set("status", "published");
      editForm.set("contributor_name", "E2E runner");
      const edit = await call(`/api/admin/resources/${resourceId}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: editForm,
      });
      check("edit resource without new file", edit.status === 200, `got ${edit.status}`);

      const invalidForm = new FormData();
      invalidForm.set("title", "Invalid PDF test");
      invalidForm.set("subject_id", subject.id);
      invalidForm.set("category_id", category.id);
      invalidForm.set("status", "draft");
      invalidForm.set("file", new File([Buffer.from("this is not a pdf")], "fake.pdf", { type: "application/pdf" }));
      const invalidUpload = await call("/api/admin/resources", { method: "POST", cookie: adminCookie, body: invalidForm });
      check("invalid PDF rejected", invalidUpload.status === 422, `got ${invalidUpload.status}`);
    }
  }

  /* -------------------------------------------------- contribution review */
  const publicSubject = db
    .prepare(
      `SELECT s.name, s.code, s.semester, u.slug AS universitySlug, p.slug AS programmeSlug
         FROM subjects s
         JOIN universities u ON u.id=s.university_id
         JOIN programmes p ON p.id=s.programme_id
        WHERE u.status='published' AND s.status='published' AND s.code IS NOT NULL LIMIT 1`,
    )
    .get();

  if (publicSubject && category && pdfBytes) {
    const contributionTitle = `E2E Contribution ${tag}`;
    const form = new FormData();
    form.set("title", contributionTitle);
    form.set("university", publicSubject.universitySlug);
    form.set("programme", publicSubject.programmeSlug);
    form.set("semester", String(publicSubject.semester));
    form.set("subjectName", publicSubject.name);
    form.set("subjectCode", publicSubject.code);
    form.set("category", category.slug);
    form.set("session", "2025-26");
    form.set("description", "Contribution created by the admin end-to-end test.");
    form.set("contributorName", "E2E Contributor");
    form.set("email", "e2e-contributor@example.com");
    form.set("file", new File([pdfBytes], "e2e-contribution.pdf", { type: "application/pdf" }));

    const submit = await call("/api/contribute", { method: "POST", body: form });
    const submitBody = await json(submit);
    check("public contribution accepted", submit.status === 201, `got ${submit.status} ${JSON.stringify(submitBody)}`);

    const contribution = db.prepare(`SELECT * FROM contributions WHERE public_id=?`).get(submitBody.reference);
    if (contribution) {
      created.contribution = { id: contribution.id, file: contribution.file_path };
      const detail = await call(`/admin/contributions/${contribution.id}`, { cookie: adminCookie });
      check("contribution detail page", detail.status === 200, `got ${detail.status}`);

      const preview = await call(`/api/admin/contributions/${contribution.id}/file`, { cookie: adminCookie });
      check("contribution file preview", preview.status === 200 && preview.headers.get("content-type") === "application/pdf");

      const approve = await call(`/api/admin/contributions/${contribution.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", notes: "Verified by end-to-end test." }),
      });
      const approveBody = await json(approve);
      check("approve contribution", approve.status === 200 && approveBody.resourceSlug, `got ${approve.status}`);

      if (approveBody.resourceId) created.resources.push(approveBody.resourceId);
      if (approveBody.resourceSlug) {
        const resourcePage = await call(`/resource/${approveBody.resourceSlug}`);
        check("approved contribution is public", resourcePage.status === 200, `got ${resourcePage.status}`);
        const searchPage = await call(`/search?q=${encodeURIComponent(contributionTitle)}`);
        const searchHtml = await searchPage.text();
        check("approved contribution appears in search", searchPage.status === 200 && searchHtml.includes(contributionTitle));
      }

      const duplicate = await call(`/api/admin/contributions/${contribution.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", notes: "" }),
      });
      check("duplicate approval rejected", duplicate.status === 409, `got ${duplicate.status}`);
    }
  }

  /* ------------------------------------------------------ requests/tickets */
  if (publicSubject && category) {
    const requestCreate = await call("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        university: publicSubject.universitySlug,
        programme: publicSubject.programmeSlug,
        semester: publicSubject.semester,
        subjectName: `E2E Request ${tag}`,
        subjectCode: publicSubject.code,
        category: category.slug,
        email: "e2e-request@example.com",
        details: "Temporary request created by the end-to-end test.",
      }),
    });
    const requestBody = await json(requestCreate);
    check("public request accepted", requestCreate.status === 201, `got ${requestCreate.status}`);

    const request = db.prepare(`SELECT id FROM requests WHERE public_id=?`).get(requestBody.reference);
    if (request) {
      created.request = request.id;
      const update = await call(`/api/admin/requests/${request.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress", notes: "Sourcing this paper." }),
      });
      check("update request status", update.status === 200, `got ${update.status}`);
      const page = await call(`/admin/requests/${request.id}`, { cookie: adminCookie });
      check("request detail page", page.status === 200, `got ${page.status}`);
    }

    const ticketCreate = await call("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "E2E Ticket",
        email: "e2e-ticket@example.com",
        category: "technical-issue",
        subject: `E2E Ticket ${tag}`,
        message: "Temporary ticket created by the end-to-end test to verify admin status changes.",
      }),
    });
    const ticketBody = await json(ticketCreate);
    check("public ticket accepted", ticketCreate.status === 201, `got ${ticketCreate.status}`);

    const ticket = db.prepare(`SELECT id FROM tickets WHERE public_id=?`).get(ticketBody.reference);
    if (ticket) {
      created.ticket = ticket.id;
      const update = await call(`/api/admin/tickets/${ticket.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", notes: "Test resolution note." }),
      });
      check("update ticket status", update.status === 200, `got ${update.status}`);
      const page = await call(`/admin/tickets/${ticket.id}`, { cookie: adminCookie });
      check("ticket detail page", page.status === 200, `got ${page.status}`);
    }
  }

  /* --------------------------------------------------------------- settings */
  originalSettings = Object.fromEntries(
    db.prepare(`SELECT key, value FROM site_settings`).all().map((row) => [row.key, row.value]),
  );
  const settingsSave = await call("/api/admin/settings", {
    method: "PATCH",
    cookie: adminCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      home_headline: `E2E Headline ${tag}`,
      home_subhead: "Temporary subheading written by the end-to-end test.",
    }),
  });
  check("save homepage settings", settingsSave.status === 200, `got ${settingsSave.status}`);
  const home = await call("/");
  const homeHtml = await home.text();
  check("homepage reflects saved headline", home.status === 200 && homeHtml.includes(`E2E Headline ${tag}`));

  const restore = await call("/api/admin/settings", {
    method: "PATCH",
    cookie: adminCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      home_headline: originalSettings.home_headline,
      home_subhead: originalSettings.home_subhead,
    }),
  });
  check("restore homepage settings", restore.status === 200, `got ${restore.status}`);

  /* ------------------------------------------------------------- non-admin */
  const studentLogin = await call("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "E2E Student",
      email: `e2e-student-${tag}@example.com`,
      password: "TestingPassword123!",
    }),
  });
  const studentCookie = cookieFrom(studentLogin);
  const studentBody = await json(studentLogin);
  created.userId = studentBody.user?.id ?? null;
  check("student signup for RBAC check", studentLogin.status === 201 && studentCookie, `got ${studentLogin.status}`);

  const studentPage = await call("/admin", { cookie: studentCookie });
  check("student blocked from /admin", studentPage.status === 307, `got ${studentPage.status}`);

  const studentApi = await call("/api/admin/entities/universities", {
    method: "POST",
    cookie: studentCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Nope" }),
  });
  check("student blocked from admin API", studentApi.status === 403, `got ${studentApi.status}`);
} catch (error) {
  console.error("E2E run threw:", error);
  check("test run completed", false, error instanceof Error ? error.message : String(error));
} finally {
  /* --------------------------------------------------------------- cleanup */
  try {
    for (const id of created.resources) {
      await call(`/api/admin/resources/${id}`, { method: "DELETE", cookie: adminCookie });
    }
    if (created.universityId) {
      await call(`/api/admin/entities/universities/${created.universityId}`, { method: "DELETE", cookie: adminCookie });
    }
    if (created.contribution) {
      db.prepare(`DELETE FROM contributions WHERE id=?`).run(created.contribution.id);
      try {
        fs.unlinkSync(path.join(process.cwd(), "storage", "uploads", created.contribution.file));
      } catch {
        // file already gone
      }
    }
    if (created.request) db.prepare(`DELETE FROM requests WHERE id=?`).run(created.request);
    if (created.ticket) db.prepare(`DELETE FROM tickets WHERE id=?`).run(created.ticket);
    if (created.userId) db.prepare(`DELETE FROM users WHERE id=?`).run(created.userId);
    if (originalSettings.home_headline) {
      const upsert = db.prepare(
        `INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      );
      for (const [key, value] of Object.entries(originalSettings)) upsert.run(key, value);
    }
  } catch (cleanupError) {
    console.error("Cleanup issue:", cleanupError);
  }
  db.close();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("Failures:");
    for (const failure of failed) console.log(` - ${failure.name}${failure.detail ? `: ${failure.detail}` : ""}`);
    process.exitCode = 1;
  }
}
