import Link from "next/link";
import { Timer } from "lucide-react";

import { formatDate } from "@/lib/format";
import type { ResourceListItem } from "@/lib/queries";

const GROUP_LABEL: Record<string, string> = {
  pyq: "PYQ",
  notes: "Notes",
  syllabus: "Syllabus",
  practical: "Practical",
  other: "Resource",
};

export default function ResourceCard({ resource }: { resource: ResourceListItem }) {
  return (
    <article className="card card-hover group flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="chip border-transparent bg-mint text-primary">
          {GROUP_LABEL[resource.categoryGroup] ?? "Resource"}
        </span>
        {resource.isSample && <span className="badge-sample shrink-0">Sample</span>}
      </div>

      <h3 className="mt-3 font-display text-[1.05rem] leading-snug text-ink">
        <Link href={`/resource/${resource.slug}`} className="transition group-hover:text-primary">
          {resource.title}
        </Link>
      </h3>

      <p className="mt-2 text-[0.78rem] text-muted">
        {resource.universityShort} · {resource.programmeShort} · Sem {resource.semester}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/80 pt-3 text-[0.7rem] text-muted">
        {resource.subjectCode ? (
          <span className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono">{resource.subjectCode}</span>
        ) : (
          <span>{resource.categoryName}</span>
        )}
        <span className="inline-flex items-center gap-1">
          <Timer size={12} /> {formatDate(resource.publishedAt ?? resource.createdAt)}
        </span>
      </div>
    </article>
  );
}
