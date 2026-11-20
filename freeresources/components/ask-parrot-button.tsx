"use client";

import { Bird } from "lucide-react";

export default function AskParrotButton({ topic }: { topic: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("parrot:open", { detail: { topic } }))}
      className="btn btn-secondary mt-2 w-full"
    >
      <Bird size={15} /> Ask Parrot AI
    </button>
  );
}
