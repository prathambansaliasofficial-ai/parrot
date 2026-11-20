import Link from "next/link";
import { Radar } from "lucide-react";

import ConfirmForm from "@/components/admin/confirm-form";
import { all, one } from "@/lib/db";
import { candidateNote, searchProviders } from "@/lib/acquisition/discovery";
import { listCandidates, listCoverageGaps, listRuns } from "@/lib/acquisition/store";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HunterPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; ok?: string; error?: string }>;
}) {
  const { run: runId, ok, error } = await searchParams;
  const runs = listRuns(12);
  const activeRun = runId ?? runs[0]?.id;
  const candidates = activeRun ? listCandidates(activeRun) : [];
  const gaps = listCoverageGaps("aktu", 40);
  const subjects = all<{ id: string; name: string; code: string | null; semester: number }>(
    `SELECT s.id, s.name, s.code, s.semester FROM subjects s JOIN universities u ON u.id=s.university_id
      WHERE u.slug='aktu' AND s.status='published' ORDER BY s.semester, s.name LIMIT 400`,
  );
  const providers = searchProviders();
  const settings = one<{ value: string }>("SELECT value FROM acquisition_settings WHERE key='auto_select_threshold'");
  const threshold = Number(settings?.value ?? 0.75);

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Phase one</p>
        <h1 className="mt-1 text-2xl">AI syllabus hunter</h1>
        <p className="mt-1 text-sm text-muted">
          Coverage-driven discovery of AKTU syllabi from official sources, college mirrors and permitted search providers.
        </p>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Start a discovery run</h2>
          <ConfirmForm className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="action" value="start_discovery" />
            <input type="hidden" name="universitySlug" value="aktu" />
            <div>
              <label htmlFor="programmeSlug" className="label">Programme</label>
              <select id="programmeSlug" name="programmeSlug" className="input" defaultValue="">
                <option value="">All programmes</option>
                <option value="btech">B.Tech</option>
                <option value="bca">BCA</option>
                <option value="mba">MBA</option>
              </select>
            </div>
            <div>
              <label htmlFor="semester" className="label">Semester</label>
              <select id="semester" name="semester" className="input" defaultValue="">
                <option value="">All semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => (
                  <option key={semester} value={semester}>{semester}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="limit" className="label">Gaps to chase</label>
              <input id="limit" name="limit" type="number" min={1} max={25} defaultValue={5} className="input" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full">
                <Radar size={14} /> Queue discovery
              </button>
            </div>
          </ConfirmForm>
          <p className="mt-3 text-[0.68rem] text-muted">
            Providers: {providers.map((provider) => `${provider.label}${provider.configured() ? "" : " (needs a key)"}`).join(", ")}.
            Candidates scoring ≥ {threshold.toFixed(2)} are queued automatically for processing.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Add a document by URL</h2>
          <p className="mt-1 text-xs text-muted">Use this for a syllabus you found yourself. The worker fetches and validates it.</p>
          <ConfirmForm className="mt-3 space-y-2.5">
            <input type="hidden" name="action" value="add_manual_url" />
            <div>
              <label htmlFor="url" className="label">PDF URL</label>
              <input id="url" name="url" type="url" placeholder="https://aktu.ac.in/…/syllabus.pdf" className="input" required />
            </div>
            <div>
              <label htmlFor="subjectId" className="label">Subject</label>
              <select id="subjectId" name="subjectId" className="input" required>
                <option value="">Choose a subject…</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    Sem {subject.semester} · {subject.name} {subject.code ? `(${subject.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">Queue URL</button>
          </ConfirmForm>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold">Coverage gaps</h2>
          <span className="text-[0.68rem] text-muted">{gaps.length} AKTU subjects with no published syllabus</span>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[44rem] text-left text-xs">
            <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Subject</th>
                <th className="px-4 py-2 font-semibold">Programme</th>
                <th className="px-4 py-2 font-semibold">Stream</th>
                <th className="px-4 py-2 font-semibold">Sem</th>
                <th className="px-4 py-2 font-semibold">Curriculum</th>
                <th className="px-4 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {gaps.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Every AKTU subject has a published syllabus — nothing to chase.
                  </td>
                </tr>
              )}
              {gaps.map((gap) => (
                <tr key={gap.subject_id} className="hover:bg-paper/60">
                  <td className="px-4 py-2">
                    <p className="font-medium">{gap.name}</p>
                    {gap.code && <p className="font-mono text-[0.62rem] text-muted">{gap.code}</p>}
                  </td>
                  <td className="px-4 py-2">{gap.programme_short}</td>
                  <td className="px-4 py-2 text-muted">{gap.branch_name ?? "Common"}</td>
                  <td className="px-4 py-2">{gap.semester}</td>
                  <td className="px-4 py-2 text-[0.65rem] text-muted">{gap.curriculum_id ? "linked" : "no curriculum"}</td>
                  <td className="px-4 py-2 text-right">
                    <ConfirmForm className="inline">
                      <input type="hidden" name="action" value="start_discovery" />
                      <input type="hidden" name="universitySlug" value="aktu" />
                      <input type="hidden" name="subjectId" value={gap.subject_id} />
                      <input type="hidden" name="limit" value="1" />
                      <button type="submit" className="text-[0.68rem] font-medium text-primary hover:underline">
                        Find syllabus
                      </button>
                    </ConfirmForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <section className="card p-3">
          <h2 className="px-1 text-sm font-semibold">Runs</h2>
          <ul className="mt-2 space-y-1">
            {runs.length === 0 && <li className="px-1 py-2 text-xs text-muted">No runs yet.</li>}
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/admin/acquisition/hunter?run=${run.id}`}
                  className={`block rounded-lg px-2 py-1.5 text-[0.7rem] ${
                    run.id === activeRun ? "bg-mint text-primary" : "hover:bg-paper"
                  }`}
                >
                  <span className="font-medium capitalize">{run.mode}</span> · {run.status}
                  <span className="block text-[0.62rem] text-muted">
                    {run.candidateCount} candidates · {formatDate(run.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">Candidates</h2>
            <span className="text-[0.68rem] text-muted">{candidates.length} in this run</span>
          </div>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Score</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Why</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      No candidates in this run yet.
                    </td>
                  </tr>
                )}
                {candidates.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-paper/60">
                    <td className="max-w-[22rem] px-4 py-2">
                      <a href={candidate.url} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">
                        {candidate.title ?? candidate.url}
                      </a>
                      <p className="truncate text-[0.62rem] text-muted">{candidate.domain}</p>
                    </td>
                    <td className="px-4 py-2 font-mono">{candidate.score.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[0.62rem]">{candidate.status}</span>
                    </td>
                    <td className="max-w-[16rem] px-4 py-2 text-[0.65rem] text-muted">{candidateNote(candidate.reason)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {candidate.job_id ? (
                        <Link href={`/admin/acquisition/jobs/${candidate.job_id}`} className="text-[0.68rem] text-primary hover:underline">
                          Open job
                        </Link>
                      ) : (
                        <span className="inline-flex gap-3">
                          <ConfirmForm className="inline">
                            <input type="hidden" name="action" value="select_candidate" />
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <button type="submit" className="text-[0.68rem] font-medium text-primary hover:underline">Select</button>
                          </ConfirmForm>
                          <ConfirmForm className="inline" message="Reject this candidate?">
                            <input type="hidden" name="action" value="reject_candidate" />
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <button type="submit" className="text-[0.68rem] text-muted hover:text-red-700">Reject</button>
                          </ConfirmForm>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
