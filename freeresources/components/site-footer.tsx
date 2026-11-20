import Link from "next/link";

import { SITE } from "@/lib/site";

import { BrandMark } from "./brand";

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { href: "/universities", label: "Universities" },
      { href: "/resources", label: "All resources" },
      { href: "/pyqs", label: "Previous year papers" },
      { href: "/notes", label: "Notes" },
      { href: "/syllabus", label: "Syllabus" },
    ],
  },
  {
    title: "Participate",
    links: [
      { href: "/contribute", label: "Contribute resources" },
      { href: "/request", label: "Request a resource" },
      { href: "/community", label: "Community" },
      { href: "/support", label: "Report / support" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "FreeResources",
    links: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms & conditions" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-9 w-9" />
              <span className="font-display text-lg font-semibold">
                FreeResources<span className="text-accent">.in</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A free, student-run academic library for Indian universities.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{column.title}</h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-ink/80 transition hover:text-primary">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {SITE.domain}. Built by students, for students.</p>
          <p>
            Questions?{" "}
            <a href={`mailto:${SITE.email}`} className="text-ink underline-offset-2 hover:text-primary hover:underline">
              {SITE.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
