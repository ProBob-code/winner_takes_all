"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

type AuthFormProps = {
  mode: "login" | "signup";
};

const content = {
  login: {
    title: "Welcome Back",
    subtitle: "Sign in to access your tournament dashboard",
    submit: "Log in securely",
    endpoint: "/api/auth/login"
  },
  signup: {
    title: "Create your Account",
    subtitle: "Join the ultimate competitive 8-ball platform",
    submit: "Create account",
    endpoint: "/api/auth/signup"
  }
} as const;

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);

    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? "")
    };

    const response = await fetch(content[mode].endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = (await response.json()) as {
      ok: boolean;
      message?: string;
    };

    if (!response.ok || !body.ok) {
      setError(body.message ?? "Something went wrong.");
      return;
    }

    startTransition(() => {
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        marginTop: "1.5rem"
      }}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        void handleSubmit(formData);
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
          {content[mode].title}
        </h2>
        <p className="muted">{content[mode].subtitle}</p>
      </div>

      {mode === "signup" && (
        <div>
          <label>Full Name</label>
          <input name="name" placeholder="E.g. Ava Chen" required />
        </div>
      )}

      <div>
        <label>Email Address</label>
        <input
          name="email"
          placeholder="player@wta.gg"
          required
          type="email"
        />
      </div>

      <div>
        <label>Password</label>
        <input
          minLength={8}
          name="password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
      </div>

      {error ? (
        <div style={{
          padding: "0.75rem 1rem",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "var(--radius-sm)",
          color: "var(--red-light)",
          fontSize: "0.9rem",
          textAlign: "center"
        }}>
          {error}
        </div>
      ) : null}

      <button 
        className="button" 
        style={{ width: "100%", marginTop: "0.5rem" }} 
        disabled={isPending} 
        type="submit"
      >
        {isPending ? "Authenticating..." : content[mode].submit}
      </button>
    </form>
  );
}
