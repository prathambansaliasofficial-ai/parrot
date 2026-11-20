import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import DeleteButton from "@/components/admin/delete-button";
import ResourceForm from "@/components/admin/resource-form";
import { getAdminResource, getResourceFormOptions } from "@/lib/admin";

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getAdminResource(id);
  if (!data) notFound();

  const options = getResourceFormOptions();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/resources" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
            <ArrowLeft size={13} /> Back to resources
          </Link>
          <h1 className="mt-2 text-2xl">Edit resource</h1>
          <p className="mt-1 font-mono text-[0.7rem] text-muted">{id}</p>
        </div>
        <DeleteButton
          href={`/api/admin/resources/${id}`}
          redirectTo="/admin/resources"
          warning="Delete this resource, all of its file versions and download records? This cannot be undone."
        />
      </div>
      <ResourceForm
        id={id}
        resource={data.resource}
        files={data.files}
        slug={String(data.resource.slug)}
        {...options}
      />
    </div>
  );
}
