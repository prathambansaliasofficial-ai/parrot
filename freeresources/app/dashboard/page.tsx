import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileUp, Upload } from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "My dashboard",
  description: "Track your contributions and account.",
  robots: { index: false, follow: false },
};

type ContributionRow = {
  id: string;
  publicId: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  universityShort: string;
  resourceSlug: string | null;
  fileName: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-accent-soft text-accent",
  approved: "bg-mint text-primary",
  rejected: "bg-danger/10 text-danger",
};

export default async function DashboardPage() {
  const user = await requireUser();

  const contributions = all<ContributionRow>(
    `SELECT c.id, c.public_id AS publicId, c.title, c.status, c.created_at AS createdAt,
            c.review_notes AS reviewNotes, c.reviewed_at AS reviewedAt, c.file_name AS fileName,
            u.short_name AS universityShort, r.slug AS resourceSlug
       FROM contributions c
       JOIN universities u ON u.id = c.university_id
       LEFT JOIN resources r ON r.id = c.resource_id
      WHERE c.user_id = ? OR c.email = ?
      ORDER BY c.created_at DESC LIMIT 50`,
    [user.id, user.email],
  );

  const pending = contributions.filter((c) => c.status === "pending").length;
  const approved = contributions.filter((c) => c.status === "approved").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 text-[2rem] leading-tight">Hello, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/contribute" className="btn btn-primary btn-sm">
            <Upload size={14} /> Contribute
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Submissions", value: contributions.length },
          { label: "Awaiting review", value: pending },
          { label: "Published", value: approved },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted">{stat.label}</p>
            <p className="mt-1 font-display text-2xl">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-9">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Your contributions</h2>
          <span className="text-xs text-muted">Latest 50</span>
        </div>

        {contributions.length === 0 ? (
          <div className="mt-4 card flex flex-col items-center px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint text-primary">
              <FileUp size={22} />
            </span>
            <h3 className="mt-3 font-display text-lg">No submissions yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">
              Upload a paper, notes or syllabus from your course. You will see its review status here.
            </p>
            <Link href="/contribute" className="btn btn-primary btn-sm mt-4">
              Contribute your first file
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {contributions.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${
                          STATUS_STYLE[item.status] ?? STATUS_STYLE.pending
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.72rem] text-muted">
                      {item.universityShort} · {item.fileName} · submitted {formatDate(item.createdAt)}
                    </p>
                    {item.reviewNotes && (
                      <p className="mt-1.5 rounded-md bg-paper px-2 py-1 text-[0.72rem] text-muted">
                        Reviewer: {item.reviewNotes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[0.68rem] text-muted">{item.publicId}</span>
                    {item.status === "approved" && item.resourceSlug && (
                      <Link
                        href={`/resource/${item.resourceSlug}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        View <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        Need to update a submission?{" "}
        <Link href="/support?category=general-enquiry" className="text-primary hover:underline">
          Open a support ticket
        </Link>{" "}
        with the reference ID.
      </p>
    </div>
  );
}
