import Link from "next/link";
import { FileQuestion } from "lucide-react";
import type { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint text-primary">
        <FileQuestion size={22} />
      </span>
      <h3 className="mt-4 font-display text-xl">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {(actionHref || children) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actionHref && actionLabel && (
            <Link href={actionHref} className="btn btn-primary btn-sm">
              {actionLabel}
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
