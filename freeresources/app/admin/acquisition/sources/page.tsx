import ConfirmForm from "@/components/admin/confirm-form";
import { listSources } from "@/lib/acquisition/store";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const sources = listSources();

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Registry</p>
        <h1 className="mt-1 text-2xl">Discovery sources</h1>
        <p className="mt-1 text-sm text-muted">
          Domains the hunter may read. Access status and restrictions are recorded; robots.txt is always honoured.
        </p>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Add a source</h2>
        <ConfirmForm className="mt-3 grid gap-3 sm:grid-cols-5 sm:items-end">
          <input type="hidden" name="action" value="save_source" />
          <div className="sm:col-span-2">
            <label htmlFor="domain" className="label">Domain</label>
            <input id="domain" name="domain" placeholder="aktu.ac.in" className="input" required />
          </div>
          <div>
            <label htmlFor="label" className="label">Label</label>
            <input id="label" name="label" placeholder="AKTU official" className="input" />
          </div>
          <div>
            <label htmlFor="kind" className="label">Type</label>
            <select id="kind" name="kind" className="input" defaultValue="official">
              <option value="official">Official</option>
              <option value="college">College</option>
              <option value="repository">Repository</option>
              <option value="search">Search</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label htmlFor="credibility" className="label">Credibility</label>
            <input id="credibility" name="credibility" type="number" step="0.05" min={0} max={1} defaultValue={0.9} className="input" />
          </div>
          <div className="sm:col-span-5">
            <button type="submit" className="btn btn-primary btn-sm">Add source</button>
          </div>
        </ConfirmForm>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-xs">
            <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Domain</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Credibility</th>
                <th className="px-4 py-2 font-semibold">Access</th>
                <th className="px-4 py-2 font-semibold">Success / failed</th>
                <th className="px-4 py-2 font-semibold">Last checked</th>
                <th className="px-4 py-2 font-semibold">Next check</th>
                <th className="px-4 py-2 text-right font-semibold">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sources.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No sources registered. Add <code>aktu.ac.in</code> to start.
                  </td>
                </tr>
              )}
              {sources.map((source) => (
                <tr key={source.id} className={source.enabled ? "" : "opacity-60"}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{source.label}</p>
                    <p className="text-[0.62rem] text-muted">{source.domain}</p>
                  </td>
                  <td className="px-4 py-2 capitalize text-muted">{source.kind}</td>
                  <td className="px-4 py-2 font-mono">{Number(source.credibility).toFixed(2)}</td>
                  <td className="px-4 py-2 capitalize">{source.access_status}</td>
                  <td className="px-4 py-2">
                    <span className="text-primary">{source.success_count}</span> /{" "}
                    <span className="text-red-700">{source.failure_count}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(source.last_checked_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(source.next_check_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <ConfirmForm className="inline">
                      <input type="hidden" name="action" value="toggle_source" />
                      <input type="hidden" name="sourceId" value={source.id} />
                      <button type="submit" className="text-[0.68rem] text-primary hover:underline">
                        {source.enabled ? "Disable" : "Enable"}
                      </button>
                    </ConfirmForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[0.68rem] text-muted">
        Request rates are intentionally conservative. Sources that disallow crawling in robots.txt are skipped automatically and
        recorded in the job timeline.
      </p>
    </div>
  );
}
