import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthForm from "@/components/auth-form";
import AuthShell from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { first, type SearchParams } from "@/lib/params";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a FreeResources account to contribute papers, notes and syllabus files.",
  robots: { index: false, follow: true },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const nextPath = first(params.next);
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free, no email verification loop — start contributing in under a minute."
      footer={
        <>
          By creating an account you agree to our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            privacy policy
          </Link>
          .
        </>
      }
    >
      <AuthForm mode="signup" nextPath={nextPath} />
    </AuthShell>
  );
}
