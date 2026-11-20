import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import AdminCopilot from "@/components/admin/copilot";
import AdminNav from "@/components/admin/admin-nav";
import LogoutButton from "@/components/logout-button";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · FreeResources admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-display text-sm text-paper">
              F
            </span>
            <span className="text-sm font-medium">
              FreeResources <span className="text-muted">Admin</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden text-xs text-muted sm:inline">{user.email}</span>
            <Link href="/" target="_blank" className="btn btn-ghost btn-sm">
              <ExternalLink size={14} /> <span className="hidden sm:inline">View site</span>
            </Link>
            <LogoutButton compact />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <div className="grid gap-6 py-6 lg:grid-cols-[15rem_1fr]">
          <aside className="lg:sticky lg:top-6 lg:h-fit">
            <div className="overflow-x-auto rounded-xl border border-line bg-surface p-2 lg:overflow-visible">
              <AdminNav />
            </div>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </div>

      <AdminCopilot />
    </div>
  );
}
