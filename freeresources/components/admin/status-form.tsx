"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type StatusOption = { value: string; label: string };

type Props = {
  endpoint: string;
  status: string;
  statuses: StatusOption[];
  notes?: string | null;
  notesField: "admin_notes" | "admin_reply";
  notesLabel: string;
  notesPlaceholder?: string;
};

export default function StatusForm({
  endpoint,
  status,
  statuses,
  notes,
  notesField,
  notesLabel,
  notesPlaceholder,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [note, setNote] = useState(notes ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value, notes: note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not update.");
        return;
      }
      setMessage("Updated.");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-sm font-semibold">Manage</h2>
      <div className="mt-3">
        <label htmlFor={`status-${notesField}`} className="label">
          Status
        </label>
        <select
          id={`status-${notesField}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="input"
        >
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        <label htmlFor={notesField} className="label">
          {notesLabel}
        </label>
        <textarea
          id={notesField}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={2000}
          className="input resize-y"
          placeholder={notesPlaceholder}
        />
        <p className="mt-1 text-[0.66rem] text-muted">
          Internal notes are not emailed automatically; copy the reply manually if you need to contact the student.
        </p>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {message && <p className="mt-2 text-xs text-primary">{message}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm mt-3">
        <Save size={14} /> {pending ? "Saving…" : "Save update"}
      </button>
    </form>
  );
}
