import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, HeartHandshake, ShieldCheck, Users } from "lucide-react";

import PageHeader from "@/components/page-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About FreeResources",
  description:
    "FreeResources.in is a free, student-run academic library for Indian universities. Learn how the library is organised and what we will not do.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="A library run by students, for students"
        description="Every student deserves access to quality academic resources, regardless of their college or university."
      />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="prose-page">
          <p>
            FreeResources.in began with a familiar problem: a paper exists somewhere in a class group, a senior's
            drive, or a photocopy shop — but the student who needs it cannot find it. The material is not scarce.
            It is scattered, badly named and locked inside closed groups.
          </p>
          <p>
            We organise it the way a syllabus is actually structured: university, college where relevant,
            programme, branch, semester, subject, and then the type of resource. A question paper stays a question
            paper. Notes stay notes. Nothing is bundled into a single “downloads” folder.
          </p>

          <h2>What the library contains</h2>
          <div className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: BookOpen,
                title: "Papers and notes",
                body: "Previous year papers, question banks, handwritten and digital notes, important questions and revision material.",
              },
              {
                icon: ShieldCheck,
                title: "Syllabus and practicals",
                body: "Semester-wise syllabus, lab manuals, practical files and assignments, each in its own category.",
              },
              {
                icon: Users,
                title: "Multiple universities",
                body: "The hierarchy is database-driven, not hardcoded around one university. New institutions can be added without code changes.",
              },
              {
                icon: HeartHandshake,
                title: "Human review",
                body: "Contributions are checked before publishing. Demo files are labelled SAMPLE so they are never mistaken for verified papers.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-line bg-surface p-4">
                <item.icon size={18} className="text-primary" />
                <p className="mt-2 text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>

          <h2>What we will not do</h2>
          <ul>
            <li>We will not invent question papers, download links or statistics.</li>
            <li>We will not claim a university uploaded or endorsed material.</li>
            <li>We will not host copyrighted textbooks or paid test series.</li>
            <li>We will not sell your data or require an account to download a public file.</li>
          </ul>

          <h2>Current stage</h2>
          <p>
            The platform runs on real university metadata and ships with no demonstration files. The library grows
            only as reviewed, permission-checked material is approved. Empty shelves are shown honestly rather than
            filled with placeholders.
          </p>

          <h2>Get involved</h2>
          <p>
            Upload a paper from your last semester, request a subject that is missing, or report a file that does not
            open. Those three actions are what keep a library useful.
          </p>
          <div className="not-prose mt-5 flex flex-wrap gap-2">
            <Link href="/contribute" className="btn btn-primary btn-sm">
              Contribute a resource
            </Link>
            <Link href="/request" className="btn btn-secondary btn-sm">
              Request material
            </Link>
            <a href={`mailto:${SITE.email}`} className="btn btn-ghost btn-sm">
              Email the team
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
