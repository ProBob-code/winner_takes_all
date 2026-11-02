"use client";

import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api-config";

/**
 * Google's own "Sign in with Google" button.
 *
 * The client ID comes from the API, so turning Google on or off is one setting
 * on the Worker; until it is set this renders nothing. Google hands the page a
 * signed ID token, the API checks it and sets the session cookies, and the
 * same route signs in an existing account or creates a new one.
 */

type GoogleId = {
  initialize(options: Record<string, unknown>): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Google script failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function GoogleButton({
  mode,
  onSignedIn,
  onError,
}: {
  mode: "login" | "signup";
  onSignedIn: () => void;
  onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The latest callbacks, so Google's one-time initialize never calls stale ones.
  const handlers = useRef({ onSignedIn, onError });
  handlers.current = { onSignedIn, onError };

  useEffect(() => {
    let live = true;
    fetch(`${getApiUrl()}/api/auth/google/config`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: { clientId?: string | null }) => { if (live && b?.clientId) setClientId(b.clientId); })
      .catch(() => { /* no Google button, the form still works */ });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!clientId || !holder.current) return;
    let live = true;
    loadScript()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (!live || !id || !holder.current) return;
        id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: async ({ credential }: { credential?: string }) => {
            if (!credential) return;
            setBusy(true);
            try {
              const res = await fetch(`${getApiUrl()}/api/auth/google`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ credential }),
                credentials: "include",
              });
              const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
              if (!res.ok || !body?.ok) {
                handlers.current.onError(body?.message ?? "Google sign-in failed. Please try again.");
                return;
              }
              handlers.current.onSignedIn();
            } catch {
              handlers.current.onError("Could not reach the server. Please try again.");
            } finally {
              setBusy(false);
            }
          },
        });
        const width = Math.min(400, Math.max(200, Math.floor(holder.current.clientWidth)));
        id.renderButton(holder.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: mode === "signup" ? "signup_with" : "signin_with",
          logo_alignment: "center",
          width,
        });
      })
      .catch(() => { /* blocked by an extension or offline: the form still works */ });
    return () => { live = false; };
  }, [clientId, mode]);

  if (!clientId) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        ref={holder}
        aria-busy={busy}
        style={{ width: "100%", minHeight: 44, display: "flex", justifyContent: "center", opacity: busy ? 0.5 : 1 }}
      />
      <div className="muted" style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "1px" }}>
        <span style={{ flex: 1, height: 1, background: "var(--line, rgba(255,255,255,0.12))" }} />
        OR WITH EMAIL
        <span style={{ flex: 1, height: 1, background: "var(--line, rgba(255,255,255,0.12))" }} />
      </div>
    </div>
  );
}
