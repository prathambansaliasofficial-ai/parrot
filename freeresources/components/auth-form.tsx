"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function AuthForm({ mode, nextPath }: { mode: "login" | "signup"; nextPath?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        user?: { role: string };
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        setFields(result.fields ?? {});
        return;
      }
      const destination = nextPath || (result.user?.role === "admin" ? "/admin" : "/dashboard");
      router.push(destination);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input id="name" name="name" className="input" autoComplete="name" required minLength={2} />
          {fields.name && <p className="mt-1 text-xs text-danger">{fields.name}</p>}
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        {fields.email && <p className="mt-1 text-xs text-danger">{fields.email}</p>}
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? 8 : 1}
        />
        {mode === "signup" && (
          <p className="mt-1 text-[0.7rem] text-muted">At least 8 characters. Stored as a scrypt hash.</p>
        )}
        {fields.password && <p className="mt-1 text-xs text-danger">{fields.password}</p>}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending && <Loader2 size={15} className="animate-spin" />}
        {mode === "login" ? "Log in" : "Create account"}
      </button>

      <p className="text-center text-xs text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href={`/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="text-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="text-primary hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
