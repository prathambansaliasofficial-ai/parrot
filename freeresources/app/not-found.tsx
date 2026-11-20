import Link from "next/link";
import { Compass, Search } from "lucide-react";

import SearchBar from "@/components/search-bar";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mint text-primary">
        <Compass size={26} />
      </span>
      <p className="mt-4 font-mono text-xs text-muted">404</p>
      <h1 className="mt-1 font-display text-3xl">This shelf is empty</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        The page you asked for does not exist, or the resource was moved or removed. Try searching for the subject or
        subject code instead.
      </p>
      <div className="mt-5 w-full">
        <SearchBar placeholder="Search subject, code or university…" />
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary btn-sm">
          Back home
        </Link>
        <Link href="/resources" className="btn btn-secondary btn-sm">
          <Search size={14} /> Explore resources
        </Link>
        <Link href="/universities" className="btn btn-ghost btn-sm">
          Universities
        </Link>
      </div>
    </div>
  );
}
