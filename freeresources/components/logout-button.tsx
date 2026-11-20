"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className={`btn btn-ghost ${compact ? "btn-sm" : ""}`}>
      <LogOut size={15} />
      {compact ? null : "Log out"}
    </button>
  );
}
