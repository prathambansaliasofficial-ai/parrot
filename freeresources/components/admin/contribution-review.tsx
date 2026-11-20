"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

type Props = {
  id: string;
  title: string;
  status: string;
  resourceSlug?: string | null;
};

export default function ContributionReview({ id, title, status, resourceSlug }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [approvedSlug, setApprovedSlug] = useState(resourceSlug ?? "");

  async function submit(action: "approve" | "reject") {
    if (action === "approve" && !confirm(`Publish “${title}” as a public resource?`)) return;
    if (action === "reject" && !confirm("Reject this contribution? The contributor's file is kept for records.")) return;

    setPending(action);
    setError("");
    try {
      const response = await fetch(`/api/admin/contributions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "The review could not be saved.");
        return;
      }
      if (data.resourceSlug) setApprovedSlug(data.resourceSlug);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (status === "approved") {
    return (
      <div className="rounded-xl border border-primary/20 bg-mint/60 p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <CheckCircle2 size={16} /> Published
        </p>
        <p className="mt-1 text-xs text-muted">This contribution is live in the public library.</p>
        {approvedSlug && (
          <Link href={`/resource/${approvedSlug}`} target="_blank" className="btn btn-primary btn-sm mt-3">
            Open public resource
          </Link>
        )}
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-300/50 bg-red-50 p-4 text-red-800">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <XCircle size={16} /> Rejected
        </p>
        <p className="mt-1 text-xs">Review notes are recorded on the contribution.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold">Review decision</h2>
      <p className="mt-1 text-xs text-muted">
        Approving creates a published subject (if needed), a resource and a file copy. Rejecting keeps the file for
        records and emails are not sent automatically.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

      <label htmlFor="review-notes" className="label mt-4">
        Review notes {status === "pending" && <span className="font-normal text-muted">(required to reject)</span>}
      </label>
      <textarea
        id="review-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
        maxLength={1000}
        className="input resize-y"
        placeholder="Why is this rejected, or what did you verify before publishing?"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => submit("approve")} disabled={pending !== null} className="btn btn-primary">
          <CheckCircle2 size={15} /> {pending === "approve" ? "Publishing…" : "Approve & publish"}
        </button>
        <button
          type="button"
          onClick={() => submit("reject")}
          disabled={pending !== null || notes.trim().length < 3}
          className="btn btn-secondary text-red-700"
        >
          <XCircle size={15} /> {pending === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
