/**
 * Real PDF compression verification against an actual document.
 *
 * Downloads a PDF through the same SSRF/robots-guarded fetcher the worker uses,
 * validates it, then runs every configured compression profile and reports the
 * real numbers: original size, derivative size, saving, page parity and how much
 * extractable text survived. Nothing is published.
 *
 *   npx tsx scripts/pdf-compress-check.ts <pdf-url>
 */
import { compressPdf, extractText, ghostscriptBinary, inspectPdf } from "../lib/acquisition/pdf";
import { fetchPdf } from "../lib/acquisition/safety";
import { COMPRESSION_PROFILES, type CompressionProfile } from "../lib/acquisition/types";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/pdf-compress-check.ts <pdf-url>");
    process.exit(1);
  }

  console.log("ghostscript:", ghostscriptBinary() ?? "NOT INSTALLED");
  if (!ghostscriptBinary()) process.exitCode = 1;

  console.log("fetching:", url);
  const fetched = await fetchPdf(url, { maxBytes: 60 * 1024 * 1024 });
  const original = fetched.bytes;
  const inspection = await inspectPdf(original);
  console.log(
    `original: ${(original.byteLength / 1024).toFixed(1)} KB · pages ${inspection.pageCount} · valid ${inspection.valid}`,
  );
  if (!inspection.valid) {
    console.error("The downloaded PDF is not valid; nothing to compress.");
    process.exit(1);
  }

  const originalText = await extractText(original);
  console.log(`original extractable text: ${originalText.length.toLocaleString()} characters\n`);

  const rows: string[] = [];
  for (const profile of Object.keys(COMPRESSION_PROFILES) as CompressionProfile[]) {
    const result = await compressPdf(original, profile, inspection.pageCount);
    if (result.status !== "optimized") {
      rows.push(`${profile.padEnd(9)} ${result.status.toUpperCase().padEnd(12)} ${result.reason}`);
      continue;
    }
    const text = await extractText(result.bytes);
    const retained = originalText.length ? Math.round((text.length / originalText.length) * 100) : null;
    rows.push(
      `${profile.padEnd(9)} optimized    ${(result.sizeBytes / 1024).toFixed(1)} KB  ` +
        `-${result.savingPercent}%  pages ${result.pageCount}/${inspection.pageCount}  text ${retained ?? "?"}%`,
    );
  }

  console.log("profile   result       size        saving  pages        text retained");
  console.log("-----------------------------------------------------------------------");
  for (const row of rows) console.log(row);
}

main().catch((error) => {
  console.error("compression check failed:", error);
  process.exit(1);
});
