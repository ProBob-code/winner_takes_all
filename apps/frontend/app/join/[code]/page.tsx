"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * Scan, type a name, play.
 *
 * This is the first thing a walk-in ever sees of Winner Takes All, and it is
 * deliberately the smallest page in the app: one field and one button. No
 * account, no wallet, no top-up, no password, no terms to scroll past. Every
 * step added here is a person who shrugs and goes back to the table.
 *
 * It also states the thing that matters legally and commercially in the same
 * breath: entry is free. Nothing on this page can take money, and the API
 * refuses a join by code to any tournament carrying a fee.
 */

import { sportInfo } from "@/lib/sports";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";

interface JoinInfo {
  tournamentId: string;
  name: string;
  venue: string | null;
  sport: string;
  status: string;
  free: boolean;
  entered: number;
  capacity: number;
  open: boolean;
}

export default function JoinByCodePage() {
  const params = useParams<{ code: string }>();
  const code = params?.code;

  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ teamId: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!code) return;
    try {
      const res = await backendFetch(`/join/${code}`);
      const payload: any = await res.json();
      if (!res.ok || payload?.ok === false) {
        setLoadError(payload?.message || "That code is not valid.");
        return;
      }
      setInfo(payload);
      setLoadError(null);
    } catch {
      setLoadError("Could not reach Winner Takes All. Check your connection.");
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    const wanted = name.trim();
    if (!wanted) {
      setError("Put a name in, so the screen knows who you are.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await backendFetch(`/join/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wanted }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      setJoined({ teamId: payload.teamId, name: payload.name });
    } catch {
      setError("Could not reach Winner Takes All. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <main className="join-page">
        <div className="join-card">
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>That code will not work</h1>
          <p className="muted">{loadError}</p>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Ask whoever is running the night for the code on the screen.
          </p>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="join-page">
        <div className="join-card">
          <p className="muted">Checking that code…</p>
        </div>
      </main>
    );
  }

  if (joined) {
    return (
      <main className="join-page">
        <div className="join-card">
          <span className="chip good" style={{ alignSelf: "flex-start" }}>
            you are in
          </span>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 900 }}>{joined.name}</h1>
          <p className="muted">
            You are on the list for <strong>{info.name}</strong>. Watch the screen — it will
            show when you are up.
          </p>
          <Link
            className="button-secondary"
            href={`/display/${info.tournamentId}`}
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            See the screen
          </Link>
        </div>
      </main>
    );
  }

  const full = info.entered >= info.capacity;
  const shut = !info.open || full;

  return (
    <main className="join-page">
      <div className="join-card">
        <div>
          {info.venue && (
            <div
              className="muted"
              style={{
                fontSize: "var(--text-xs)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              {info.venue}
            </div>
          )}
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 900, marginTop: "var(--space-1)" }}>
            {info.name}
          </h1>
        </div>

        <div className="h-stack tight">
          {/* Said plainly and first. It is the honest description of the
              product and the reason there is nothing else to agree to. */}
          <span className="chip gold">free to enter</span>
          <span className="chip">{sportInfo(info.sport).label.toLowerCase()}</span>
          <span className="chip">
            {info.entered} of {info.capacity} in
          </span>
        </div>

        {shut ? (
          <>
            <p className="muted">
              {full
                ? "This one is full. Ask about the next round."
                : "This tournament has stopped taking entries."}
            </p>
            <Link
              className="button-secondary"
              href={`/display/${info.tournamentId}`}
              style={{ textDecoration: "none", textAlign: "center" }}
            >
              Watch it instead
            </Link>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="player-name">Your name</label>
              <input
                id="player-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) void join();
                }}
                placeholder="What should the screen call you?"
                maxLength={32}
                autoFocus
                autoComplete="off"
              />
              <span className="hint">
                That is all we need. No account, no payment, nothing to confirm.
              </span>
            </div>

            {error && (
              <p style={{ color: "#f87171", fontSize: "var(--text-sm)" }}>{error}</p>
            )}

            <button
              type="button"
              className="button"
              onClick={() => void join()}
              disabled={busy}
              style={{ minHeight: "var(--touch-min)" }}
            >
              {busy ? "Getting you in…" : "I'm in"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
