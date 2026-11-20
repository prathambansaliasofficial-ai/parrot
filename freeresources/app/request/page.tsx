import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Inbox, Search } from "lucide-react";

import PageHeader from "@/components/page-header";
import RequestForm from "@/components/request-form";
import { first, type SearchParams } from "@/lib/params";
import { getFilterOptions } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Request a resource",
  description:
    "Ask for a missing paper, note or syllabus. Requests go straight into the admin queue and guide what gets sourced next.",
  alternates: { canonical: "/request" },
};

export default async function RequestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const options = getFilterOptions();

  return (
    <>
      <PageHeader
        eyebrow="Missing something?"
        title="Request a resource"
        description="Tell us the university, course and subject you need. We cannot promise a timeline, but every request is stored and visible to the admins sourcing new material."
      />

      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="card p-5 sm:p-7">
            <h2 className="mb-5 text-lg">What do you need?</h2>
            <RequestForm
              options={options}
              defaults={{
                university: first(params.university),
                programme: first(params.programme),
                branch: first(params.branch),
                semester: first(params.semester),
                subject: first(params.subject),
              }}
            />
          </div>

          <aside className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">What happens next</h2>
              </div>
              <ul className="mt-3 space-y-3 text-[0.8rem] leading-relaxed text-muted">
                <li>
                  <span className="font-medium text-ink">Logged with an ID.</span> You get a reference like
                  FRR-2026-AB12CD.
                </li>
                <li>
                  <span className="font-medium text-ink">Reviewed in the admin queue.</span> Requests are marked new,
                  in progress, fulfilled or closed.
                </li>
                <li>
                  <span className="font-medium text-ink">Material gets sourced.</span> If someone contributes it, it
                  appears in the library — requests are not emailed automatically.
                </li>
              </ul>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Check first</h2>
              </div>
              <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                Search by subject code before requesting. The paper may already be listed under a slightly different
                title.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link href="/resources" className="btn btn-secondary btn-sm">
                  Browse all resources
                </Link>
                <Link href="/search" className="btn btn-ghost btn-sm">
                  Search the library
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-mint/60 p-5">
              <div className="flex items-center gap-2">
                <Inbox size={16} className="text-primary" />
                <p className="text-sm font-medium">Already have it?</p>
              </div>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
                If you find the material elsewhere, contribute it so the request can be fulfilled for everyone.
              </p>
              <Link href="/contribute" className="btn btn-secondary btn-sm mt-3 w-full">
                Contribute a file
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
