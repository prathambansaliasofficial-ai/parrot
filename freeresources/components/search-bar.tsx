"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Suggestion = {
  type: string;
  label: string;
  sublabel: string;
  href: string;
};

export default function SearchBar({
  variant = "hero",
  defaultValue = "",
  placeholder = "Search university, subject, subject code or resource...",
  autoFocus = false,
}: {
  variant?: "hero" | "compact" | "filters";
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = (await response.json()) as { items: Suggestion[] };
          setItems(data.items);
          setOpen(true);
        }
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
      setOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === "Enter") {
      if (open && active >= 0 && items[active]) {
        event.preventDefault();
        router.push(items[active].href);
      } else {
        event.preventDefault();
        submit(value);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const isHero = variant === "hero";

  return (
    <div ref={boxRef} className={`relative ${isHero ? "w-full" : "w-full"}`}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className={`flex items-center gap-2 rounded-full border bg-surface pl-4 pr-1.5 transition ${
          isHero ? "border-line/90 py-1.5 shadow-[0_18px_50px_-32px_rgba(9,42,32,0.55)]" : "border-line py-1"
        }`}
      >
        <Search size={isHero ? 19 : 16} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={placeholder}
          aria-label="Search the resource library"
          autoFocus={autoFocus}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/80 ${
            isHero ? "py-2.5 text-[0.95rem]" : "py-1.5 text-sm"
          }`}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setItems([]);
              setOpen(false);
            }}
            className="rounded-full p-1 text-muted hover:text-ink"
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="submit"
          className={`btn btn-primary shrink-0 ${isHero ? "px-5 py-2.5" : "btn-sm px-3"}`}
        >
          Search
        </button>
      </form>

      {open && (items.length > 0 || (!loading && value.trim().length >= 2)) && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-black/10">
          {items.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted">
              No matches yet. Try a subject code like <span className="font-medium text-ink">BCS301</span>.
            </p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto py-1.5">
              {items.map((item, index) => (
                <li key={`${item.href}-${index}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => router.push(item.href)}
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${
                      active === index ? "bg-mint" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="mt-0.5 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted">
                      {item.type}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                      <span className="block truncate text-xs text-muted">{item.sublabel}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line bg-paper/60 px-4 py-2 text-[0.68rem] text-muted">
            Press Enter to see all results
          </div>
        </div>
      )}
    </div>
  );
}
