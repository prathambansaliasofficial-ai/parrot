import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, FileText } from "lucide-react";

import EmptyState from "@/components/empty-state";
import { formatBytes, formatDate } from "@/lib/format";
import { first, type SearchParams } from "@/lib/params";
import { getSubject, type ResourceListItem } from "@/lib/queries";

const GROUP_LABELS: Record<string, string> = {
  pyq: "Previous year papers",
  notes: "Notes",
  syllabus: "Syllabus",
  practical: "Practicals",
  other: "Other",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = getSubject(slug);
  if (!data) return { title: "Subject not found" };
  const s = data.subject;
  return {
    title: `${s.name}${s.code ? ` (${s.code})` : ""} — ${s.universityShort} notes, papers and syllabus`,
    description:
      s.description ??
      `${s.name} resources for ${s.universityShort} ${s.programmeShort}, semester ${s.semester}: previous year papers, notes and syllabus.`,
    alternates: { canonical: `/subjects/${slug}` },
  };
}

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const data = getSubject(slug);
  if (!data) notFound();

  const { subject, resources, categories, academicYear } = data;
  const types = categories.filter((category) => category.count > 0);
  const selectedType = types.find((category) => category.slug === first(query.type));
  const typeItems = selectedType ? resources.filter((item) => item.categoryId === selectedType.id) : [];
  const universityHref = `/universities/${subject.universitySlug}?programme=${subject.programmeSlug}${
    subject.branchSlug ? `&branch=${subject.branchSlug}` : ""
  }`;

  return (
    <>
      <div className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <span>/</span>
            <Link href={`/universities/${subject.universitySlug}`} className="hover:text-primary">
              {subject.universityShort}
            </Link>
            <span>/</span>
            <Link href={universityHref} className="hover:text-primary">
              {subject.programmeShort}
            </Link>
            {subject.branchName && (
              <>
                <span>/</span>
                <Link href={universityHref} className="hover:text-primary">
                  {subject.branchName}
                </Link>
              </>
            )}
            <span>/</span>
            <span className="text-ink">{subject.name}</span>
          </nav>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">Subject</span>
                {subject.isSample && <span className="badge-sample">Sample subject</span>}
              </div>
              <h1 className="mt-2 text-[2rem] leading-tight sm:text-[2.5rem]">{subject.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {subject.code && (
                  <span className="rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[0.72rem] text-muted">
                    {subject.code}
                  </span>
                )}
                <span className="chip">{subject.programmeShort}</span>
                {subject.branchName && <span className="chip">{subject.branchName}</span>}
                <span className="chip">Semester {subject.semester}</span>
                <span className="chip">{academicYear}</span>
              </div>
            </div>
            <Link
              href={`/contribute?university=${subject.universitySlug}&programme=${subject.programmeSlug}${
                subject.branchSlug ? `&branch=${subject.branchSlug}` : ""
              }&subject=${subject.slug}`}
              className="btn btn-secondary btn-sm shrink-0"
            >
              Contribute
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-9 sm:px-6 lg:px-8">
        {selectedType ? (
          <>
            <Link href={`/subjects/${subject.slug}`} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary">
              <ArrowLeft size={13} /> All resource types
            </Link>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{GROUP_LABELS[selectedType.group] ?? "Resource"}</p>
                <h2 className="mt-1 text-2xl">{selectedType.name}</h2>
              </div>
              <p className="text-xs text-muted">
                {selectedType.count} {selectedType.count === 1 ? "file" : "files"}
              </p>
            </div>

            {typeItems.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title="No files in this type yet"
                  description="The category exists but has no published files for this subject."
                  actionHref={`/contribute?university=${subject.universitySlug}&programme=${subject.programmeSlug}&subject=${subject.slug}`}
                  actionLabel="Contribute a file"
                />
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
                <ul className="divide-y divide-line">
                  {typeItems.map((resource) => (
                    <ResourceRow key={resource.id} resource={resource} />
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : types.length === 0 ? (
          <EmptyState
            title="No files for this subject yet"
            description="Nobody has uploaded material for this subject. Contribute a paper or notes and it will be reviewed before publishing."
            actionHref={`/contribute?university=${subject.universitySlug}&programme=${subject.programmeSlug}${
              subject.branchSlug ? `&branch=${subject.branchSlug}` : ""
            }&subject=${subject.slug}`}
            actionLabel="Contribute the first file"
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Browse</p>
                <h2 className="mt-1 text-2xl">Choose a resource type</h2>
                <p className="mt-1 text-sm text-muted">Notes, papers and practicals are kept in separate folders.</p>
              </div>
              <p className="shrink-0 text-xs text-muted">
                {resources.length} {resources.length === 1 ? "file" : "files"}
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {types.map((type) => (
                <Link
                  key={type.id}
                  href={`/subjects/${subject.slug}?type=${type.slug}`}
                  className="card card-hover group flex items-center justify-between gap-4 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint text-primary">
                      <FileText size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium transition group-hover:text-primary">{type.name}</p>
                      <p className="mt-0.5 text-[0.72rem] text-muted">
                        {GROUP_LABELS[type.group] ?? "Resource"} · {type.count} {type.count === 1 ? "file" : "files"}
                      </p>
                    </div>
                  </div>
                  <ArrowRight size={15} className="shrink-0 text-muted transition group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ResourceRow({ resource }: { resource: ResourceListItem }) {
  return (
    <li className="group flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/resource/${resource.slug}`}
            className="truncate text-sm font-medium transition group-hover:text-primary"
          >
            {resource.title}
          </Link>
          {resource.isSample && <span className="badge-sample">Sample</span>}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted">
          <FileText size={11} />
          {resource.session ?? "Session not recorded"}
          <span>·</span>
          {resource.fileSize ? formatBytes(resource.fileSize) : "Size unknown"}
          <span>·</span>
          added {formatDate(resource.publishedAt ?? resource.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {resource.fileId && (
          <a
            href={`/api/download/${resource.fileId}`}
            className="btn btn-secondary btn-sm"
            aria-label={`Download ${resource.title}`}
          >
            <Download size={13} />
            <span className="hidden sm:inline">PDF</span>
          </a>
        )}
        <Link href={`/resource/${resource.slug}`} className="btn btn-ghost btn-sm">
          Open <ArrowRight size={13} />
        </Link>
      </div>
    </li>
  );
}
