import Link from "next/link";
import { notFound } from "next/navigation";

import ConfirmForm from "@/components/admin/confirm-form";
import { all } from "@/lib/db";
import { getCurriculum } from "@/lib/acquisition/store";
import { RELATIONSHIP_LABELS } from "@/lib/acquisition/types";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CurriculumDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const data = getCurriculum(id);
  if (!data) notFound();
  const { curriculum, subjects, versions, units, mappings } = data;

  const university = all<{ id: string }>("SELECT id FROM universities WHERE slug = ?", [curriculum.university_slug])[0];
  const availableSubjects = university
    ? all<{ id: string; name: string; semester: number; code: string | null }>(
        `SELECT s.id, s.name, s.semester, s.code FROM subjects s
          WHERE s.university_id = ? AND s.programme_id = (SELECT id FROM programmes WHERE short_name = ?)
          ORDER BY s.semester, s.name`,
        [university.id, curriculum.programme_short],
      )
    : [];

  const unitsByVersion = new Map<string, typeof units>();
  for (const unit of units) {
    const list = unitsByVersion.get(unit.syllabus_version_id) ?? [];
    list.push(unit);
    unitsByVersion.set(unit.syllabus_version_id, list);
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/acquisition/curricula" className="text-[0.68rem] text-muted hover:text-primary">
          ← Syllabus library
        </Link>
        <h1 className="mt-1 text-xl">
          {curriculum.university_short} · {curriculum.programme_short} · {curriculum.branch_name ?? "All streams"}
        </h1>
        <p className="mt-1 text-xs text-muted">
          Scheme {curriculum.scheme_label}
          {curriculum.scheme_year ? ` (${curriculum.scheme_year})` : ""} · {subjects.length} subjects · {versions.length} syllabus
          versions · {curriculum.institutionCount} mapped institutions
        </p>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Attach a subject</h2>
          <ConfirmForm className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <input type="hidden" name="action" value="add_curriculum_subject" />
            <input type="hidden" name="curriculumId" value={curriculum.id} />
            <div className="sm:col-span-2">
              <label htmlFor="subjectId" className="label">Subject</label>
              <select id="subjectId" name="subjectId" className="input" required>
                <option value="">Choose…</option>
                {availableSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    Sem {subject.semester} · {subject.name} {subject.code ? `(${subject.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="semester" className="label">Semester in this curriculum</label>
              <input id="semester" name="semester" type="number" min={1} max={12} className="input" required />
            </div>
            <div>
              <label htmlFor="sequence" className="label">Order</label>
              <input id="sequence" name="sequence" type="number" min={0} defaultValue={0} className="input" />
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input type="checkbox" name="isElective" value="1" className="h-4 w-4" /> Elective
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-secondary btn-sm">Attach subject</button>
            </div>
          </ConfirmForm>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Record a syllabus version</h2>
          <ConfirmForm className="mt-3 space-y-2.5">
            <input type="hidden" name="action" value="save_syllabus_version" />
            <input type="hidden" name="curriculumId" value={curriculum.id} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="versionLabel" className="label">Version label</label>
                <input id="versionLabel" name="versionLabel" placeholder="2025-26" className="input" required />
              </div>
              <div>
                <label htmlFor="academicYear" className="label">Academic year</label>
                <input id="academicYear" name="academicYear" placeholder="2025-26" className="input" />
              </div>
            </div>
            <div>
              <label htmlFor="subjectIdVersion" className="label">Subject (optional)</label>
              <select id="subjectIdVersion" name="subjectId" className="input" defaultValue="">
                <option value="">Whole curriculum</option>
                {subjects.map((subject) => (
                  <option key={subject.subject_id} value={subject.subject_id}>{subject.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="unitsText" className="label">Units text (optional)</label>
              <textarea
                id="unitsText"
                name="unitsText"
                rows={3}
                placeholder="Paste the syllabus text; UNIT headings are parsed automatically."
                className="input resize-y text-[0.7rem]"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">Save version</button>
          </ConfirmForm>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">Subjects</h2>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[42rem] text-left text-xs">
            <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Subject</th>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold">Sem</th>
                <th className="px-4 py-2 font-semibold">Credits</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Units extracted</th>
                <th className="px-4 py-2 font-semibold">Versions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">No subjects attached yet.</td>
                </tr>
              )}
              {subjects.map((subject) => (
                <tr key={subject.id} className="hover:bg-paper/60">
                  <td className="px-4 py-2 font-medium">{subject.name}</td>
                  <td className="px-4 py-2 font-mono text-[0.65rem] text-muted">{subject.code ?? "—"}</td>
                  <td className="px-4 py-2">{subject.semester}</td>
                  <td className="px-4 py-2">{subject.credits_override ?? subject.credits ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{subject.is_elective ? "Elective" : "Core"}</td>
                  <td className="px-4 py-2">{subject.unitCount}</td>
                  <td className="px-4 py-2">{subject.versionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Syllabus versions</h2>
          {versions.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No versions recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2.5 text-xs">
              {versions.map((version) => (
                <li key={version.id} className="rounded-lg border border-line px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{version.version_label}</span>
                    <span className="rounded-full bg-paper px-2 py-0.5 text-[0.6rem]">{version.status}</span>
                    {version.academic_year && <span className="text-[0.65rem] text-muted">{version.academic_year}</span>}
                    <span className="ml-auto text-[0.62rem] text-muted">{formatDate(version.verified_at)}</span>
                  </p>
                  <p className="text-[0.65rem] text-muted">
                    {version.subject_name ?? "Whole curriculum"}
                    {version.confidence !== null ? ` · confidence ${Math.round(Number(version.confidence) * 100)}%` : ""}
                  </p>
                  {unitsByVersion.get(version.id)?.length ? (
                    <ol className="mt-1.5 space-y-1 border-t border-line pt-1.5">
                      {unitsByVersion.get(version.id)!.map((unit) => (
                        <li key={unit.id} className="text-[0.65rem]">
                          <span className="font-medium">Unit {unit.unit_no}</span>
                          {unit.title ? ` · ${unit.title}` : ""}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-1 text-[0.62rem] text-muted">No units parsed for this version.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Mapped institutions</h2>
          {mappings.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No institution mapped to this curriculum yet.{" "}
              <Link href="/admin/acquisition/institutions" className="text-primary hover:underline">Add a mapping</Link>.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {mappings.map((mapping) => (
                <li key={mapping.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="font-medium">{mapping.institution_name}</span>
                  <span className="text-[0.62rem] text-muted">{RELATIONSHIP_LABELS[mapping.relation] ?? mapping.relation}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[0.6rem] ${
                      mapping.verification_status === "verified" ? "bg-mint text-primary" : "bg-accent-soft text-accent"
                    }`}
                  >
                    {mapping.verification_status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
