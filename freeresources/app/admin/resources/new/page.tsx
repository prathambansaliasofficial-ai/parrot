import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import ResourceForm from "@/components/admin/resource-form";
import { getResourceFormOptions } from "@/lib/admin";

export default function NewResourcePage() {
  const options = getResourceFormOptions();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/resources" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> Back to resources
        </Link>
        <h1 className="mt-2 text-2xl">Upload resource</h1>
        <p className="mt-1 text-sm text-muted">
          The file is checked for a real PDF signature and stored with a generated name. Drafts stay hidden.
        </p>
      </div>
      <ResourceForm {...options} />
    </div>
  );
}
