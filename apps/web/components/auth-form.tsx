"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

type AuthFormProps = {
  mode: "login" | "signup";
};

const content = {
  login: {
    title: "Welcome back",
    submit: "Log in",
    endpoint: "/api/auth/login"
  },
  signup: {
    title: "Create your WTA account",
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
      className="auth-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        void handleSubmit(formData);
      }}
    >
      <h3>{content[mode].title}</h3>
      {mode === "signup" ? (
        <label className="field">
          <span className="label">Name</span>
          <input className="input" name="name" placeholder="Ava Chen" required />
        </label>
      ) : null}

      <label className="field">
        <span className="label">Email</span>
        <input
          className="input"
          name="email"
          placeholder="player@wta.gg"
          required
          type="email"
        />
      </label>

      <label className="field">
        <span className="label">Password</span>
        <input
          className="input"
          minLength={8}
          name="password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
      </label>

      {error ? <div className="notice error">{error}</div> : null}

      <button className="button form-button" disabled={isPending} type="submit">
        {isPending ? "Working..." : content[mode].submit}
      </button>
    </form>
  );
}
