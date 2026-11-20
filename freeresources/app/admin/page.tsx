import Link from "next/link";
import { AlertCircle, ArrowRight, Download, FileUp, Search, Upload } from "lucide-react";

import {
  getAdminStats,
  getRecentDownloads,
  getRecentSearches,
  listAdminRequests,
  listAdminTickets,
  listContributions,
} from "@/lib/admin";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  const stats = getAdminStats();
  const pending = listContributions("pending").slice(0, 5);
  const requests = listAdminRequests("new").slice(0, 4);
  const tickets = listAdminTickets("open").slice(0, 4);
  const downloads = getRecentDownloads(5);
  const searches = getRecentSearches(6);

  const cards = [
    { label: "Universities", value: stats.universities, href: "/admin/entities/universities" },
    { label: "Programmes", value: stats.programmes, href: "/admin/entities/programmes" },
    { label: "Subjects", value: stats.subjects, href: "/admin/entities/subjects" },
    { label: "Resources", value: stats.resources, href: "/admin/resources", note: `${stats.published} published` },
    { label: "Downloads", value: stats.downloads, href: "/admin/analytics" },
    { label: "Registered users", value: stats.users, href: "/admin/contributions" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-1 text-2xl">Library overview</h1>
          <p className="mt-1 text-sm text-muted">Live counts from the database. Nothing on this page is mocked.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/resources/new" className="btn btn-primary btn-sm">
            <Upload size={14} /> Upload resource
          </Link>
          <Link href="/admin/entities/universities/new" className="btn btn-secondary btn-sm">
            Add university
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card p-4 transition hover:border-primary/40">
            <p className="text-[0.66rem] uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-1 font-display text-2xl">{card.value}</p>
            {card.note && <p className="text-[0.66rem] text-muted">{card.note}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Pending contributions", value: stats.pendingContributions, href: "/admin/contributions", icon: FileUp },
          { label: "New requests", value: stats.pendingRequests, href: "/admin/requests", icon: AlertCircle },
          { label: "Open tickets", value: stats.openTickets, href: "/admin/tickets", icon: AlertCircle },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`card flex items-center gap-3 p-4 transition hover:border-primary/40 ${
              item.value > 0 ? "border-accent/40" : ""
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <item.icon size={16} />
            </span>
            <div>
              <p className="font-display text-xl leading-none">{item.value}</p>
              <p className="mt-1 text-[0.7rem] text-muted">{item.label}</p>
            </div>
            <ArrowRight size={14} className="ml-auto text-muted" />
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">Review queue</h2>
            <Link href="/admin/contributions" className="text-[0.7rem] text-primary hover:underline">
              All contributions
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">Nothing waiting for review.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{item.title}</p>
                    <p className="text-[0.68rem] text-muted">
                      {item.universityShort} · {item.contributorName} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <Link href={`/admin/contributions/${item.id}`} className="btn btn-secondary btn-sm shrink-0">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">Recent search activity</h2>
            <span className="inline-flex items-center gap-1 text-[0.68rem] text-muted">
              <Search size={11} /> {stats.searches} total
            </span>
          </div>
          {searches.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">No searches recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {searches.map((item, index) => (
                <li key={`${item.query}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="truncate text-xs">{item.query}</span>
                  <span className="shrink-0 text-[0.68rem] text-muted">{item.resultCount} results</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">New requests</h2>
            <Link href="/admin/requests" className="text-[0.7rem] text-primary hover:underline">
              Manage
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">No new requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {requests.map((item) => (
                <li key={item.id} className="px-4 py-2.5">
                  <p className="text-xs">
                    {item.subjectName} {item.subjectCode && <span className="font-mono text-muted">{item.subjectCode}</span>}
                  </p>
                  <p className="text-[0.68rem] text-muted">
                    {item.universityShort} · {item.programmeShort} · Sem {item.semester ?? "?"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">Open tickets</h2>
            <Link href="/admin/tickets" className="text-[0.7rem] text-primary hover:underline">
              Manage
            </Link>
          </div>
          {tickets.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">No open tickets.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tickets.map((item) => (
                <li key={item.id} className="px-4 py-2.5">
                  <p className="truncate text-xs">{item.subject}</p>
                  <p className="text-[0.68rem] text-muted">
                    {item.publicId} · {item.category.replace(/-/g, " ")} · {item.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium">Most downloaded</h2>
          <span className="inline-flex items-center gap-1 text-[0.68rem] text-muted">
            <Download size={11} /> real counters
          </span>
        </div>
        {downloads.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted">No downloads recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {downloads.map((item) => (
              <li key={item.slug} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/resource/${item.slug}`} className="truncate text-xs hover:text-primary">
                  {item.title}
                </Link>
                <span className="shrink-0 font-mono text-[0.68rem] text-muted">
                  {item.shortName} · {item.downloadCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
