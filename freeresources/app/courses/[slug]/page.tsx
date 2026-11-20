import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import EmptyState from "@/components/empty-state";
import ResourceCard from "@/components/resource-card";
import SectionHeading from "@/components/section-heading";
import { getProgramme } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = getProgramme(slug);
  if (!data) return { title: "Course not found" };
  return {
    title: `${data.programme.name} papers, notes and syllabus`,
    description:
      data.programme.description ??
      `Browse ${data.programme.name} resources across ${data.universities.length} universities: previous year papers, notes and syllabus by semester.`,
    alternates: { canonical: `/courses/${slug}` },
  };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getProgramme(slug);
  if (!data) notFound();

  const { programme, universities, branches, subjects, latest } = data;
  const totalResources = universities.reduce((sum, u) => sum + u.resourceCount, 0);
  const totalSubjects = universities.reduce((sum, u) => sum + u.subjectCount, 0);

  return (
    <>
      <div className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
          <nav className="text-xs text-muted" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span>Courses</span>
            <span className="mx-1.5">/</span>
            <span className="text-ink">{programme.shortName}</span>
          </nav>
          <p className="eyebrow mt-4">{programme.level}</p>
          <h1 className="mt-2 text-[2rem] leading-tight sm:text-[2.5rem]">{programme.name}</h1>
          {programme.description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{programme.description}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="chip">{universities.length} universities</span>
            <span className="chip">{totalSubjects} subjects</span>
            <span className="chip">{totalResources} files</span>
            <Link href={`/resources?programme=${programme.slug}`} className="btn btn-primary btn-sm">
              Browse all {programme.shortName} files
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-4 py-10 sm:px-6 lg:px-8">
        <section>
          <SectionHeading
            eyebrow="Where it is offered"
            title={`Universities offering ${programme.shortName}`}
            description="Each university follows its own scheme, so subjects and semesters can differ."
          />
          {universities.length === 0 ? (
            <EmptyState
              title="No university has this course mapped yet"
              description="Course pages are shared across institutions. Once an admin maps this programme to a university, it appears here."
              actionHref="/request"
              actionLabel="Request this course"
            />
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {universities.map((university) => (
                <Link
                  key={university.id}
                  href={`/resources?university=${university.slug}&programme=${programme.slug}`}
                  className="card card-hover group flex flex-col p-5"
                >
                  <p className="font-display text-lg">{university.shortName}</p>
                  <p className="mt-0.5 text-xs text-muted">{university.name}</p>
                  <p className="mt-1 text-[0.7rem] text-muted">{university.state}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[0.72rem] text-muted">
                    <span>
                      {university.branchCount} branches · {university.subjectCount} subjects ·{" "}
                      {university.resourceCount} files
                    </span>
                    <ArrowRight size={14} className="transition group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {branches.length > 0 && (
          <section>
            <SectionHeading eyebrow="Branches and specialisations" title="Filter by branch" />
            <div className="mt-4 flex flex-wrap gap-1.5">
              {branches.map((branch) => (
                <Link
                  key={branch.id}
                  href={`/resources?programme=${programme.slug}&branch=${branch.slug}`}
                  className="chip hover:border-primary/40 hover:text-primary"
                >
                  {branch.universityShort} · {branch.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading
            eyebrow="Subject index"
            title="Popular subjects in this course"
            href={`/resources?programme=${programme.slug}`}
            linkLabel="All resources"
          />
          {subjects.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-6 text-sm text-muted">
              No subjects have been added for this course yet.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <Link
                    href={`/subjects/${subject.slug}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-primary/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{subject.name}</span>
                      <span className="mt-0.5 block text-[0.7rem] text-muted">
                        {subject.universityShort} · Sem {subject.semester}
                        {subject.code ? ` · ${subject.code}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.7rem] text-muted">{subject.resourceCount} files</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {latest.length > 0 && (
          <section>
            <SectionHeading
              eyebrow="Recently added"
              title={`Newest ${programme.shortName} resources`}
              href={`/resources?programme=${programme.slug}&sort=recent`}
              linkLabel="View all"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
