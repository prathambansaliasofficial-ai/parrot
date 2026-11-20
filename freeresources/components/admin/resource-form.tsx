"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, FileText, Save, Trash2, Upload } from "lucide-react";

import type { SubjectOption } from "@/lib/admin";
import type { FieldOption } from "@/lib/admin-types";
import { formatBytes } from "@/lib/format";

type ExistingFile = { id: string; originalName: string; sizeBytes: number; isPrimary: number };

type Props = {
  id?: string;
  resource?: Record<string, unknown>;
  subjects: SubjectOption[];
  categories: FieldOption[];
  sessions: string[];
  files?: ExistingFile[];
  slug?: string;
};

export default function ResourceForm({
  id,
  resource = {},
  subjects,
  categories,
  sessions,
  files = [],
  slug,
}: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [fileList, setFileList] = useState(files);
  const [fileError, setFileError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setErrors({});
    setMessage("");

    try {
      const response = await fetch(`/api/admin/resources${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(data.fields ?? {});
        setMessage(data.error ?? "The resource could not be saved.");
        return;
      }
      router.push("/admin/resources");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function removeFile(fileId: string) {
    if (!id || !confirm("Remove this file from the resource? The stored PDF will be deleted.")) return;
    setFileError("");
    const response = await fetch(`/api/admin/resources/${id}/files/${fileId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setFileError(data.error ?? "Could not remove the file.");
      return;
    }
    setFileList((current) => current.filter((file) => file.id !== fileId));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Resource</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="label">
              Title <span className="text-red-600">*</span>
            </label>
            <input
              id="title"
              name="title"
              defaultValue={String(resource.title ?? "")}
              placeholder="Data Structures — End Semester Paper 2024-25"
              className="input"
            />
            {errors.title && <p className="mt-1 text-[0.7rem] text-red-700">{errors.title}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="subject_id" className="label">
              Subject <span className="text-red-600">*</span>
            </label>
            <select id="subject_id" name="subject_id" defaultValue={String(resource.subject_id ?? "")} className="input">
              <option value="">Choose a subject…</option>
              {subjects.map((subject) => (
                <option key={subject.value} value={subject.value}>
                  {subject.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[0.68rem] text-muted">
              University, programme, branch and semester are taken from the subject.
            </p>
            {errors.subject_id && <p className="mt-1 text-[0.7rem] text-red-700">{errors.subject_id}</p>}
          </div>

          <div>
            <label htmlFor="category_id" className="label">
              Category <span className="text-red-600">*</span>
            </label>
            <select id="category_id" name="category_id" defaultValue={String(resource.category_id ?? "")} className="input">
              <option value="">Choose a category…</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            {errors.category_id && <p className="mt-1 text-[0.7rem] text-red-700">{errors.category_id}</p>}
          </div>

          <div>
            <label htmlFor="session" className="label">
              Academic session
            </label>
            <select id="session" name="session" defaultValue={String(resource.session ?? "")} className="input">
              <option value="">Not recorded</option>
              {sessions.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={String(resource.description ?? "")}
              rows={3}
              className="input resize-y"
              placeholder="What does this file contain? Mention scheme, paper type or any caveats."
            />
          </div>

          <div>
            <label htmlFor="status" className="label">
              Visibility
            </label>
            <select id="status" name="status" defaultValue={String(resource.status ?? "draft")} className="input">
              <option value="draft">Draft — hidden from students</option>
              <option value="published">Published — visible publicly</option>
            </select>
          </div>

          <div>
            <label htmlFor="contributor_name" className="label">
              Credit
            </label>
            <input
              id="contributor_name"
              name="contributor_name"
              defaultValue={String(resource.contributor_name ?? "")}
              placeholder="Student or source to credit"
              className="input"
            />
          </div>

          <div className="flex flex-wrap gap-5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="featured" defaultChecked={Number(resource.featured) === 1} className="h-4 w-4" />
              Feature on homepage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_sample" defaultChecked={Number(resource.is_sample) === 1} className="h-4 w-4" />
              Mark as sample / demonstration file
            </label>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">PDF files</h2>
          {slug && (
            <Link href={`/resource/${slug}`} target="_blank" className="btn btn-ghost btn-sm">
              <ExternalLink size={13} /> Public page
            </Link>
          )}
        </div>

        {fileList.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {fileList.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                <FileText size={15} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{file.originalName}</p>
                  <p className="text-[0.66rem] text-muted">
                    {formatBytes(file.sizeBytes)} {file.isPrimary ? "· primary" : "· version"}
                  </p>
                </div>
                {id && (
                  <>
                    <a
                      href={`/api/admin/resources/${id}/files/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.7rem] text-muted hover:text-primary"
                    >
                      Preview
                    </a>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      className="text-muted hover:text-red-700"
                      aria-label={`Remove ${file.originalName}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {fileError && <p className="mt-2 text-[0.7rem] text-red-700">{fileError}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="file" className="label">
              {id ? "Replace primary PDF (optional)" : "Primary PDF"} {!id && <span className="text-red-600">*</span>}
            </label>
            <input id="file" name="file" type="file" accept="application/pdf,.pdf" className="input file:mr-3 file:rounded file:border-0 file:bg-mint file:px-2 file:py-1 file:text-xs" />
            <p className="mt-1 text-[0.68rem] text-muted">
              PDF only, validated by content. {id ? "Replacing deletes the old primary file." : "Required to publish."}
            </p>
            {errors.file && <p className="mt-1 text-[0.7rem] text-red-700">{errors.file}</p>}
          </div>
          <div>
            <label htmlFor="extra_files" className="label">
              Add more versions (optional)
            </label>
            <input id="extra_files" name="extra_files" type="file" accept="application/pdf,.pdf" multiple className="input file:mr-3 file:rounded file:border-0 file:bg-mint file:px-2 file:py-1 file:text-xs" />
            <p className="mt-1 text-[0.68rem] text-muted">Up to 5 extra PDFs per save. They appear as versions.</p>
            {errors.extra_files && <p className="mt-1 text-[0.7rem] text-red-700">{errors.extra_files}</p>}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <Upload size={15} /> : <Save size={15} />}
          {pending ? "Saving…" : id ? "Save changes" : "Create resource"}
        </button>
        <Link href="/admin/resources" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
