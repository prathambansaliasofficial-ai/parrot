import Link from "next/link";
import { Search } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";

import { BrandLockup } from "./brand";
import DesktopNav from "./desktop-nav";
import LogoutButton from "./logout-button";
import MobileNav from "./mobile-nav";
import SearchBar from "./search-bar";
import ThemeToggle from "./theme-toggle";

export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLockup />

        <div className="ml-2 hidden lg:block">
          <DesktopNav />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden w-56 xl:block">
            <SearchBar variant="compact" placeholder="Search subject or code..." />
          </div>
          <Link href="/search" className="btn btn-ghost h-9 w-9 !p-0 xl:hidden" aria-label="Search">
            <Search size={17} />
          </Link>

          <ThemeToggle />

          <div className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden="true" />

          <Link href="/contribute" className="btn btn-secondary btn-sm hidden md:inline-flex">
            Contribute
          </Link>

          {user ? (
            <div className="hidden items-center gap-1 md:flex">
              <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="btn btn-primary btn-sm">
                {user.role === "admin" ? "Admin" : "Dashboard"}
              </Link>
              <LogoutButton compact />
            </div>
          ) : (
            <div className="hidden items-center gap-1 sm:flex">
              <Link href="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </div>
          )}

          <MobileNav user={user ? { name: user.name, role: user.role } : null} />
        </div>
      </div>
    </header>
  );
}
