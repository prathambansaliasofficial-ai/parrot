import ConfirmForm from "@/components/admin/confirm-form";
import { all } from "@/lib/db";
import { listCurricula, listInstitutions, listMappings } from "@/lib/acquisition/store";
import { RELATIONSHIP_LABELS } from "@/lib/acquisition/types";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ institution?: string; ok?: string; error?: string }>;
}) {
  const { institution: selectedId, ok, error } = await searchParams;
  const institutions = listInstitutions();
  const mappings = listMappings(selectedId);
  const allMappings = selectedId ? mappings : listMappings();
  const curricula = listCurricula("aktu");
  const universities = all<{ id: string; name: string; short_name: string }>(
    "SELECT id, name, short_name FROM universities WHERE status='published' ORDER BY short_name",
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Canonical mapping</p>
        <h1 className="mt-1 text-2xl">Institutions</h1>
        <p className="mt-1 text-sm text-muted">
          Colleges and autonomous institutes never duplicate the master syllabus. They map to it with a relationship, evidence and
          verification status.
        </p>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Add an institution</h2>
          <ConfirmForm className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <input type="hidden" name="action" value="save_institution" />
            <div className="sm:col-span-2">
              <label htmlFor="name" className="label">Name</label>
              <input id="name" name="name" placeholder="IEC College of Engineering & Technology" className="input" required />
            </div>
            <div>
              <label htmlFor="kind" className="label">Type</label>
              <select id="kind" name="kind" className="input" defaultValue="affiliated_college">
                <option value="university">University</option>
                <option value="affiliated_college">Affiliated college</option>
                <option value="autonomous">Autonomous institution</option>
                <option value="institute">Institute</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="universityId" className="label">Affiliating university</label>
              <select id="universityId" name="universityId" className="input" defaultValue="">
                <option value="">Not affiliated</option>
                {universities.map((university) => (
                  <option key={university.id} value={university.id}>{university.short_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="city" className="label">City</label>
              <input id="city" name="city" className="input" />
            </div>
            <div>
              <label htmlFor="website" className="label">Website</label>
              <input id="website" name="website" type="url" placeholder="https://" className="input" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-secondary btn-sm">Add institution</button>
              <p className="mt-1 text-[0.66rem] text-muted">
                New institutions start as “needs verification”. Nothing is mapped automatically.
              </p>
            </div>
          </ConfirmForm>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Map an institution to a syllabus</h2>
          <ConfirmForm className="mt-3 space-y-2.5">
            <input type="hidden" name="action" value="save_mapping" />
            <div>
              <label htmlFor="institutionId" className="label">Institution</label>
              <select id="institutionId" name="institutionId" className="input" defaultValue={selectedId ?? ""} required>
                <option value="">Choose…</option>
                {institutions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="curriculumId" className="label">Canonical curriculum</label>
              <select id="curriculumId" name="curriculumId" className="input" required>
                <option value="">Choose…</option>
                {curricula.map((curriculum) => (
                  <option key={curriculum.id} value={curriculum.id}>
                    {curriculum.programme_short} · {curriculum.branch_name ?? "All streams"} · {curriculum.scheme_label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="relation" className="label">Relationship</label>
              <select id="relation" name="relation" className="input" defaultValue="pending_verification">
                {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="evidenceUrl" className="label">Evidence URL</label>
              <input id="evidenceUrl" name="evidenceUrl" type="url" placeholder="https://college.ac.in/syllabus" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="academicYear" className="label">Academic year</label>
                <input id="academicYear" name="academicYear" placeholder="2025-26" className="input" />
              </div>
              <div>
                <label htmlFor="evidenceNote" className="label">Note</label>
                <input id="evidenceNote" name="evidenceNote" className="input" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-sm">Save mapping</button>
          </ConfirmForm>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">Institutions</h2>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[48rem] text-left text-xs">
            <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Institution</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">University</th>
                <th className="px-4 py-2 font-semibold">Mappings</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {institutions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">No institutions recorded yet.</td>
                </tr>
              )}
              {institutions.map((item) => (
                <tr key={item.id} className="hover:bg-paper/60">
                  <td className="px-4 py-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-[0.62rem] text-muted">{[item.city, item.state].filter(Boolean).join(", ") || "—"}</p>
                  </td>
                  <td className="px-4 py-2 capitalize text-muted">{item.kind.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-muted">{item.university_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    {item.mappingCount} <span className="text-[0.62rem] text-muted">({item.verifiedCount} verified)</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] ${item.status === "active" ? "bg-mint text-primary" : "bg-accent-soft text-accent"}`}>
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <a href={`/admin/acquisition/institutions?institution=${item.id}`} className="text-[0.68rem] text-primary hover:underline">
                      Mappings
                    </a>
                    <ConfirmForm className="ml-3 inline">
                      <input type="hidden" name="action" value="set_institution_status" />
                      <input type="hidden" name="institutionId" value={item.id} />
                      <input type="hidden" name="status" value={item.status === "active" ? "needs_verification" : "active"} />
                      <button type="submit" className="text-[0.68rem] text-muted hover:text-primary">
                        {item.status === "active" ? "Needs review" : "Mark active"}
                      </button>
                    </ConfirmForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">{selectedId ? "Mappings for this institution" : "All syllabus mappings"}</h2>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Institution</th>
                <th className="px-4 py-2 font-semibold">Curriculum</th>
                <th className="px-4 py-2 font-semibold">Relationship</th>
                <th className="px-4 py-2 font-semibold">Evidence</th>
                <th className="px-4 py-2 font-semibold">Verification</th>
                <th className="px-4 py-2 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {allMappings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">No mappings yet.</td>
                </tr>
              )}
              {allMappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-paper/60">
                  <td className="max-w-[16rem] px-4 py-2">
                    <p className="truncate font-medium">{mapping.institution_name}</p>
                  </td>
                  <td className="px-4 py-2">
                    {mapping.programme_short} · {mapping.branch_name ?? "All streams"} · {mapping.scheme_label}
                  </td>
                  <td className="px-4 py-2 text-muted">{RELATIONSHIP_LABELS[mapping.relation] ?? mapping.relation}</td>
                  <td className="max-w-[14rem] px-4 py-2">
                    {mapping.evidence_url ? (
                      <a href={mapping.evidence_url} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">
                        evidence
                      </a>
                    ) : (
                      <span className="text-muted">none</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] ${mapping.verification_status === "verified" ? "bg-mint text-primary" : "bg-accent-soft text-accent"}`}>
                      {mapping.verification_status}
                    </span>
                    {mapping.verified_at && <span className="ml-1 text-[0.6rem] text-muted">{formatDate(mapping.verified_at)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {mapping.verification_status !== "verified" && (
                      <ConfirmForm className="inline">
                        <input type="hidden" name="action" value="verify_mapping" />
                        <input type="hidden" name="mappingId" value={mapping.id} />
                        <input type="hidden" name="relation" value="exact" />
                        <button type="submit" className="text-[0.68rem] text-primary hover:underline">Verify as exact</button>
                      </ConfirmForm>
                    )}
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
