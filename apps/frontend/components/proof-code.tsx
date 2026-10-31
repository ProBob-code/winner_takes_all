"use client";

/**
 * The game code on the scorer's screen (Proof of Play).
 *
 * Each player types it on their own phone at /code, which proves two real
 * accounts were at the table while the game was on. It changes every two
 * minutes, so one sent to someone elsewhere goes stale before it is useful.
 * Polled every few seconds; the server hands out a new code before the old
 * one runs out.
 */

import { useEffect, useRef, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { readFix, setWantsToLocate, wantsToLocate, type Fix } from "@/lib/proof";
import "@/components/progression.css";

interface CodeSide {
  teamId: string;
  name: string;
  hasAccount: boolean;
  checkedIn: boolean;
  located: boolean;
}

interface CodeState {
  display: string | null;
  expiresAt: number | null;
  serverTime: number;
  venueNight: boolean;
  sides: CodeSide[];
}

export function ProofCode({ matchId }: { matchId: string }) {
  const [state, setState] = useState<CodeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [locate, setLocate] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const fixRef = useRef<Fix | null>(null);
  const skewRef = useRef(0);

  useEffect(() => setLocate(wantsToLocate()), []);

  // This phone's location, once, if the scorer is sharing it.
  useEffect(() => {
    if (!locate) {
      fixRef.current = null;
      return;
    }
    let cancelled = false;
    void readFix().then((fix) => {
      if (!cancelled) fixRef.current = fix;
    });
    return () => {
      cancelled = true;
    };
  }, [locate, matchId]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await backendFetch(`/proof/matches/${matchId}/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fix: fixRef.current }),
        });
        const body: any = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.ok) {
          setError(body?.message ?? null);
          return;
        }
        skewRef.current = body.serverTime * 1000 - Date.now();
        setState(body);
        setError(null);
      } catch {
        // Offline: the last code shown is still the right one for a while.
      }
    }
    void poll();
    const timer = window.setInterval(poll, 5000);
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearInterval(ticker);
    };
  }, [matchId]);

  if (error && !state) return null;
  if (!state?.display) return null;

  const left = state.expiresAt
    ? Math.max(0, Math.round(state.expiresAt - (now + skewRef.current) / 1000))
    : 0;
  const accounts = state.sides.filter((s) => s.hasAccount);
  const allIn = accounts.length === 2 && accounts.every((s) => s.checkedIn);
  const walkIn = state.sides.some((s) => !s.hasAccount);

  if (hidden) {
    return (
      <button type="button" className="proof-code-mini" onClick={() => setHidden(false)}>
        {allIn ? "✅ Both checked in" : `Game code ${state.display}`}
      </button>
    );
  }

  return (
    <section className="proof-code" aria-label="Game code">
      <div className="proof-code-top">
        <span className="proof-code-kicker">Game code</span>
        <button type="button" className="proof-code-hide" onClick={() => setHidden(true)} aria-label="Hide the game code">
          Hide
        </button>
      </div>
      <div className="proof-code-value" aria-live="polite">{state.display}</div>
      <p className="proof-code-how">
        Players: open <strong>winnertakesall.live/code</strong> on your phone and type this.
        {left > 0 && <span className="muted"> New code in {left}s.</span>}
      </p>
      <ul className="proof-code-sides">
        {state.sides.map((s) => (
          <li key={s.teamId} className={s.checkedIn ? "in" : ""}>
            <span className="proof-code-mark" aria-hidden>
              {!s.hasAccount ? "·" : s.checkedIn ? "✓" : "…"}
            </span>
            <span className="proof-code-name">{s.name}</span>
            <span className="muted">
              {!s.hasAccount
                ? "walk-in, no account"
                : s.checkedIn
                  ? s.located || state.venueNight ? "checked in" : "checked in, no location"
                  : "waiting"}
            </span>
          </li>
        ))}
      </ul>
      {walkIn && (
        <p className="proof-code-note">
          A game against a walk-in counts as practice: no trophies. They can sign up and join the night to make it count.
        </p>
      )}
      <label className="proof-code-locate">
        <input
          type="checkbox"
          checked={locate}
          onChange={(e) => {
            setLocate(e.target.checked);
            setWantsToLocate(e.target.checked);
          }}
        />
        Use this phone&apos;s location as the table
      </label>
    </section>
  );
}
