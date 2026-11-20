import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import DeleteButton from "@/components/admin/delete-button";
import EntityForm from "@/components/admin/entity-form";
import { getAdminOptions, getEntityConfig, getEntityRow, resolveFields } from "@/lib/admin";

export default async function EditEntityPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const config = getEntityConfig(entity);
  if (!config) notFound();
  const row = getEntityRow(config, id);
  if (!row) notFound();

  const fields = resolveFields(config, getAdminOptions());
  const publicHref =
    entity === "universities"
      ? `/universities/${row.slug}`
      : entity === "programmes"
        ? `/courses/${row.slug}`
        : entity === "subjects"
          ? `/subjects/${row.slug}`
          : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/entities/${entity}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
            <ArrowLeft size={13} /> Back to {config.label.toLowerCase()}
          </Link>
          <h1 className="mt-2 text-2xl">Edit {config.singular}</h1>
          <p className="mt-1 font-mono text-[0.7rem] text-muted">{id}</p>
        </div>
        <div className="flex items-center gap-2">
          {publicHref && (
            <Link href={publicHref} target="_blank" className="btn btn-ghost btn-sm">
              <ExternalLink size={13} /> View public page
            </Link>
          )}
          <DeleteButton
            href={`/api/admin/entities/${entity}/${id}`}
            redirectTo={`/admin/entities/${entity}`}
            warning={
              entity === "universities" || entity === "programmes"
                ? "Deleting this will cascade to its subjects and resources. Continue?"
                : "Delete this record? This cannot be undone."
            }
          />
        </div>
      </div>
      <EntityForm entity={entity} fields={fields} values={row} id={id} />
    </div>
  );
}
