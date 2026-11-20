import Link from "next/link";

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--primary)" />
      <path d="M11 12.5h7.2c2.1 0 3.8 1.7 3.8 3.8v11.2" stroke="var(--on-primary)" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M29 12.5h-4.2c-1.5 0-2.8 1.2-2.8 2.8v12.2" stroke="var(--on-primary)" strokeWidth="2.1" strokeLinecap="round" opacity="0.72" />
      <path d="M11 15.5h6.2M11 19h6.2M11 22.5h4.4" stroke="var(--on-primary)" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <circle cx="28.6" cy="27.6" r="2.4" fill="var(--accent)" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="FreeResources home">
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-[1.05rem] font-semibold tracking-tight text-ink">
          FreeResources<span className="text-accent">.in</span>
        </span>
        {!compact && (
          <span className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-muted">
            Open academic library
          </span>
        )}
      </span>
    </Link>
  );
}
