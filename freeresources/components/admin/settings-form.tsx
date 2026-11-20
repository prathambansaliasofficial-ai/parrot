"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type SettingField = { key: string; label: string; help: string; value: string; rows?: number; max: number };

export default function SettingsForm({ fields }: { fields: SettingField[] }) {
  const router = useRouter();
  const [values, setValues] = useState(Object.fromEntries(fields.map((field) => [field.key, field.value])));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not save settings.");
        return;
      }
      setMessage("Homepage copy saved. Reload the public homepage to see it.");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      {fields.map((field) => (
        <div key={field.key}>
          <label htmlFor={field.key} className="label">
            {field.label}
          </label>
          {field.rows ? (
            <textarea
              id={field.key}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              rows={field.rows}
              maxLength={field.max}
              className="input resize-y"
            />
          ) : (
            <input
              id={field.key}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              maxLength={field.max}
              className="input"
            />
          )}
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-[0.68rem] text-muted">{field.help}</p>
            <span className="shrink-0 text-[0.62rem] text-muted">
              {(values[field.key] ?? "").length}/{field.max}
            </span>
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-700">{error}</p>}
      {message && <p className="text-xs text-primary">{message}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        <Save size={14} /> {pending ? "Saving…" : "Save homepage copy"}
      </button>
    </form>
  );
}
