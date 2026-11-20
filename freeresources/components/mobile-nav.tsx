"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import SearchBar from "./search-bar";

type NavUser = { name: string; role: "student" | "admin" } | null;

const LINKS = [
  { href: "/universities", label: "Universities" },
  { href: "/resources", label: "Explore resources" },
  { href: "/pyqs", label: "Previous year papers" },
  { href: "/notes", label: "Notes" },
  { href: "/syllabus", label: "Syllabus" },
  { href: "/community", label: "Community" },
  { href: "/request", label: "Request a resource" },
  { href: "/support", label: "Report / support" },
];

export default function MobileNav({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost h-9 w-9 !p-0 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto bg-paper p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <span className="font-display text-lg font-semibold">FreeResources.in</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost h-9 w-9 !p-0"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <SearchBar variant="compact" placeholder="Search subject or code..." />

            <nav className="mt-5 flex flex-col" aria-label="Mobile navigation">
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg border-b border-line/70 px-2 py-3 text-[0.95rem] ${
                      active ? "font-semibold text-primary" : "text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 flex flex-col gap-2">
              <Link href="/contribute" className="btn btn-primary w-full">
                Contribute resources
              </Link>
              {user ? (
                <>
                  <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="btn btn-secondary w-full">
                    {user.role === "admin" ? "Admin dashboard" : "My dashboard"}
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="btn btn-ghost w-full" type="submit">
                      Log out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-secondary w-full">
                    Log in
                  </Link>
                  <Link href="/signup" className="btn btn-ghost w-full">
                    Create an account
                  </Link>
                </>
              )}
            </div>

            <p className="mt-auto pt-8 text-xs text-muted">
              Free for every student. Sample files are always labelled.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
