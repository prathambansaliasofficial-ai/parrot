import Link from "next/link";
import { Download, FileText, Search, Users } from "lucide-react";

import {
  getAdminStats,
  getAuditLog,
  getDownloadSeries,
  getRecentDownloads,
  getRecentSearches,
  getTopSearches,
} from "@/lib/admin";
import { formatCount, formatDate } from "@/lib/format";

export default function AdminAnalyticsPage() {
  const stats = getAdminStats();
  const series = [...getDownloadSeries()].reverse();
  const topSearches = getTopSearches(8);
  const recentSearches = getRecentSearches(8);
  const topDownloads = getRecentDownloads(8);
  const audits = getAuditLog(15);
  const maxDay = Math.max(1, ...series.map((day) => day.n));

  const cards = [
    { label: "Downloads", value: stats.downloads, icon: Download, href: "/admin/resources" },
    { label: "Resources", value: stats.resources, icon: FileText, href: "/admin/resources" },
    { label: "Searches", value: stats.searches, icon: Search, href: "/admin/analytics" },
    { label: "Users", value: stats.users, icon: Users, href: "/admin/contributions" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Insights</p>
        <h1 className="mt-1 text-2xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Every number here is recorded by the app. Downloads and views are counted on real file requests.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card p-4 transition hover:border-primary/40">
            <div className="flex items-center justify-between">
              <p className="text-[0.66rem] uppercase tracking-wide text-muted">{card.label}</p>
              <card.icon size={14} className="text-muted" />
            </div>
            <p className="mt-1 font-display text-2xl">{formatCount(card.value)}</p>
          </Link>
        ))}
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Downloads · last 14 recorded days</h2>
          <span className="text-[0.68rem] text-muted">{formatCount(stats.downloads)} all time</span>
        </div>
        {series.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted">
            No downloads recorded yet. Download a published resource to populate this chart.
          </p>
        ) : (
          <div className="mt-5 flex h-40 items-end gap-1.5">
            {series.map((day) => (
              <div key={day.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${day.day}: ${day.n}`}>
                <span className="text-[0.6rem] text-muted opacity-0 group-hover:opacity-100">{day.n}</span>
                <div
                  className="w-full rounded-t bg-primary/70 transition group-hover:bg-primary"
                  style={{ height: `${Math.max(4, (day.n / maxDay) * 100)}%` }}
                />
                <span className="text-[0.55rem] text-muted">{day.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Most searched</h2>
            <span className="text-[0.66rem] text-muted">grouped by query</span>
          </div>
          {topSearches.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-muted">No searches yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Query</th>
                  <th className="px-4 py-2 text-right font-semibold">Searches</th>
                  <th className="px-4 py-2 text-right font-semibold">Best results</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topSearches.map((row) => (
                  <tr key={row.query}>
                    <td className="max-w-[16rem] truncate px-4 py-2">{row.query}</td>
                    <td className="px-4 py-2 text-right text-muted">{row.hits}</td>
                    <td className="px-4 py-2 text-right text-muted">{row.results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Most downloaded</h2>
            <Link href="/admin/resources" className="text-[0.7rem] text-primary hover:underline">
              All resources
            </Link>
          </div>
          {topDownloads.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-muted">No downloads recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {topDownloads.map((row, index) => (
                <li key={row.slug} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-4 font-mono text-[0.65rem] text-muted">{index + 1}</span>
                  <Link href={`/resource/${row.slug}`} target="_blank" className="min-w-0 flex-1 truncate text-xs hover:text-primary">
                    {row.title}
                  </Link>
                  <span className="text-[0.68rem] text-muted">{formatCount(row.downloadCount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Recent searches</h2>
          </div>
          {recentSearches.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-muted">No searches recorded.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentSearches.map((row, index) => (
                <li key={`${row.query}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="truncate text-xs">{row.query}</span>
                  <span className="shrink-0 text-[0.65rem] text-muted">
                    {row.resultCount} results · {formatDate(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Admin activity</h2>
            <span className="text-[0.66rem] text-muted">latest 15</span>
          </div>
          {audits.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-muted">No admin actions recorded.</p>
          ) : (
            <ul className="divide-y divide-line">
              {audits.map((row, index) => (
                <li key={`${row.entity}-${index}`} className="px-4 py-2">
                  <p className="text-xs">
                    <span className="font-medium capitalize">{row.action.replace(/_/g, " ")}</span>{" "}
                    <span className="text-muted">{row.entity}</span>
                    {row.detail && <span className="text-muted"> · {row.detail}</span>}
                  </p>
                  <p className="text-[0.63rem] text-muted">
                    {row.email ?? "system"} · {formatDate(row.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
