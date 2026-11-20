import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, MessagesSquare, PenLine, ShieldCheck, Users } from "lucide-react";

import PageHeader from "@/components/page-header";
import { getCommunityLinks } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Student communities, contribution opportunities and moderation principles for the FreeResources library.",
  alternates: { canonical: "/community" },
};

export default function CommunityPage() {
  const links = getCommunityLinks();

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Built by students who share"
        description="A library only works when the people who have the paper pass it on. Here is how to take part — and how we keep it trustworthy."
      />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: PenLine,
              title: "Contribute",
              body: "Upload a paper, notes or syllabus from a subject you have already completed.",
              href: "/contribute",
              cta: "Upload a file",
            },
            {
              icon: MessagesSquare,
              title: "Request",
              body: "Tell us what is missing for your semester and we will queue it for contributors.",
              href: "/request",
              cta: "Request material",
            },
            {
              icon: ShieldCheck,
              title: "Report",
              body: "Flag a wrong paper, a broken file or a copyright issue so it can be fixed.",
              href: "/support",
              cta: "Open a ticket",
            },
          ].map((item) => (
            <div key={item.title} className="card flex flex-col p-5">
              <item.icon size={18} className="text-primary" />
              <p className="mt-2 text-sm font-medium">{item.title}</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{item.body}</p>
              <Link href={item.href} className="mt-3 text-xs font-medium text-primary hover:underline">
                {item.cta} →
              </Link>
            </div>
          ))}
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Community channels</h2>
            <span className="text-xs text-muted">{links.length} listed</span>
          </div>

          {links.length === 0 ? (
            <div className="card mt-4 flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint text-primary">
                <Users size={20} />
              </span>
              <h3 className="mt-3 font-display text-lg">No channels are listed yet</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                We only publish Telegram or WhatsApp groups that have been verified with their moderators. Rather than
                inventing links or member counts, this section stays empty until a real group is added by an
                administrator.
              </p>
              <p className="mt-2 max-w-md text-xs text-muted">
                Run a community for your university?{" "}
                <Link href="/support?category=general-enquiry" className="text-primary hover:underline">
                  Send us the details
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {links.map((link) => (
                <li key={link.id} className="card flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{link.label}</p>
                    <p className="mt-0.5 text-xs capitalize text-muted">
                      {link.platform}
                      {link.universityShort ? ` · ${link.universityShort}` : " · All universities"}
                    </p>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    Join <ExternalLink size={13} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="prose-page">
            <h2>How we moderate</h2>
            <ul>
              <li>Every uploaded file is checked for type, size and a valid PDF signature before it is stored.</li>
              <li>Contributions stay in a review queue until a moderator checks the metadata and opens the file.</li>
              <li>Demo files are permanently labelled SAMPLE; they are never presented as real papers.</li>
              <li>Copyright complaints are actioned before any debate about ownership.</li>
              <li>We do not publish member counts, download charts or activity that we cannot verify.</li>
            </ul>
            <h2>What makes a good contribution</h2>
            <p>
              A clear title, the correct subject and semester, the exam session for a paper, and a file that is
              readable when rotated. If you have both the paper and the solution, upload them as separate resources
              rather than merging them into one PDF.
            </p>
          </div>

          <aside className="card h-fit p-5">
            <p className="text-sm font-medium">Find your university hub</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Subject shelves, papers and syllabus are organised by institution. Start there if you are looking for
              material rather than a group.
            </p>
            <Link href="/universities" className="btn btn-primary btn-sm mt-3 w-full">
              Browse universities
            </Link>
            <Link href="/resources" className="btn btn-ghost btn-sm mt-2 w-full">
              Explore all resources
            </Link>
          </aside>
        </section>
      </div>
    </>
  );
}
