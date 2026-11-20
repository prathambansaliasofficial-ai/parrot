import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import EntityForm from "@/components/admin/entity-form";
import { getAdminOptions, getEntityConfig, resolveFields } from "@/lib/admin";

export default async function NewEntityPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const config = getEntityConfig(entity);
  if (!config) notFound();

  const fields = resolveFields(config, getAdminOptions());

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/admin/entities/${entity}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> Back to {config.label.toLowerCase()}
        </Link>
        <h1 className="mt-2 text-2xl">New {config.singular}</h1>
        <p className="mt-1 text-sm text-muted">{config.description}</p>
      </div>
      <EntityForm entity={entity} fields={fields} />
    </div>
  );
}
