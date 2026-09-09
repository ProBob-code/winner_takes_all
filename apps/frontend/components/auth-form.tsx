"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";
import { getApiUrl } from "@/lib/api-config";

type AuthFormProps = {
  mode: "login" | "signup";
};

const content = {
  login: {
    title: "Welcome Back",
    subtitle: "Sign in to your tournament dashboard",
    submit: "Log in",
    endpoint: "/api/auth/login",
  },
  signup: {
    title: "Create your account",
    subtitle: "Two fields and you're in",
    submit: "Create account",
    endpoint: "/api/auth/signup",
  },
} as const;

/**
 * Turn an email into a reasonable display name so signup does not have to ask
 * for one. "ava.chen@x.com" becomes "Ava Chen". The field stays editable, but
 * nobody has to stop and fill it in.
 */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._\-+\d]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

  const derived = words.join(" ").trim();
  // The API requires at least two characters.
  return derived.length >= 2 ? derived.slice(0, 50) : "Player";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Only surfaced if someone wants to correct it.
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);

  const isSignup = mode === "signup";
  const derivedName = useMemo(() => displayNameFromEmail(email), [email]);
  const effectiveName = nameOverride ?? derivedName;

  const emailLooksValid = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email);
  const passwordLongEnough = password.length >= 8;
  const canSubmit = isSignup
    ? emailLooksValid && passwordLongEnough
    : email.length > 0 && password.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload = isSignup
        ? { name: effectiveName, email, password }
        : { email, password };

      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}${content[mode].endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setError("Could not reach the server. Please try again.");
        return;
      }

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setError(body.message ?? "Something went wrong.");
        return;
      }

      startTransition(() => {
        window.location.href = "/dashboard";
      });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || isPending;

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      onSubmit={handleSubmit}
    >
      <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
        <h2 className="glow-text" style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>
          {content[mode].title}
        </h2>
        <p className="muted" style={{ fontSize: "0.9rem" }}>{content[mode].subtitle}</p>
      </div>

      {isSignup && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "10px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "var(--gold)",
          }}
        >
          🎁 ₹1,000 credited to your wallet on signup
        </div>
      )}

      <div>
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label htmlFor="auth-password">Password</label>
        <div style={{ position: "relative" }}>
          <input
            id="auth-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
            placeholder={isSignup ? "At least 8 characters" : "Your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", paddingRight: "68px" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "0.72rem",
              fontWeight: 800,
              letterSpacing: "0.5px",
              cursor: "pointer",
            }}
          >
            {showPassword ? "HIDE" : "SHOW"}
          </button>
        </div>
        {isSignup && password.length > 0 && !passwordLongEnough && (
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: "6px" }}>
            {8 - password.length} more character{8 - password.length === 1 ? "" : "s"} to go
          </p>
        )}
      </div>

      {/* The name is inferred rather than asked for; correcting it is opt-in. */}
      {isSignup && emailLooksValid && (
        <div style={{ fontSize: "0.8rem" }}>
          {editingName ? (
            <div>
              <label htmlFor="auth-name">Display name</label>
              <input
                id="auth-name"
                name="name"
                autoComplete="name"
                maxLength={50}
                value={effectiveName}
                onChange={(e) => setNameOverride(e.target.value)}
                onBlur={() => setEditingName(false)}
                style={{ width: "100%" }}
                autoFocus
              />
            </div>
          ) : (
            <p className="muted">
              You'll appear as <strong style={{ color: "var(--text)" }}>{effectiveName}</strong>{" "}
              <button
                type="button"
                onClick={() => setEditingName(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--cyan)",
                  cursor: "pointer",
                  fontWeight: 700,
                  padding: 0,
                }}
              >
                change
              </button>
            </p>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-sm)",
            color: "var(--red-light)",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      <button
        className="button button-gold"
        style={{ width: "100%", marginTop: "0.25rem" }}
        disabled={busy || !canSubmit}
        type="submit"
      >
        {busy ? "One moment…" : content[mode].submit}
      </button>

      {isSignup && (
        <p className="muted" style={{ fontSize: "0.72rem", textAlign: "center", lineHeight: 1.5 }}>
          By creating an account you agree to our{" "}
          <a href="/terms" style={{ color: "var(--cyan)" }}>Terms</a> and{" "}
          <a href="/privacy" style={{ color: "var(--cyan)" }}>Privacy Policy</a>.
        </p>
      )}
    </form>
  );
}
