import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, LayoutTemplate, Megaphone, ShieldCheck } from "lucide-react";

import PageHeader from "@/components/page-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Advertise with FreeResources",
  description:
    "Reach students searching for university papers, notes and syllabus. Honest, clearly labelled placements on a focused academic library.",
  alternates: { canonical: "/advertise" },
};

export default function AdvertisePage() {
  return (
    <>
      <PageHeader
        eyebrow="Advertise"
        title="Reach students at the moment they are studying"
        description="FreeResources is used by students looking for a specific subject, semester or paper — not idle scrolling. Placements are limited and always labelled as advertising."
      />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: LayoutTemplate,
              title: "Homepage placement",
              body: "A single, clearly marked slot near the resource shelves. No pop-ups, no interstitials.",
            },
            {
              icon: Megaphone,
              title: "Resource-page placement",
              body: "Contextual placement beside study material, configured per slot from the admin dashboard.",
            },
            {
              icon: ShieldCheck,
              title: "Student-first rules",
              body: "No gambling, predatory loans, essay mills or unverified coaching claims. We can refuse any ad.",
            },
            {
              icon: BarChart3,
              title: "Honest reporting",
              body: "We report what we can measure. We will not invent impressions, clicks or conversion numbers.",
            },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <item.icon size={18} className="text-primary" />
              <p className="mt-2 text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="prose-page mt-9">
          <h2>Current availability</h2>
          <p>
            Paid placements are not active yet. The platform has ad slots built into the database and admin panel, so
            campaigns can be added without a code change, but no advertiser is currently running. We will publish
            rates only once there is real traffic to justify them.
          </p>

          <h2>How a campaign works</h2>
          <ul>
            <li>You send the creative, target URL and preferred slot.</li>
            <li>We review the product for student suitability before accepting.</li>
            <li>An admin adds the placement and marks it active.</li>
            <li>Sponsored content is visually labelled; it never disguises itself as study material.</li>
          </ul>

          <h2>Enquiries</h2>
          <p>
            Email{" "}
            <a href={`mailto:${SITE.email}`} className="text-primary underline underline-offset-2">
              {SITE.email}
            </a>{" "}
            with “Advertising” in the subject line, or open a business enquiry ticket.
          </p>
          <div className="not-prose mt-4 flex flex-wrap gap-2">
            <Link href="/support?category=business-enquiry" className="btn btn-primary btn-sm">
              Business enquiry
            </Link>
            <Link href="/about" className="btn btn-secondary btn-sm">
              About the platform
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
