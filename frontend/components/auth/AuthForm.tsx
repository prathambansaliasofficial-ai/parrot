"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

type AuthFormProps = { mode: "login" | "signup" };

export default function AuthForm({ mode }: AuthFormProps) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Authentication is not connected yet. Please configure Supabase to enable this action.");
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <section className="auth-shell" aria-labelledby="auth-title">
        <aside className="auth-aside">
          <p className="auth-kicker">LEARN BETTER, TOGETHER</p>
          <h1>Everything you need to <span>learn with confidence.</span></h1>
          <p>Find your course resources, practise with Parrot AI, and make every study session count.</p>
          <ul>
            <li><b>01</b> Resources that match your course</li>
            <li><b>02</b> Active recall with Parrot AI</li>
            <li><b>03</b> A focused space to prepare</li>
          </ul>
        </aside>
        <div className="auth-card">
          <div className="auth-card-heading">
            <h2 id="auth-title">{isSignup ? "Create your account" : "Welcome back"}</h2>
            <p>{isSignup ? "Start learning smarter with Fresources and Parrot AI." : "Sign in to continue learning with your resources."}</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {isSignup && <label>Full name<span className="auth-input"><UserRound aria-hidden="true" /><input name="name" type="text" autoComplete="name" placeholder="Enter your full name" required /></span></label>}
            <label>Email address<span className="auth-input"><Mail aria-hidden="true" /><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></span></label>
            <label>Password<span className="auth-input"><LockKeyhole aria-hidden="true" /><input name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} placeholder="Enter your password" minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span></label>
            <div className="auth-options">
              {!isSignup && <label className="check-label"><input type="checkbox" name="remember" /> <span>Remember me</span></label>}
              {isSignup && <p>Use at least 8 characters.</p>}
              {!isSignup && <a href="#help">Forgot password?</a>}
            </div>
            <button className="auth-submit" type="submit">{isSignup ? "Create account" : "Sign in"}</button>
            {message && <p className="auth-message" role="status">{message}</p>}
          </form>
          <p className="auth-switch">{isSignup ? "Already have an account?" : "New to Fresources?"} <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Create an account"}</Link></p>
        </div>
      </section>
      <p className="auth-footer">© 2026 Fresources. Built for learners, by learners.</p>
    </main>
  );
}
