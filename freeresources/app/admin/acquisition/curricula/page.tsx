import Link from "next/link";

import ConfirmForm from "@/components/admin/confirm-form";
import { all } from "@/lib/db";
import { listCurricula } from "@/lib/acquisition/store";

export const dynamic = "force-dynamic";

export default async function CurriculaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const curricula = listCurricula();
  const universities = all<{ id: string; short_name: string }>(
    "SELECT id, short_name FROM universities WHERE status='published' ORDER BY short_name",
  );
  const programmes = all<{ id: string; short_name: string }>("SELECT id, short_name FROM programmes ORDER BY short_name");
  const branches = all<{ id: string; name: string; programme_id: string }>(
    "SELECT id, name, programme_id FROM branches WHERE status='published' ORDER BY name",
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Master syllabus</p>
        <h1 className="mt-1 text-2xl">Canonical curriculum library</h1>
        <p className="mt-1 text-sm text-muted">
          AKTU owns the syllabus. Programmes, streams and scheme versions live here once; institutions map to them.
        </p>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Create a curriculum</h2>
        <ConfirmForm className="mt-3 grid gap-2.5 sm:grid-cols-5 sm:items-end">
          <input type="hidden" name="action" value="save_curriculum" />
          <div>
            <label htmlFor="universityId" className="label">University</label>
            <select id="universityId" name="universityId" className="input" required>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>{university.short_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="programmeId" className="label">Programme</label>
            <select id="programmeId" name="programmeId" className="input" required>
              {programmes.map((programme) => (
                <option key={programme.id} value={programme.id}>{programme.short_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="branchId" className="label">Stream</label>
            <select id="branchId" name="branchId" className="input" defaultValue="">
              <option value="">All streams</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="schemeLabel" className="label">Scheme</label>
            <input id="schemeLabel" name="schemeLabel" placeholder="R2022" className="input" required />
          </div>
          <div>
            <label htmlFor="schemeYear" className="label">Year</label>
            <input id="schemeYear" name="schemeYear" type="number" placeholder="2022" className="input" />
          </div>
          <div className="sm:col-span-5">
            <button type="submit" className="btn btn-primary btn-sm">Save curriculum</button>
          </div>
        </ConfirmForm>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Curriculum</th>
                <th className="px-4 py-2 font-semibold">Scheme</th>
                <th className="px-4 py-2 font-semibold">Subjects</th>
                <th className="px-4 py-2 font-semibold">Syllabus versions</th>
                <th className="px-4 py-2 font-semibold">Institutions</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {curricula.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No curricula yet. Create AKTU · B.Tech · CSE · R2022 to begin.
                  </td>
                </tr>
              )}
              {curricula.map((curriculum) => (
                <tr key={curriculum.id} className="hover:bg-paper/60">
                  <td className="px-4 py-2">
                    <p className="font-medium">
                      {curriculum.university_short} · {curriculum.programme_short}
                    </p>
                    <p className="text-[0.62rem] text-muted">{curriculum.branch_name ?? "All streams"}</p>
                  </td>
                  <td className="px-4 py-2">{curriculum.scheme_label}</td>
                  <td className="px-4 py-2">{curriculum.subjectCount}</td>
                  <td className="px-4 py-2">{curriculum.syllabusCount}</td>
                  <td className="px-4 py-2">{curriculum.institutionCount}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] ${curriculum.status === "active" ? "bg-mint text-primary" : "bg-paper text-muted"}`}>
                      {curriculum.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/acquisition/curricula/${curriculum.id}`} className="text-[0.68rem] font-medium text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
