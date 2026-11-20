import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Copyright, LifeBuoy, Mail } from "lucide-react";

import PageHeader from "@/components/page-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Contact the FreeResources team about a broken file, a copyright concern, advertising or a missing university.",
  alternates: { canonical: "/contact" },
};

const ROUTES = [
  {
    icon: LifeBuoy,
    title: "Broken file or wrong paper",
    body: "Use the support form so the ticket gets a reference ID and reaches the right queue.",
    href: "/support?category=broken-download",
    label: "Open support",
  },
  {
    icon: Copyright,
    title: "Copyright or takedown",
    body: "Include the resource URL and proof of ownership. Copyright reports are prioritised.",
    href: "/support?category=copyright",
    label: "Report copyright",
  },
  {
    icon: Building2,
    title: "Advertising or partnership",
    body: "Student-focused placements are available on the homepage and resource pages.",
    href: "/advertise",
    label: "Advertise with us",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to the team"
        description="There is no phone line or live chat. Email and support tickets are monitored, and every ticket is tracked."
      />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint text-primary">
              <Mail size={18} />
            </span>
            <div>
              <p className="text-sm font-medium">General email</p>
              <a href={`mailto:${SITE.email}`} className="text-sm text-primary underline underline-offset-2">
                {SITE.email}
              </a>
              <p className="mt-1 text-xs text-muted">
                For anything that does not fit the support categories. Replies usually take a few working days.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {ROUTES.map((route) => (
            <div key={route.title} className="card flex flex-col p-5">
              <route.icon size={18} className="text-primary" />
              <p className="mt-2 text-sm font-medium">{route.title}</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{route.body}</p>
              <Link href={route.href} className="mt-3 text-xs font-medium text-primary hover:underline">
                {route.label} →
              </Link>
            </div>
          ))}
        </div>

        <div className="prose-page mt-8">
          <h2>Missing university or subject?</h2>
          <p>
            Use the{" "}
            <Link href="/request" className="text-primary underline underline-offset-2">
              request form
            </Link>{" "}
            instead of email. It captures the university, programme, semester and subject so the request can be
            actioned without a back-and-forth.
          </p>
          <h2>What to include</h2>
          <ul>
            <li>The resource URL or subject code, where relevant.</li>
            <li>What you expected and what actually happened.</li>
            <li>Your ticket reference, if you are following up.</li>
          </ul>
          <p>
            Please do not send passwords, government IDs or other sensitive documents. We do not need them to fix a
            download.
          </p>
        </div>
      </div>
    </>
  );
}
