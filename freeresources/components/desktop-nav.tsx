"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/universities", label: "Universities" },
  { href: "/resources", label: "Explore" },
  { href: "/pyqs", label: "PYQs" },
  { href: "/notes", label: "Notes" },
  { href: "/syllabus", label: "Syllabus" },
];

export default function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main navigation">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-2 text-[0.82rem] font-medium transition ${
              active ? "bg-mint text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
