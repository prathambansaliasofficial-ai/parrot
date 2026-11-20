import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { BrandMark } from "./brand";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
      <div className="hidden rounded-2xl border border-line bg-mint/70 p-9 lg:block">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-10 w-10" />
          <span className="font-display text-lg font-semibold">
            FreeResources<span className="text-accent">.in</span>
          </span>
        </div>
        <h2 className="mt-8 max-w-sm text-3xl leading-tight">An account is only for contributing.</h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Browsing, previewing and downloading stay free and open. Sign in to submit material, track its review and
          keep your contributions in one place.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            "Every submission is reviewed by a human",
            "Your name is credited when a file is published",
            "Sample and verified files are clearly separated",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />
              <span className="text-ink/80">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-muted">
          No account needed to{" "}
          <Link href="/resources" className="text-primary underline underline-offset-2">
            browse the library
          </Link>
          .
        </p>
      </div>

      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-[1.8rem] leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-line pt-4 text-xs text-muted">{footer}</div>}
      </div>
    </div>
  );
}
