import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  ShieldCheck,
} from "lucide-react";

import AskParrotButton from "@/components/ask-parrot-button";
import ResourceCard from "@/components/resource-card";
import { formatBytes, formatDate } from "@/lib/format";
import { getResourceBySlug, getResourceSlugAlias, recordResourceView } from "@/lib/queries";
import { SITE } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = getResourceBySlug(slug);
  if (!data) {
    const alias = getResourceSlugAlias(slug);
    return alias ? { title: "Resource moved" } : { title: "Resource not found" };
  }
  const r = data.resource;
  const title = `${r.title} — ${r.universityShort} ${r.programmeShort} Sem ${r.semester}`;
  const description =
    r.description ??
    `${r.categoryName} for ${r.subjectName}${r.subjectCode ? ` (${r.subjectCode})` : ""} at ${r.universityName}.`;
  return {
    title,
    description,
    alternates: { canonical: `/resource/${slug}` },
    openGraph: { title, description, type: "article", url: `${SITE.url}/resource/${slug}` },
  };
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getResourceBySlug(slug);
  if (!data) {
    const alias = getResourceSlugAlias(slug);
    if (alias) redirect(`/resource/${alias}`);
    notFound();
  }

  const { resource, files, related, academicYear } = data;
  const primary = files[0];
  recordResourceView(resource.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: resource.title,
    description: resource.description ?? undefined,
    url: `${SITE.url}/resource/${resource.slug}`,
    datePublished: resource.publishedAt ?? undefined,
    inLanguage: "en",
    isPartOf: {
      "@type": "Course",
      name: `${resource.subjectName} — ${resource.programmeName}`,
      educationalLevel: academicYear,
    },
    provider: { "@type": "CollegeOrUniversity", name: resource.universityName },
    about: resource.subjectCode ?? resource.subjectName,
    encodingFormat: "application/pdf",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <span>/</span>
            <Link href={`/universities/${resource.universitySlug}`} className="hover:text-primary">
              {resource.universityShort}
            </Link>
            <span>/</span>
            <Link href={`/courses/${resource.programmeSlug}`} className="hover:text-primary">
              {resource.programmeShort}
            </Link>
            <span>/</span>
            <Link href={`/subjects/${resource.subjectSlug}`} className="hover:text-primary">
              {resource.subjectName}
            </Link>
            <span>/</span>
            <span className="text-ink">{resource.categoryName}</span>
          </nav>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="chip border-transparent bg-mint text-primary">{resource.categoryName}</span>
            {resource.session && <span className="chip">{resource.session}</span>}
            {resource.isSample && <span className="badge-sample">Sample file</span>}
            {resource.subjectCode && (
              <span className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[0.68rem] text-muted">
                {resource.subjectCode}
              </span>
            )}
          </div>

          <h1 className="mt-3 max-w-4xl text-[1.75rem] leading-[1.2] sm:text-[2.25rem]">{resource.title}</h1>

          {resource.description && (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{resource.description}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.78rem] text-muted">
            <Link href={`/universities/${resource.universitySlug}`} className="hover:text-primary">
              {resource.universityName}
            </Link>
            <span>{resource.programmeName}</span>
            {resource.branchName && <span>{resource.branchName}</span>}
            <span>Semester {resource.semester}</span>
            <span className="inline-flex items-center gap-1">
              <Eye size={12} /> {resource.viewCount} views
            </span>
            <span className="inline-flex items-center gap-1">
              <Download size={12} /> {resource.downloadCount} downloads
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-7 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-6">
            {resource.isSample && (
              <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft/70 px-4 py-3">
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-accent" />
                <div className="text-[0.8rem] leading-relaxed">
                  <p className="font-semibold text-ink">This is a demonstration file, not a real paper.</p>
                  <p className="mt-0.5 text-muted">
                    It was generated to test preview and download. The PDF itself says so on every page. Replace it
                    with verified material by contributing the real document.
                  </p>
                </div>
              </div>
            )}

            {primary ? (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg">Preview</h2>
                  <a
                    href={`/api/preview/${primary.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open in new tab <ExternalLink size={12} />
                  </a>
                </div>
                <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
                  <iframe
                    src={`/api/preview/${primary.id}#toolbar=1&navpanes=0`}
                    title={`Preview of ${resource.title}`}
                    className="h-[420px] w-full sm:h-[560px]"
                    loading="lazy"
                  />
                </div>
                <p className="mt-2 text-[0.7rem] text-muted">
                  Preview may not render on every mobile browser. Use the download button to open it in your PDF
                  reader.
                </p>
              </section>
            ) : (
              <div className="rounded-xl border border-line bg-surface px-5 py-6 text-sm text-muted">
                No file is attached to this resource. An administrator needs to upload one.
              </div>
            )}

            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-lg">Resource details</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ["University", resource.universityName],
                  ["Programme", resource.programmeName],
                  ["Branch", resource.branchName ?? "Not branch-specific"],
                  ["Academic year", `${academicYear} · Semester ${resource.semester}`],
                  ["Subject", `${resource.subjectName}${resource.subjectCode ? ` (${resource.subjectCode})` : ""}`],
                  ["Category", `${resource.categoryName} (${resource.categoryGroup.toUpperCase()})`],
                  ["Academic session", resource.session ?? "Not recorded"],
                  ["Published", formatDate(resource.publishedAt ?? resource.createdAt)],
                  ["Contributor", resource.contributorName ?? "Not credited"],
                  ["Format", primary ? `${primary.mimeType.split("/")[1]?.toUpperCase() ?? "PDF"} · ${formatBytes(primary.sizeBytes)}` : "No file"],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col border-b border-line/60 pb-2">
                    <dt className="text-[0.68rem] uppercase tracking-wide text-muted">{label}</dt>
                    <dd className="mt-0.5 text-[0.85rem]">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {related.length > 0 && (
              <section>
                <h2 className="text-lg">More from {resource.subjectName}</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {related.map((item) => (
                    <ResourceCard key={item.id} resource={item} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              <div className="border-b border-line bg-paper/60 px-5 py-4">
                <p className="eyebrow">File</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium">{primary?.originalName ?? "No file attached"}</p>
              </div>
              <div className="p-5">
                {primary ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-mint text-primary">
                        <FileText size={20} />
                      </span>
                      <div className="text-xs text-muted">
                        <p className="font-medium text-ink">PDF document</p>
                        <p className="mt-0.5">
                          {formatBytes(primary.sizeBytes)} · {resource.downloadCount} downloads
                        </p>
                      </div>
                    </div>
                    <a href={`/api/download/${primary.id}`} className="btn btn-primary mt-4 w-full">
                      <Download size={16} /> Download PDF
                    </a>
                    <a
                      href={`/api/preview/${primary.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary mt-2 w-full"
                    >
                      <ExternalLink size={15} /> Preview file
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-muted">The file will be available once an admin attaches it.</p>
                )}

                <AskParrotButton
                  topic={`${resource.subjectName}${resource.subjectCode ? ` (${resource.subjectCode})` : ""}`}
                />

                {files.length > 1 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">All versions</p>
                    <ul className="mt-2 space-y-1.5">
                      {files.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/download/${file.id}`}
                            className="flex items-center justify-between gap-2 text-xs text-ink/80 hover:text-primary"
                          >
                            <span className="truncate">{file.originalName}</span>
                            <Download size={12} className="shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[0.7rem] leading-relaxed text-muted">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    Review the session and scheme before relying on this file. Universities occasionally revise
                    papers and syllabi.
                  </span>
                </div>
              </div>
            </div>

            <Link
              href={`/support?category=incorrect-resource&resource=${resource.id}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted transition hover:border-primary/40 hover:text-primary"
            >
              <Flag size={14} /> Report a broken or incorrect file
            </Link>

            <div className="rounded-xl border border-line bg-mint/60 p-4">
              <p className="text-sm font-medium">Have the verified copy?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Contribute it so the next student gets the real paper.
              </p>
              <Link
                href={`/contribute?university=${resource.universitySlug}&programme=${resource.programmeSlug}&semester=${resource.semester}`}
                className="btn btn-secondary btn-sm mt-3 w-full"
              >
                Contribute
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
