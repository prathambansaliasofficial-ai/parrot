import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Copyright, LifeBuoy, Mail } from "lucide-react";

import PageHeader from "@/components/page-header";
import SupportForm from "@/components/support-form";
import { one } from "@/lib/db";
import { first, type SearchParams } from "@/lib/params";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Report a problem or contact support",
  description:
    "Report a broken download, an incorrect paper, a copyright concern or a technical issue. Every ticket gets a reference ID.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const resourceId = first(params.resource);
  const category = first(params.category);
  const resource = resourceId
    ? one<{ id: string; title: string; slug: string }>("SELECT id, title, slug FROM resources WHERE id = ?", [resourceId])
    : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Report a problem"
        description="Broken file, wrong paper, missing material or a copyright concern — tell us what happened. Tickets are stored with a reference ID so nothing gets lost."
      />

      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="card p-5 sm:p-7">
            {resource && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-paper px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 text-accent" />
                <div className="text-xs">
                  <p className="font-medium">Reporting a specific resource</p>
                  <Link href={`/resource/${resource.slug}`} className="text-primary hover:underline">
                    {resource.title}
                  </Link>
                </div>
              </div>
            )}
            <h2 className="mb-5 text-lg">Create a ticket</h2>
            <SupportForm resource={resource ?? null} defaultCategory={category} />
          </div>

          <aside className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <LifeBuoy size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Response expectations</h2>
              </div>
              <ul className="mt-3 space-y-2.5 text-[0.8rem] leading-relaxed text-muted">
                <li>Broken files are prioritised — the download link is checked and fixed.</li>
                <li>Copyright reports are reviewed before any other queue.</li>
                <li>General and business enquiries are answered by email.</li>
                <li>There is no live chat; every ticket is handled asynchronously.</li>
              </ul>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2">
                <Copyright size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Copyright / DMCA</h2>
              </div>
              <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                If your material was uploaded without permission, use the copyright category or read the{" "}
                <Link href="/dmca" className="text-primary hover:underline">
                  DMCA policy
                </Link>
                . Include the resource URL and proof of ownership.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-mint/60 p-5">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-primary" />
                <p className="text-sm font-medium">Email us directly</p>
              </div>
              <a
                href={`mailto:${SITE.email}`}
                className="mt-1 block text-[0.8rem] text-primary underline underline-offset-2"
              >
                {SITE.email}
              </a>
              <p className="mt-2 text-[0.72rem] text-muted">
                Use the form where possible so the ticket is tracked with an ID.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
