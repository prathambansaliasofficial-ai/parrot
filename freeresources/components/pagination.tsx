import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";


export default function Pagination({
  page,
  pages,
  params,
  basePath,
}: {
  page: number;
  pages: number;
  params: Record<string, string | string[] | undefined>;
  basePath: string;
}) {
  if (pages <= 1) return null;

  const hrefFor = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value) next.set(key, value);
      else if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    }
    if (target > 1) next.set("page", String(target));
    else next.delete("page");
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const windowStart = Math.max(1, Math.min(page - 1, pages - 2));
  const numbers: number[] = [];
  for (let i = windowStart; i < windowStart + 3 && i <= pages; i += 1) numbers.push(i);

  return (
    <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn btn-secondary btn-sm" rel="prev">
          <ChevronLeft size={15} /> Previous
        </Link>
      ) : (
        <span className="btn btn-secondary btn-sm pointer-events-none opacity-40">
          <ChevronLeft size={15} /> Previous
        </span>
      )}

      <div className="flex items-center gap-1">
        {numbers.map((n) => (
          <Link
            key={n}
            href={hrefFor(n)}
            aria-current={n === page ? "page" : undefined}
            className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-medium transition ${
              n === page ? "bg-primary text-on-primary" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {n}
          </Link>
        ))}
      </div>

      {page < pages ? (
        <Link href={hrefFor(page + 1)} className="btn btn-secondary btn-sm" rel="next">
          Next <ChevronRight size={15} />
        </Link>
      ) : (
        <span className="btn btn-secondary btn-sm pointer-events-none opacity-40">
          Next <ChevronRight size={15} />
        </span>
      )}
    </nav>
  );
}
