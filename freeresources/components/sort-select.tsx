"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "downloads", label: "Most downloaded" },
  { value: "title", label: "Title A–Z" },
];

export default function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "recent";

  function change(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "recent") next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">Sort</span>
      <select
        value={current}
        onChange={(event) => change(event.target.value)}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
