import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import PageHeader from "@/components/page-header";

export const metadata: Metadata = {
  title: "Study guides",
  description:
    "Practical guides for finding previous year papers, reading a syllabus properly and building a semester revision system.",
  alternates: { canonical: "/blog" },
};

const GUIDES = [
  {
    id: "find-papers",
    title: "How to find previous year papers that are actually useful",
    summary:
      "Most students download the first PDF they find. A paper is only useful if it matches your subject code and current exam pattern.",
    reading: "6 min read",
    sections: [
      {
        heading: "Start with the subject code, not the subject name",
        body: "Subject names repeat across universities and even within the same programme. Codes are more precise. Search the code first, then verify the university, branch and semester on the resource page. If a paper is tagged BCS301 but your scheme uses a different code, it may still be useful practice — but do not assume it matches your exam.",
      },
      {
        heading: "Check the session and the scheme",
        body: "A 2021 paper may follow an older syllabus. Look at the academic session on the resource card and compare the units with your current syllabus. If the paper covers topics you have not been taught, it is probably from a different scheme.",
      },
      {
        heading: "Collect three to five papers, not twenty",
        body: "Three recent papers from the same scheme reveal the pattern: which units carry the long questions, which topics repeat, and how much choice you get. Twenty random papers create noise and eat revision time.",
      },
      {
        heading: "Work the paper before reading the solution",
        body: "Attempt the paper closed-book for the full duration. Then mark it against your notes. The gap between what you wrote and what you should have written is the actual revision list.",
      },
    ],
  },
  {
    id: "read-syllabus",
    title: "How to read a university syllabus without wasting a week",
    summary:
      "A syllabus is not a reading list. It is a contract that tells you what can be asked, how much it is worth and which units you can deprioritise.",
    reading: "5 min read",
    sections: [
      {
        heading: "Find the assessment split first",
        body: "Look for the marks distribution before the unit list. A 70/30 theory-practical split changes how you prepare compared with a 100-mark end-semester exam. Note the internal assessment components and their deadlines.",
      },
      {
        heading: "Map units to marks, not pages",
        body: "Most syllabi list five units with roughly equal weight. Mark the units that appear in every recent paper. Those are your non-negotiables. Units that appear rarely can be scheduled later, not skipped entirely.",
      },
      {
        heading: "Turn each unit into questions",
        body: "For every unit, write one definition question, one comparison question and one application question. If you can answer those three without notes, you probably know the unit well enough for a short-answer section.",
      },
      {
        heading: "Keep the official PDF",
        body: "Download the syllabus from your university or department and keep it offline. Summaries on third-party sites go stale. When a topic is disputed, the official document settles it.",
      },
    ],
  },
  {
    id: "revision-system",
    title: "A semester revision system that survives a busy week",
    summary:
      "A simple folder-and-calendar system: one place per subject, one index per unit, and a weekly review that takes fifteen minutes.",
    reading: "7 min read",
    sections: [
      {
        heading: "One folder per subject, four subfolders",
        body: "Create Syllabus, Papers, Notes and Practice inside each subject folder. Put every download in the right subfolder immediately. The goal is that you never search your downloads folder the night before an exam.",
      },
      {
        heading: "Keep a one-page index",
        body: "For each subject, maintain a single page listing units, the source you are using for each, and the questions you got wrong. This page is more valuable than another set of notes because it tells you where you actually stand.",
      },
      {
        heading: "Use active recall on a timer",
        body: "Twenty-five minutes of writing from memory beats an hour of re-reading. After each block, check the notes and add the gaps to the index. Repeat the gaps the next day, not the whole unit.",
      },
      {
        heading: "Review weekly, not nightly",
        body: "Once a week, open the index for every subject and pick the two weakest units. Schedule them into the next week. This prevents the common pattern of over-studying the subject you like and ignoring the one you fear.",
      },
    ],
  },
];

export default function BlogPage() {
  return (
    <>
      <PageHeader
        eyebrow="Study guides"
        title="Study smarter with the material you already have"
        description="Short, practical guides on papers, syllabus and revision. No listicles, no exam-day miracles."
      />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {GUIDES.map((guide, index) => (
            <a
              key={guide.id}
              href={`#${guide.id}`}
              className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <span className="font-mono text-[0.68rem] text-muted">GUIDE {String(index + 1).padStart(2, "0")}</span>
              <p className="mt-2 font-display text-lg leading-snug">{guide.title}</p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{guide.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                {guide.reading} <ArrowUpRight size={13} />
              </span>
            </a>
          ))}
        </div>

        <div className="mt-10 space-y-8">
          {GUIDES.map((guide) => (
            <article key={guide.id} id={guide.id} className="scroll-mt-24 card p-6 sm:p-8">
              <p className="eyebrow">Study guide · {guide.reading}</p>
              <h2 className="mt-2 font-display text-2xl leading-tight">{guide.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{guide.summary}</p>
              <div className="prose-page mt-5">
                {guide.sections.map((section) => (
                  <div key={section.heading}>
                    <h3>{section.heading}</h3>
                    <p>{section.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 rounded-xl border border-line bg-paper p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-lg">Put the advice to work</p>
            <p className="text-sm text-muted">Find your subject shelf and start with one paper.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/pyqs" className="btn btn-primary btn-sm">
              Browse PYQs
            </Link>
            <Link href="/syllabus" className="btn btn-secondary btn-sm">
              Browse syllabus
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
