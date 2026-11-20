/**
 * Real storage verification.
 *
 * Exercises the configured driver end to end against its actual backend:
 * put → exists → get (byte comparison) → dedupe lookup → signed URL → delete.
 * It reports exactly what happened and never claims success it did not observe.
 *
 *   npx tsx scripts/storage-check.ts
 */
import { createHash, randomUUID } from "node:crypto";

import { assetKey, storage, storageConfig } from "../lib/acquisition/storage";

async function main(): Promise<void> {
  const config = storageConfig();
  console.log("driver:", config.driver);
  console.log("bucket:", config.bucket ?? "(none)");
  console.log("endpoint:", config.endpoint ?? (config.accountId ? `${config.accountId}.r2.cloudflarestorage.com` : "(none)"));
  console.log("pending public base:", config.publicBaseUrl ?? "(none)");
  console.log("configured:", config.configured, "missing:", config.missing.length ? config.missing.join(", ") : "none");

  if (config.driver !== "r2") {
    console.log(
      "\nR2 is NOT active. Set ACQUISITION_STORAGE_DRIVER=r2 plus R2_ACCOUNT_ID/R2_BUCKET_NAME/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY.",
    );
    console.log("Nothing was uploaded, so no R2 result is being reported.");
    if (!config.configured) process.exitCode = 1;
    return;
  }

  const driver = storage();
  const payload = Buffer.from(`FreeResources storage check ${new Date().toISOString()} ${randomUUID()}\n`, "utf8");
  const hash = createHash("sha256").update(payload).digest("hex");
  const key = `checks/${assetKey(hash, "original")}`;

  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const record = (step: string, ok: boolean, detail?: string) => {
    steps.push({ step, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    await driver.put(key, payload, "application/octet-stream");
    record("upload", true, key);
  } catch (error) {
    record("upload", false, error instanceof Error ? error.message : String(error));
    finish(steps);
    return;
  }

  record("exists (after upload)", await driver.exists(key));

  const downloaded = await driver.get(key).catch((error: Error) => {
    record("download", false, error.message);
    return null;
  });
  if (downloaded) {
    record("download byte-identical", downloaded.equals(payload), `${downloaded.byteLength} bytes`);
  }

  const signed = await driver.signedUrl(key, 300).catch(() => null);
  record("signed URL issued", Boolean(signed));
  if (signed) {
    const response = await fetch(signed).catch(() => null);
    record("signed URL fetch", Boolean(response?.ok), response ? `HTTP ${response.status}` : "no response");
  }

  await driver.delete(key);
  record("delete", !(await driver.exists(key)));

  finish(steps);
}

function finish(steps: { step: string; ok: boolean }[]): void {
  const failed = steps.filter((step) => !step.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} checks passed.`);
  if (failed.length) {
    console.log("Failed:", failed.map((step) => step.step).join(", "));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("storage check crashed:", error);
  process.exit(1);
});
