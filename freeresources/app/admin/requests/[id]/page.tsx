import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";

import StatusForm from "@/components/admin/status-form";
import { getAdminRequest } from "@/lib/admin";
import { formatDate } from "@/lib/format";

const STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "closed", label: "Closed" },
];

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getAdminRequest(id);
  if (!row) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/requests" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> Back to requests
        </Link>
        <h1 className="mt-2 text-2xl">{row.subjectName}</h1>
        <p className="mt-1 font-mono text-[0.7rem] text-muted">
          {row.publicId} · {id}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Request</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ["University", row.universityName],
                ["Programme", row.programmeName],
                ["Branch", row.branchName ?? "Not specified"],
                ["Semester", row.semester ? String(row.semester) : "Not specified"],
                ["Subject code", row.subjectCode ?? "Not specified"],
                ["Category", row.categoryName ?? "Not specified"],
                ["Created", formatDate(row.createdAt)],
                ["Status", row.status.replace("_", " ")],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-line/60 pb-2">
                  <dt className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold">Student note</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{row.details ?? "No extra details were provided."}</p>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold">Contact</h2>
            <a href={`mailto:${row.email}?subject=${encodeURIComponent(`FreeResources request ${row.publicId}`)}`} className="btn btn-secondary btn-sm mt-2">
              <Mail size={14} /> {row.email}
            </a>
          </section>
        </div>

        <StatusForm
          endpoint={`/api/admin/requests/${id}`}
          status={row.status}
          statuses={STATUSES}
          notes={row.adminNotes}
          notesField="admin_notes"
          notesLabel="Internal notes"
          notesPlaceholder="Sourced from the 2024 batch; waiting on the scanned copy."
        />
      </div>
    </div>
  );
}
