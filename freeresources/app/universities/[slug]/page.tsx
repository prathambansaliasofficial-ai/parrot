import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";

import EmptyState from "@/components/empty-state";
import { first, type SearchParams } from "@/lib/params";
import { getUniversity } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = getUniversity(slug);
  if (!data) return { title: "University not found" };
  return {
    title: `${data.university.shortName} previous year papers, notes and syllabus`,
    description:
      data.university.description ??
      `Resources for ${data.university.name}: previous year papers, notes, syllabus and practical files by programme and semester.`,
    alternates: { canonical: `/universities/${slug}` },
  };
}

export default async function UniversityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const data = getUniversity(slug);
  if (!data) notFound();

  const { university, programmes, branches, subjects, stats } = data;
  const programme = programmes.find((item) => item.slug === first(query.programme));
  const programmeBranches = programme ? branches.filter((item) => item.programmeSlug === programme.slug) : [];
  const branch = programmeBranches.find((item) => item.slug === first(query.branch));

  const subjectPool =
    programme && (!programmeBranches.length || branch)
      ? subjects.filter(
          (item) =>
            item.programmeSlug === programme.slug &&
            (!branch || !item.branchSlug || item.branchSlug === branch.slug),
        )
      : [];

  const branchSubjects = branch ? subjectPool.filter((item) => item.branchSlug === branch.slug) : [];
  const commonSubjects = branch
    ? subjectPool.filter(
        (item) =>
          !item.branchSlug &&
          !branchSubjects.some(
            (specific) => specific.name === item.name || (specific.code && specific.code === item.code),
          ),
      )
    : subjectPool;

  const visibleSubjects = [...branchSubjects, ...commonSubjects].sort(
    (a, b) => a.semester - b.semester || a.name.localeCompare(b.name),
  );


  return (
    <>
      <div className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-xs text-muted" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link href="/universities" className="hover:text-primary">
              Universities
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-ink">{university.shortName}</span>
          </nav>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[1.9rem] leading-tight sm:text-[2.35rem]">{university.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {university.city ? `${university.city}, ` : ""}
                  {university.state}
                </span>
                <span>·</span>
                <span>{university.type} university</span>
                <span>·</span>
                <span>{stats.subjects} subjects</span>
                <span>·</span>
                <span>{stats.resources} files</span>
              </p>
            </div>
            <Link href={`/contribute?university=${university.slug}`} className="btn btn-secondary btn-sm shrink-0">
              Contribute
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <section>
          {!programme ? (
            <>
              <StepHeading
                step={1}
                title="Choose your programme"
                description="Pick the degree you are studying."
              />

              {programmes.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="No programmes mapped yet"
                    description="An administrator can add programmes, streams and subjects for this university."
                    actionHref={`/contribute?university=${university.slug}`}
                    actionLabel="Contribute material"
                  />
                </div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {programmes.map((item) => (
                    <Link
                      key={item.id}
                      href={`/universities/${university.slug}?programme=${item.slug}`}
                      className="card card-hover group flex items-center justify-between gap-4 p-5"
                    >
                      <div>
                        <p className="font-display text-lg">{item.shortName}</p>
                        <p className="mt-0.5 text-xs text-muted">{item.name}</p>
                        <p className="mt-3 text-[0.72rem] text-muted">
                          {item.branchCount} streams · {item.subjectCount} subjects · {item.resourceCount} files
                        </p>
                      </div>
                      <ArrowRight size={16} className="shrink-0 text-muted transition group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : programmeBranches.length > 0 && !branch ? (
            <>
              <StepHeading
                step={2}
                title="Choose your stream"
                description={`Select your specialisation or branch in ${programme.shortName}.`}
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {programmeBranches.map((item) => (
                  <Link
                    key={item.id}
                    href={`/universities/${university.slug}?programme=${programme.slug}&branch=${item.slug}`}
                    className="card card-hover group flex items-center justify-between gap-4 p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-[0.72rem] text-muted">
                        {item.code ? `${item.code} · ` : ""}
                        {item.subjectCount} subjects · {item.resourceCount} files
                      </p>
                    </div>
                    <ArrowRight size={15} className="shrink-0 text-muted transition group-hover:text-primary" />
                  </Link>
                ))}
              </div>

              <p className="mt-6 text-xs text-muted">
                {programme.shortName} ·{" "}
                <Link href={`/universities/${university.slug}`} className="font-medium text-primary hover:underline">
                  Change programme
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="text-xl">Choose your subject</h2>
                <p className="text-xs text-muted">
                  {programme.shortName}
                  {branch ? ` · ${branch.name}` : ""} ·{" "}
                  <Link
                    href={
                      branch
                        ? `/universities/${university.slug}?programme=${programme.slug}`
                        : `/universities/${university.slug}`
                    }
                    className="font-medium text-primary hover:underline"
                  >
                    Change
                  </Link>
                </p>
              </div>

              {visibleSubjects.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No subjects here yet"
                    description="This stream has no published subjects. Request the subject or contribute material to get it started."
                    actionHref={`/contribute?university=${university.slug}&programme=${programme.slug}${
                      branch ? `&branch=${branch.slug}` : ""
                    }`}
                    actionLabel="Contribute material"
                  />
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {visibleSubjects.map((item) => (
                    <Link
                      key={item.id}
                      href={`/subjects/${item.slug}`}
                      className="card card-hover group flex items-center justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium transition group-hover:text-primary">
                          {item.name}
                        </p>
                        <p className="mt-1 text-[0.72rem] text-muted">
                          {item.code ? `${item.code} · ` : ""}Semester {item.semester}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                        {item.resourceCount} {item.resourceCount === 1 ? "file" : "files"}
                        <ArrowRight size={14} />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function StepHeading({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint font-mono text-xs font-semibold text-primary">
        {step}
      </span>
      <div>
        <h2 className="text-xl">{title}</h2>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </div>
    </div>
  );
}

