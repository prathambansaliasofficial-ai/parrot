import Link from "next/link";
import { ArrowRight, BookOpen, FileText, GraduationCap, Layers, Search } from "lucide-react";

import ResourceCard from "@/components/resource-card";
import SearchBar from "@/components/search-bar";
import UniversityCard from "@/components/university-card";
import { getHomeData, getSiteSetting } from "@/lib/queries";

export const metadata = {
  title: "FreeResources.in — Previous Year Papers, Notes & Syllabus for Indian Universities",
  description:
    "Find previous year question papers, handwritten notes, syllabus and practical files by university, course, semester and subject. Free, organised and student-run.",
  alternates: { canonical: "/" },
};

const QUICK_LINKS = [
  { label: "Previous papers", href: "/pyqs", icon: FileText },
  { label: "Notes", href: "/notes", icon: BookOpen },
  { label: "Syllabus", href: "/syllabus", icon: Layers },
  { label: "Practicals", href: "/resources?group=practical", icon: GraduationCap },
  { label: "Everything", href: "/resources", icon: Search },
];

export default function HomePage() {
  const data = getHomeData();
  const headline = getSiteSetting("home_headline", "Your College. Your Resources. All in One Place.");
  const subhead = getSiteSetting(
    "home_subhead",
    "Papers, notes and syllabus for your course — free, and organised by semester.",
  );

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="eyebrow">Free · Student-run</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-[2.3rem] leading-[1.1] tracking-tight sm:text-[3.1rem]">
            {headline}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted">{subhead}</p>

          <div className="mx-auto mt-7 max-w-2xl text-left">
            <SearchBar variant="hero" />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <Link href="/resources" className="btn btn-primary">
              Browse resources <ArrowRight size={16} />
            </Link>
            <Link href="/contribute" className="btn btn-secondary">
              Contribute
            </Link>
          </div>

          <p className="mt-5 text-[0.72rem] text-muted">
            {data.stats.universities} universities · {data.stats.subjects} subjects · {data.stats.resources} files
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-primary/40 hover:bg-mint/40"
            >
              <link.icon size={16} className="shrink-0 text-primary" />
              <span className="font-medium">{link.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-xl">Recently added</h2>
            <Link href="/resources?sort=recent" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {data.latest.length === 0 ? (
            <p className="mt-6 text-sm text-muted">No resources published yet.</p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.latest.slice(0, 4).map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl">Universities</h2>
          <Link href="/universities" className="text-xs font-medium text-primary hover:underline">
            All universities
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.featured.slice(0, 4).map((university) => (
            <UniversityCard key={university.slug} university={university} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-mint/60 px-6 py-5">
          <div>
            <p className="text-sm font-medium">Have a paper or notes to share?</p>
            <p className="mt-0.5 text-xs text-muted">Every file is reviewed before it goes live.</p>
          </div>
          <Link href="/contribute" className="btn btn-primary btn-sm">
            Contribute
          </Link>
        </div>
      </section>
    </>
  );
}
