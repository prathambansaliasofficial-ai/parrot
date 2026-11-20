import Link from "next/link";

import { all } from "@/lib/db";
import { listAssets } from "@/lib/acquisition/store";
import { storageConfig } from "@/lib/acquisition/storage";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const assets = listAssets(100);
  const versions = all<{ id: string; asset_id: string; kind: string; size_bytes: number; profile: string | null }>(
    "SELECT id, asset_id, kind, size_bytes, profile FROM document_versions ORDER BY kind DESC",
  );
  const storageInfo = storageConfig();
  const totalOriginal = assets.reduce((sum, asset) => sum + Number(asset.size_bytes), 0);
  const totalOptimized = versions.filter((v) => v.kind === "optimized").reduce((sum, v) => sum + Number(v.size_bytes), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Document library</p>
        <h1 className="mt-1 text-2xl">Acquired documents</h1>
        <p className="mt-1 text-sm text-muted">
          Originals are never overwritten. Optimised derivatives are stored separately and only used when they validate.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Assets", String(assets.length)],
          ["Original size", formatBytes(totalOriginal)],
          ["Optimised size", formatBytes(totalOptimized)],
          ["Storage", storageInfo.driver === "r2" ? "Cloudflare R2" : "Local disk"],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-[0.62rem] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-0.5 font-display text-lg">{value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        {assets.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">No documents have been acquired yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Document</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Pages</th>
                  <th className="px-4 py-2 font-semibold">Original</th>
                  <th className="px-4 py-2 font-semibold">Optimised</th>
                  <th className="px-4 py-2 font-semibold">Text</th>
                  <th className="px-4 py-2 font-semibold">Added</th>
                  <th className="px-4 py-2 text-right font-semibold">Versions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {assets.map((asset) => {
                  const assetVersions = versions.filter((version) => version.asset_id === asset.id);
                  const saving = asset.optimized_bytes
                    ? Math.round((1 - asset.optimized_bytes / asset.size_bytes) * 1000) / 10
                    : null;
                  return (
                    <tr key={asset.id} className="hover:bg-paper/60">
                      <td className="max-w-[20rem] px-4 py-2">
                        <p className="truncate font-medium">{asset.original_filename}</p>
                        <p className="truncate font-mono text-[0.6rem] text-muted">{asset.sha256.slice(0, 16)}…</p>
                      </td>
                      <td className="max-w-[14rem] px-4 py-2">
                        {asset.source_url ? (
                          <a href={asset.source_url} target="_blank" rel="noreferrer" className="block truncate text-muted hover:text-primary">
                            {asset.source_domain}
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{asset.page_count ?? "—"}</td>
                      <td className="px-4 py-2 font-mono">{formatBytes(asset.size_bytes)}</td>
                      <td className="px-4 py-2 font-mono">
                        {asset.optimized_bytes ? (
                          <span>
                            {formatBytes(asset.optimized_bytes)}{" "}
                            <span className="text-primary">{saving !== null ? `−${saving}%` : ""}</span>
                          </span>
                        ) : (
                          <span className="text-muted">not generated</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{asset.hasText ? "extracted" : "none"}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(asset.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        {assetVersions.map((version) => (
                          <a
                            key={version.id}
                            href={`/api/admin/acquisition/files/${version.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-[0.66rem] text-primary hover:underline"
                          >
                            {version.kind}
                          </a>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[0.68rem] text-muted">
        Serving versions appear on the public subject pages.{" "}
        <Link href="/admin/resources" className="text-primary hover:underline">
          Open the resource library
        </Link>{" "}
        to see them alongside uploaded files.
      </p>
    </div>
  );
}
