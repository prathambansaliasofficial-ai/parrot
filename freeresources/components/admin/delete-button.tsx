"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type Props = {
  href: string;
  redirectTo: string;
  label?: string;
  warning?: string;
  compact?: boolean;
};

export default function DeleteButton({ href, redirectTo, label = "Delete", warning, compact = false }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!confirm(warning ?? "Delete this record? This cannot be undone.")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(href, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not delete.");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={compact ? "" : "flex items-center gap-2"}>
      <button type="button" onClick={remove} disabled={pending} className="btn btn-ghost btn-sm text-red-700">
        <Trash2 size={14} /> {pending ? "Deleting…" : label}
      </button>
      {error && <span className="text-[0.7rem] text-red-700">{error}</span>}
    </div>
  );
}
