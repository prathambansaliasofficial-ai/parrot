import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, HardDrive, Search, Timer } from "lucide-react";

import ConfirmForm from "@/components/admin/confirm-form";
import { aiConfig } from "@/lib/acquisition/ai";
import { ghostscriptBinary } from "@/lib/acquisition/pdf";
import { searchProviders } from "@/lib/acquisition/discovery";
import { storageConfig } from "@/lib/acquisition/storage";
import { getAcquisitionStats, getSettings, listRecentEvents, listRuns } from "@/lib/acquisition/store";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AcquisitionDashboard({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const stats = getAcquisitionStats();
  const settings = getSettings();
  const runs = listRuns(6);
  const events = listRecentEvents(8);
  const storageInfo = storageConfig();
  const ai = aiConfig();
  const gs = ghostscriptBinary();
  const configuredProviders = searchProviders().filter((provider) => provider.configured());

  const savings = stats.originalBytes - stats.optimizedBytes;

  const cards: [string, string, string][] = [
    ["Pending approvals", String(stats.awaitingApproval), "/admin/acquisition/pipeline?state=awaiting_approval"],
    ["Active jobs", String(stats.activeJobs), "/admin/acquisition/pipeline"],
    ["Candidates discovered", String(stats.candidates), "/admin/acquisition/hunter"],
    ["Published syllabi", String(stats.publishedSyllabi), "/admin/acquisition/curricula"],
    ["Documents stored", String(stats.assets), "/admin/acquisition/documents"],
    ["Original storage", formatBytes(stats.originalBytes), "/admin/acquisition/documents"],
    ["Optimised storage", formatBytes(stats.optimizedBytes), "/admin/acquisition/documents"],
    ["Compression savings", savings > 0 ? formatBytes(savings) : "—", "/admin/acquisition/documents"],
    ["Duplicates prevented", String(stats.duplicatesPrevented), "/admin/acquisition/pipeline"],
    ["Failed jobs", String(stats.failedJobs), "/admin/acquisition/pipeline?state=failed"],
    ["Mapped institutions", String(stats.mappedInstitutions), "/admin/acquisition/institutions"],
    ["Canonical curricula", String(stats.curricula), "/admin/acquisition/curricula"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">AKTU intelligence</p>
          <h1 className="mt-1 text-2xl">Acquisition control center</h1>
          <p className="mt-1 text-sm text-muted">
            Autonomous syllabus discovery, processing and publication for AKTU and its affiliated institutions.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/acquisition/hunter" className="btn btn-secondary btn-sm">
            <Search size={14} /> Hunter
          </Link>
          <Link href="/admin/acquisition/pipeline" className="btn btn-primary btn-sm">
            <Timer size={14} /> Pipeline
          </Link>
        </div>
      </div>

      {(ok || error) && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"
          }`}
        >
          {error ?? ok}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href} className="card px-4 py-3 transition hover:border-primary/40">
            <p className="text-[0.62rem] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-0.5 font-display text-xl">{value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Run discovery</h2>
            <span className="text-[0.65rem] text-muted">
              {stats.lastRunAt ? `Last run ${formatDate(stats.lastRunAt)} · ${stats.lastRunStatus}` : "No runs yet"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Searches monitored sources for subjects that still have no verified syllabus. High-confidence PDFs are queued for
            processing; nothing is published without your approval.
          </p>

          <ConfirmForm className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="action" value="start_discovery" />
            <input type="hidden" name="universitySlug" value="aktu" />
            <div>
              <label htmlFor="limit" className="label">
                Coverage gaps to chase
              </label>
              <input id="limit" name="limit" type="number" min={1} max={25} defaultValue={5} className="input" />
            </div>
            <button type="submit" className="btn btn-primary">
              Queue discovery run
            </button>
          </ConfirmForm>

          <p className="mt-3 text-[0.68rem] text-muted">
            Runs execute in the background worker{settings.scheduler_enabled === "1" ? " and on the daily schedule" : ""}. Start it
            with <code className="rounded bg-paper px-1">npm run worker</code>.
          </p>

          <div className="mt-4 space-y-2">
            {runs.length === 0 && <p className="text-xs text-muted">No discovery runs have been created yet.</p>}
            {runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span className="text-[0.68rem] font-medium capitalize">{run.mode}</span>
                <span className="rounded-full bg-paper px-2 py-0.5 text-[0.62rem] text-muted">{run.status}</span>
                <span className="text-[0.65rem] text-muted">
                  {run.candidateCount} candidates · {run.selectedCount} selected
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Link href={`/admin/acquisition/hunter?run=${run.id}`} className="text-[0.68rem] text-primary hover:underline">
                    Inspect
                  </Link>
                  {run.status === "running" && (
                    <ConfirmForm className="inline">
                      <input type="hidden" name="action" value="pause_discovery" />
                      <input type="hidden" name="runId" value={run.id} />
                      <button type="submit" className="text-[0.68rem] text-muted hover:text-primary">
                        Pause
                      </button>
                    </ConfirmForm>
                  )}
                  {run.status === "paused" && (
                    <ConfirmForm className="inline">
                      <input type="hidden" name="action" value="resume_discovery" />
                      <input type="hidden" name="runId" value={run.id} />
                      <button type="submit" className="text-[0.68rem] text-muted hover:text-primary">
                        Resume
                      </button>
                    </ConfirmForm>
                  )}
                  {(run.status === "running" || run.status === "queued" || run.status === "paused") && (
                    <ConfirmForm className="inline" message="Cancel this run? Completed jobs are kept.">
                      <input type="hidden" name="action" value="cancel_discovery" />
                      <input type="hidden" name="runId" value={run.id} />
                      <button type="submit" className="text-[0.68rem] text-muted hover:text-red-700">
                        Cancel
                      </button>
                    </ConfirmForm>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-sm font-semibold">System readiness</h2>
            <ul className="mt-3 space-y-2 text-xs">
              <li className="flex items-start gap-2">
                {storageInfo.driver === "r2" ? (
                  <CheckCircle2 size={14} className="mt-0.5 text-primary" />
                ) : (
                  <Database size={14} className="mt-0.5 text-muted" />
                )}
                <span>
                  Storage: <strong>{storageInfo.driver === "r2" ? "Cloudflare R2" : "Local disk"}</strong>
                  {storageInfo.driver === "local" && (
                    <span className="text-muted">
                      {" "}
                      — set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to switch.
                      {storageInfo.missing.length > 0 ? ` Missing: ${storageInfo.missing.join(", ")}.` : ""}
                    </span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                {gs ? <CheckCircle2 size={14} className="mt-0.5 text-primary" /> : <AlertTriangle size={14} className="mt-0.5 text-accent" />}
                <span>
                  PDF compression: <strong>{gs ? `Ghostscript (${gs})` : "unavailable"}</strong>
                  {!gs && <span className="text-muted"> — install Ghostscript to generate optimised derivatives; originals stay as the serving version.</span>}
                </span>
              </li>
              <li className="flex items-start gap-2">
                {ai.configured ? <CheckCircle2 size={14} className="mt-0.5 text-primary" /> : <AlertTriangle size={14} className="mt-0.5 text-accent" />}
                <span>
                  AI provider: <strong>{ai.configured ? ai.model : "not configured"}</strong>
                  {!ai.configured && <span className="text-muted"> — set AI_API_KEY to enable classification and the copilot.</span>}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Search size={14} className="mt-0.5 text-muted" />
                <span>
                  Discovery providers: <strong>{configuredProviders.map((provider) => provider.label).join(", ") || "none"}</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <HardDrive size={14} className="mt-0.5 text-muted" />
                <span>
                  Scheduler: <strong>{settings.scheduler_enabled === "1" ? "enabled" : "disabled"}</strong>
                  {stats.nextSourceCheckAt ? ` · next source check ${formatDate(stats.nextSourceCheckAt)}` : ""}
                </span>
              </li>
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold">Acquisition settings</h2>
            <ConfirmForm className="mt-3 space-y-2.5">
              <input type="hidden" name="action" value="save_settings" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="scheduler_enabled" className="label">
                    Scheduler
                  </label>
                  <select id="scheduler_enabled" name="scheduler_enabled" defaultValue={settings.scheduler_enabled} className="input">
                    <option value="0">Disabled</option>
                    <option value="1">Enabled</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="compression_profile" className="label">
                    Compression
                  </label>
                  <select
                    id="compression_profile"
                    name="compression_profile"
                    defaultValue={settings.compression_profile}
                    className="input"
                  >
                    <option value="balanced">Balanced</option>
                    <option value="archive">High quality</option>
                    <option value="economy">Economy</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="discovery_interval_minutes" className="label">
                    Daily interval (min)
                  </label>
                  <input
                    id="discovery_interval_minutes"
                    name="discovery_interval_minutes"
                    type="number"
                    min={60}
                    defaultValue={settings.discovery_interval_minutes}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="source_recheck_hours" className="label">
                    Source recheck (h)
                  </label>
                  <input
                    id="source_recheck_hours"
                    name="source_recheck_hours"
                    type="number"
                    min={1}
                    defaultValue={settings.source_recheck_hours}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="max_download_mb" className="label">
                    Max download (MB)
                  </label>
                  <input
                    id="max_download_mb"
                    name="max_download_mb"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={settings.max_download_mb}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="auto_select_threshold" className="label">
                    Auto-queue score
                  </label>
                  <input
                    id="auto_select_threshold"
                    name="auto_select_threshold"
                    type="number"
                    step="0.05"
                    min={0.1}
                    max={1}
                    defaultValue={settings.auto_select_threshold}
                    className="input"
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-secondary btn-sm">
                Save settings
              </button>
            </ConfirmForm>
          </section>
        </div>
      </div>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent pipeline activity</h2>
          <Link href="/admin/acquisition/pipeline" className="text-[0.7rem] text-primary hover:underline">
            Open pipeline <ArrowRight size={11} className="inline" />
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-xs text-muted">No pipeline events yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-xs">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.6rem] ${
                    event.level === "error" ? "bg-red-100 text-red-800" : event.level === "warn" ? "bg-accent-soft text-accent" : "bg-paper text-muted"
                  }`}
                >
                  {event.state}
                </span>
                <span className="text-muted">{event.stage.replace(/_/g, " ")}</span>
                <Link href={`/admin/acquisition/jobs/${event.job_id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                  {event.message}
                </Link>
                <span className="text-[0.65rem] text-muted">{formatDate(event.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
