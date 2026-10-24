"use client";

import { useParrot } from "./ParrotContext";
import type { ParrotResourceContext } from "./ParrotContext";

export default function OpenParrotButton({ resource, label }: { resource: ParrotResourceContext; label?: string }) {
  const { openWith } = useParrot();
  return (
    <button className="button button-primary open-parrot-button" onClick={() => openWith(resource)}>
      {label ?? "Ask Parrot about this resource"}
    </button>
  );
}
