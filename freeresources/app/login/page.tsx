import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthForm from "@/components/auth-form";
import AuthShell from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { first, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to contribute resources, track submissions and manage your FreeResources account.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const nextPath = first(params.next);
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to submit resources and follow their review."
      footer={
        <>
          Trouble signing in?{" "}
          <Link href="/support?category=technical-issue" className="text-primary hover:underline">
            Contact support
          </Link>
          .
        </>
      }
    >
      <AuthForm mode="login" nextPath={nextPath} />
    </AuthShell>
  );
}
