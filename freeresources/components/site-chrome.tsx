"use client";

import { usePathname } from "next/navigation";

import ParrotAI from "./parrot-ai";

/**
 * Admin pages have their own shell. The public chrome is rendered on the
 * server and passed in, so client navigation can hide it without importing
 * server-only components into this bundle.
 */
export default function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    return (
      <main id="main" className="min-h-screen">
        {children}
      </main>
    );
  }

  return (
    <>
      {header}
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      {footer}
      <ParrotAI />
    </>
  );
}
