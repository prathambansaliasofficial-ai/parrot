/**
 * FreeResources PDF processing container service.
 *
 * POST /process  (application/pdf body, x-compression-profile header)
 *   → { pageCount, text, compressedBase64, compressedPageCount, savingPercent, ghostscript, notes }
 *
 * GET /health
 *   → { ok, ghostscript, qpdf }
 *
 * Stateless by design: nothing is persisted here. R2 holds documents, D1 holds
 * state, so the container can be stopped at any time.
 */
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || 8080);
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;

const PROFILES = {
  balanced: { preset: "/ebook", dpi: 150 },
  scanned: { preset: "/ebook", dpi: 220 },
  archive: { preset: "/printer", dpi: 300 },
  economy: { preset: "/screen", dpi: 110 },
};

function run(command, args, timeoutMs = 180_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function version(command) {
  const result = await run(command, ["--version"], 10_000);
  return result.code === 0 ? `${result.stdout}${result.stderr}`.trim().split("\n")[0] : null;
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BYTES) throw new Error(`Body exceeded ${MAX_BYTES} bytes.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function inspectAndExtract(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const notes = [];
  const pages = Math.min(doc.numPages, 25);
  const parts = [];
  let chars = 0;
  for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    parts.push(`[page ${pageNo}] ${text}`);
    chars += text.length;
    if (chars >= MAX_TEXT_CHARS) break;
  }
  if (chars === 0) notes.push("No extractable text: the document may be a scan.");
  const pageCount = doc.numPages;
  await task.destroy().catch(() => undefined);
  return { pageCount, text: parts.join("\n").slice(0, MAX_TEXT_CHARS), notes };
}

async function compress(buffer, profile) {
  const settings = PROFILES[profile] ?? PROFILES.balanced;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fr-pdf-"));
  const inputPath = path.join(dir, "input.pdf");
  const outputPath = path.join(dir, "output.pdf");
  try {
    await fs.writeFile(inputPath, buffer);
    const result = await run("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.5",
      `-dPDFSETTINGS=${settings.preset}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dDetectDuplicateImages=true",
      `-dColorImageResolution=${settings.dpi}`,
      `-dGrayImageResolution=${settings.dpi}`,
      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);
    if (result.code !== 0) return { ok: false, reason: (result.stderr || "ghostscript failed").slice(0, 400) };
    const output = await fs.readFile(outputPath);
    if (output.byteLength >= buffer.byteLength) {
      return { ok: false, reason: "Compression did not reduce the file size; the original is used." };
    }
    const check = await run("qpdf", ["--check", outputPath], 60_000);
    if (check.code !== 0) {
      return { ok: false, reason: `Compressed PDF failed structural validation: ${check.stderr.slice(0, 300)}` };
    }
    return { ok: true, bytes: output, profile, preset: settings.preset };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    const [ghostscript, qpdf] = await Promise.all([version("gs"), version("qpdf")]);
    return json(response, ghostscript ? 200 : 503, { ok: Boolean(ghostscript), ghostscript, qpdf });
  }

  if (request.method === "POST" && request.url === "/process") {
    const profile = String(request.headers["x-compression-profile"] || "balanced");
    let buffer;
    try {
      buffer = await readBody(request);
    } catch (error) {
      return json(response, 413, { error: error instanceof Error ? error.message : "Body too large." });
    }
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return json(response, 415, { error: "Not a PDF: missing %PDF- signature." });
    }

    try {
      const inspected = await inspectAndExtract(buffer);
      const compressed = await compress(buffer, profile);
      const notes = [...inspected.notes];
      if (!compressed.ok) notes.push(compressed.reason);
      return json(response, 200, {
        pageCount: inspected.pageCount,
        text: inspected.text,
        compressedBase64: compressed.ok ? compressed.bytes.toString("base64") : null,
        compressedPageCount: compressed.ok ? inspected.pageCount : null,
        savingPercent: compressed.ok
          ? Math.round((1 - compressed.bytes.byteLength / buffer.byteLength) * 1000) / 10
          : null,
        ghostscript: (await version("gs")) ?? null,
        profile,
        notes,
      });
    } catch (error) {
      return json(response, 422, { error: error instanceof Error ? error.message : "Processing failed." });
    }
  }

  json(response, 404, { error: "not_found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[pdf-container] listening on :${PORT}`);
});
