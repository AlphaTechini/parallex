"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

type AuthFlow = "signIn" | "signUp";

const hasConvexUrl = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export default function SignInPage() {
  if (!hasConvexUrl) {
    return (
      <main>
        <h1>Convex is not configured</h1>
        <p>Set NEXT_PUBLIC_CONVEX_URL before using authentication.</p>
      </main>
    );
  }

  return <SignInForm />;
}

function SignInForm() {
  const { signIn } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [flow, setFlow] = useState<AuthFlow>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn("password", new FormData(event.currentTarget));
      router.replace("/dashboard");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Authentication failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Product introduction">
        <Link className="wordmark wordmark-light" href="/">
          <span className="wordmark-mark">P</span>
          Parallex
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow eyebrow-light">Independent research</span>
          <h1>Research bots that keep working after you close the tab.</h1>
          <p>
            Give every research stream its own identity, inbox, memory, and
            durable place to finish the work.
          </p>
        </div>
        <div className="auth-proof">
          <span>01</span>
          <p>Persistent web research, reports, and email follow-up.</p>
        </div>
      </section>

      <section className="auth-form-shell">
        <div className="auth-form-card">
          <span className="eyebrow">
            {flow === "signIn" ? "Welcome back" : "Create your workspace"}
          </span>
          <h2>{flow === "signIn" ? "Sign in to Parallex" : "Start researching"}</h2>
          <p className="muted-copy">
            {flow === "signIn"
              ? "Continue where your bots left off."
              : "Your first dashboard starts empty and private."}
          </p>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field-label">
              <span>Email</span>
              <input
                className="text-input"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </label>
            <label className="field-label">
              <span>Password</span>
              <input
                className="text-input"
                name="password"
                type="password"
                autoComplete={
                  flow === "signIn" ? "current-password" : "new-password"
                }
                minLength={8}
                placeholder="At least 8 characters"
                required
              />
            </label>
            <input name="flow" type="hidden" value={flow} />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <Button disabled={submitting} size="large" type="submit">
              {submitting
                ? "Please wait..."
                : flow === "signIn"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setError(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
          >
            {flow === "signIn"
              ? "New to Parallex? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
