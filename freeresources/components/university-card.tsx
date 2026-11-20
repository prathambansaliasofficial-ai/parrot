import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";

import type { UniversityCard as UniversityCardType } from "@/lib/queries";

export default function UniversityCard({ university }: { university: UniversityCardType }) {
  return (
    <Link
      href={`/universities/${university.slug}`}
      className="card card-hover group flex h-full flex-col p-5"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint font-display text-[0.85rem] font-semibold text-primary">
          {university.shortName.slice(0, 4)}
        </span>
        <ArrowUpRight size={16} className="text-muted transition group-hover:text-primary" />
      </div>

      <h3 className="mt-3 font-display text-[1.02rem] leading-snug">{university.name}</h3>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[0.72rem] text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin size={12} />
          {university.city ? `${university.city}, ` : ""}
          {university.state}
        </span>
        <span>{university.resourceCount} files</span>
      </div>
    </Link>
  );
}
