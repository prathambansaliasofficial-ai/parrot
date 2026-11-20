import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileCheck2, ShieldCheck, Upload } from "lucide-react";

import ContributeForm from "@/components/contribute-form";
import PageHeader from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { first, type SearchParams } from "@/lib/params";
import { getFilterOptions } from "@/lib/queries";
import { maxUploadMb } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Contribute resources",
  description:
    "Upload previous year papers, notes, syllabus or practical files for your university. Every submission is reviewed before publishing.",
  alternates: { canonical: "/contribute" },
};

export default async function ContributePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const options = getFilterOptions();

  return (
    <>
      <PageHeader
        eyebrow="Give one, take one"
        title="Contribute a resource"
        description="Your paper, notes or lab file can save someone an entire week. Upload a PDF, map it to the right subject, and an admin will review it before it goes live."
      />

      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="card p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3 border-b border-line pb-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint text-primary">
                <Upload size={17} />
              </span>
              <div>
                <p className="text-sm font-semibold">New submission</p>
                <p className="text-xs text-muted">
                  {user ? `Signed in as ${user.email}` : "Submitting as a guest — sign in to track it in your dashboard."}
                </p>
              </div>
            </div>

            <ContributeForm
              options={options}
              maxMb={maxUploadMb()}
              defaults={{
                university: first(params.university),
                programme: first(params.programme),
                branch: first(params.branch),
                semester: first(params.semester),
                subject: first(params.subject),
              }}
              contributor={user ? { name: user.name, email: user.email } : undefined}
            />
          </div>

          <aside className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <FileCheck2 size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">What we accept</h2>
              </div>
              <ul className="mt-3 space-y-2.5 text-[0.8rem] leading-relaxed text-muted">
                {[
                  "End-semester and mid-semester question papers",
                  "Handwritten, typed or unit-wise notes",
                  "Official or clearly transcribed syllabus",
                  "Practical files, lab manuals and assignments",
                  "Question banks and revision material",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-[0.7rem] text-muted">
                PDF only, up to {maxUploadMb()} MB. No copyrighted textbooks or paid test series.
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Review process</h2>
              </div>
              <ol className="mt-3 space-y-3 text-[0.78rem] leading-relaxed text-muted">
                <li>
                  <span className="font-medium text-ink">1. You upload.</span> The PDF is stored under a random name
                  and stays private.
                </li>
                <li>
                  <span className="font-medium text-ink">2. An admin checks it.</span> Metadata, subject and quality
                  are verified; incorrect files are rejected.
                </li>
                <li>
                  <span className="font-medium text-ink">3. It goes live.</span> You are credited on the resource page
                  and can see it in your dashboard.
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-line bg-mint/60 p-5">
              <p className="text-sm font-medium">Not sure where it belongs?</p>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
                Pick the closest subject and category; the reviewer can move it. Or ask first through support.
              </p>
              <Link href="/support?category=general-enquiry" className="btn btn-secondary btn-sm mt-3 w-full">
                Ask a question
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
