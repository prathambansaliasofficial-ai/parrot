import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { getEntityConfig, listEntityRows } from "@/lib/admin";

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === 1 || value === true) return "Yes";
  if (value === 0 || value === false) return "No";
  return String(value);
}

export default async function EntityListPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { entity } = await params;
  const { q = "" } = await searchParams;
  const config = getEntityConfig(entity);
  if (!config) notFound();

  const rows = listEntityRows(config, q);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Manage</p>
          <h1 className="mt-1 text-2xl">{config.label}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{config.description}</p>
        </div>
        <Link href={`/admin/entities/${entity}/new`} className="btn btn-primary btn-sm">
          <Plus size={14} /> New {config.singular}
        </Link>
      </div>

      <form action={`/admin/entities/${entity}`} className="flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={`Search ${config.label.toLowerCase()}…`}
            className="input pl-8"
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">
          Search
        </button>
        {q && (
          <Link href={`/admin/entities/${entity}`} className="text-xs text-muted hover:text-primary">
            Clear
          </Link>
        )}
      </form>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[0.7rem] text-muted">
          <span>
            {rows.length} {rows.length === 1 ? "record" : "records"}
            {q ? ` matching “${q}”` : ""}
          </span>
          <span>Click a row to edit</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted">{q ? "No records match that search." : "Nothing here yet."}</p>
            {!q && (
              <Link href={`/admin/entities/${entity}/new`} className="btn btn-secondary btn-sm mt-3">
                Create the first {config.singular}
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.key} className="px-4 py-2 font-semibold">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => {
                  const id = String(row.id);
                  return (
                    <tr key={id} className="hover:bg-paper/60">
                      {config.columns.map((column) => (
                        <td key={column.key} className="max-w-[16rem] truncate px-4 py-2.5">
                          {display(row[column.key])}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {"slug" in row && row.slug ? (
                          <Link
                            href={
                              entity === "universities"
                                ? `/universities/${row.slug}`
                                : entity === "programmes"
                                  ? `/courses/${row.slug}`
                                  : entity === "subjects"
                                    ? `/subjects/${row.slug}`
                                    : `/admin/entities/${entity}/${id}`
                            }
                            target={["universities", "programmes", "subjects"].includes(entity) ? "_blank" : undefined}
                            className="mr-3 text-[0.7rem] text-muted hover:text-primary"
                          >
                            View
                          </Link>
                        ) : null}
                        <Link href={`/admin/entities/${entity}/${id}`} className="text-[0.7rem] font-medium text-primary hover:underline">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
