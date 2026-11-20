"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Save } from "lucide-react";

import type { AdminField } from "@/lib/admin-types";

type Props = {
  entity: string;
  fields: AdminField[];
  values?: Record<string, unknown>;
  id?: string;
};

export default function EntityForm({ entity, fields, values = {}, id }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      payload[field.name] =
        field.type === "checkbox" ? form.get(field.name) === "on" : String(form.get(field.name) ?? "");
    }

    setPending(true);
    setErrors({});
    setMessage("");
    try {
      const response = await fetch(`/api/admin/entities/${entity}${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(data.fields ?? {});
        setMessage(data.error ?? "Could not save this record.");
        return;
      }
      router.push(`/admin/entities/${entity}`);
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6">
      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const value = values[field.name];
          const error = errors[field.name];
          const wrapper = field.full ? "sm:col-span-2" : "";

          if (field.type === "checkbox") {
            return (
              <label key={field.name} className={`flex items-center gap-2 text-sm ${wrapper}`}>
                <input
                  type="checkbox"
                  name={field.name}
                  defaultChecked={Number(value) === 1 || value === true}
                  className="h-4 w-4 rounded border-line"
                />
                <span>{field.label}</span>
              </label>
            );
          }

          return (
            <div key={field.name} className={wrapper}>
              <label htmlFor={`f-${field.name}`} className="label">
                {field.label} {field.required && <span className="text-red-600">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={`f-${field.name}`}
                  name={field.name}
                  defaultValue={value == null ? "" : String(value)}
                  placeholder={field.placeholder}
                  rows={field.name === "syllabus_text" ? 8 : 4}
                  className="input resize-y"
                />
              ) : field.type === "select" ? (
                <select id={`f-${field.name}`} name={field.name} defaultValue={value == null ? "" : String(value)} className="input">
                  <option value="">{field.required ? "Choose…" : "None"}</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`f-${field.name}`}
                  name={field.name}
                  type={field.type === "number" ? "number" : field.type ?? "text"}
                  defaultValue={value == null ? "" : String(value)}
                  placeholder={field.placeholder}
                  className="input"
                />
              )}
              {field.help && !error && <p className="mt-1 text-[0.68rem] text-muted">{field.help}</p>}
              {error && <p className="mt-1 text-[0.7rem] text-red-700">{error}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
        <button type="submit" disabled={pending} className="btn btn-primary">
          <Save size={15} /> {pending ? "Saving…" : id ? "Save changes" : "Create"}
        </button>
        <Link href={`/admin/entities/${entity}`} className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
