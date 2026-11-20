import fs from "node:fs";
import path from "node:path";

/**
 * Loads .env / .env.local for entry points that do not run inside Next.js
 * (the worker and the verification scripts). Next.js loads these itself, but a
 * plain `tsx scripts/worker.ts` process would otherwise start with no R2, AI or
 * search credentials and silently degrade to local storage.
 *
 * Existing process.env values always win, so a real deployment's injected
 * secrets are never overwritten by a stray file on disk.
 */
let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const file of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), file);
    let contents: string;
    try {
      contents = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
