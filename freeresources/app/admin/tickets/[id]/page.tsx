import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";

import StatusForm from "@/components/admin/status-form";
import { getAdminTicket } from "@/lib/admin";
import { formatDate } from "@/lib/format";

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getAdminTicket(id);
  if (!row) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/tickets" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> Back to tickets
        </Link>
        <h1 className="mt-2 text-2xl">{row.subject}</h1>
        <p className="mt-1 font-mono text-[0.7rem] text-muted">
          {row.publicId} · {id}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Message</h2>
              <span className="text-[0.68rem] text-muted">{formatDate(row.createdAt)}</span>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-muted">{row.message}</p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 text-[0.7rem] text-muted">
              <span className="capitalize">{row.category.replace(/-/g, " ")}</span>
              <span>·</span>
              <span>{row.name}</span>
              <span>·</span>
              <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <Mail size={12} /> {row.email}
              </a>
            </div>
          </section>

          {row.resourceSlug && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Related resource</h2>
              <Link href={`/resource/${row.resourceSlug}`} target="_blank" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                {row.resourceTitle ?? row.resourceSlug} <ExternalLink size={13} />
              </Link>
            </section>
          )}

          {row.adminReply && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Saved reply</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{row.adminReply}</p>
            </section>
          )}
        </div>

        <StatusForm
          endpoint={`/api/admin/tickets/${id}`}
          status={row.status}
          statuses={STATUSES}
          notes={row.adminReply}
          notesField="admin_reply"
          notesLabel="Reply / resolution note"
          notesPlaceholder="Replaced the corrupted file and confirmed the download works."
        />
      </div>
    </div>
  );
}
