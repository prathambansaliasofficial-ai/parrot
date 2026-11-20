import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";

import ContributionReview from "@/components/admin/contribution-review";
import { getContribution } from "@/lib/admin";
import { formatBytes, formatDate } from "@/lib/format";

export default async function ContributionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getContribution(id);
  if (!row) notFound();

  const value = (key: string) => {
    const raw = row[key];
    return raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  };

  const details: [string, string][] = [
    ["Reference", value("public_id")],
    ["University", value("university_name")],
    ["College", value("college_name")],
    ["Programme", value("programme_name")],
    ["Branch", value("branch_name")],
    ["Semester", value("semester")],
    ["Subject", `${value("subject_name")}${row.subject_code ? ` (${value("subject_code")})` : ""}`],
    ["Category", value("category_name")],
    ["Session", value("session")],
    ["Contributor", value("contributor_name")],
    ["Email", value("email")],
    ["Submitted", formatDate(String(row.created_at ?? ""))],
    ["File", `${value("file_name")} · ${formatBytes(Number(row.file_size ?? 0))}`],
  ];

  const status = String(row.status);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/contributions" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> Back to contributions
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl">{value("title")}</h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
              status === "pending"
                ? "bg-accent-soft text-accent"
                : status === "approved"
                  ? "bg-mint text-primary"
                  : "bg-red-50 text-red-700"
            }`}
          >
            {status}
          </span>
        </div>
        <p className="mt-1 font-mono text-[0.7rem] text-muted">{id}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <FileText size={15} /> Submitted file
              </h2>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/admin/contributions/${id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[0.7rem] text-primary hover:underline"
                >
                  Open <ExternalLink size={11} />
                </a>
                <a href={`/api/admin/contributions/${id}/file`} download className="inline-flex items-center gap-1 text-[0.7rem] text-muted hover:text-primary">
                  <Download size={12} /> Download
                </a>
              </div>
            </div>
            <iframe
              src={`/api/admin/contributions/${id}/file#toolbar=1`}
              title={`Submitted file for ${value("title")}`}
              className="h-[460px] w-full bg-surface-2"
            />
          </section>

          {Boolean(row.description) && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Contributor description</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{value("description")}</p>
            </section>
          )}

          {Boolean(row.review_notes) && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Review notes</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{value("review_notes")}</p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <ContributionReview
          id={id}
          title={String(row.title)}
          status={status}
          resourceSlug={row.resource_slug ? String(row.resource_slug) : null}
        />
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Submission details</h2>
            <dl className="mt-3 space-y-2">
              {details.map(([label, detail]) => (
                <div key={label} className="border-b border-line/60 pb-1.5">
                  <dt className="text-[0.62rem] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 break-words text-xs">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
