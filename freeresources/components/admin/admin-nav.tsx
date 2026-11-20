"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV } from "@/lib/admin-nav";

export default function AdminNav() {
  const pathname = usePathname();

  function active(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const linkClass = (href: string) =>
    `block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[0.78rem] transition ${
      active(href) ? "bg-mint font-medium text-primary" : "text-ink/75 hover:bg-paper hover:text-ink"
    }`;

  return (
    <nav aria-label="Admin">
      <ul className="flex gap-1 lg:block lg:space-y-0.5">
        {ADMIN_NAV.map((item) =>
          "href" in item ? (
            <li key={item.href}>
              <Link href={item.href} className={linkClass(item.href)}>
                {item.label}
              </Link>
            </li>
          ) : (
            <li key={item.label} className="lg:pt-3">
              <p className="hidden px-2.5 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted lg:block">
                {item.label}
              </p>
              <ul className="flex gap-1 lg:block lg:space-y-0.5">
                {item.items.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass(link.href)}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
