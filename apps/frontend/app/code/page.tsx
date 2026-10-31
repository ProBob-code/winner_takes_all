"use client";

/**
 * Check in to the game you're playing (Proof of Play).
 *
 * The scorer's screen shows a six-character code that changes every two
 * minutes. Typing it here, signed in, proves your account was at the table
 * while the game was on; sharing location as well proves both phones were in
 * the same place. Together they make the game verified, which is what earns
 * full trophies and coins.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { readFix, setWantsToLocate, tidyCode, wantsToLocate } from "@/lib/proof";
import { ProofResults } from "@/components/proof-results";
import "@/components/progression.css";

interface CheckedIn {
  tournamentId: string;
  tournamentName: string;
  you: string;
  opponent: string;
  opponentHasAccount: boolean;
  located: boolean;
}

export default function CodePage() {
  const [code, setCode] = useState("");
  const [locate, setLocate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [done, setDone] = useState<CheckedIn | null>(null);
  const [refresh, setRefresh] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocate(wantsToLocate());
    input.current?.focus();
  }, []);

  const ready = code.replace(/[^A-Z0-9]/g, "").length === 6;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fix = locate ? await readFix() : null;
      const res = await backendFetch("/proof/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, fix }),
      });
      const body: any = await res.json().catch(() => null);
      if (res.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "That didn't go through. Try again.");
        return;
      }
      setDone({ ...body.game, located: body.located });
      setCode("");
      setRefresh((n) => n + 1);
    } catch {
      setError("No connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="shell proof-page">
        <h1 className="proof-page-title">Game code</h1>
        <p className="muted">
          Type the code on the scorer&apos;s screen to check in to the game you&apos;re playing. A game both
          players check in to is <strong>verified</strong>, and pays full trophies and coins.
        </p>

        {signedOut ? (
          <div className="proof-done">
            <p>Sign in first, so the game counts for your account.</p>
            <Link className="button" href="/login?next=/code">Sign in</Link>
          </div>
        ) : (
          <form className="proof-form" onSubmit={submit}>
            <label htmlFor="game-code" className="proof-form-label">Code</label>
            <input
              id="game-code"
              ref={input}
              className="proof-input"
              value={code}
              onChange={(e) => setCode(tidyCode(e.target.value))}
              placeholder="K7M-Q2P"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={7}
              aria-describedby={error ? "code-error" : undefined}
            />
            <label className="proof-locate">
              <input
                type="checkbox"
                checked={locate}
                onChange={(e) => {
                  setLocate(e.target.checked);
                  setWantsToLocate(e.target.checked);
                }}
              />
              <span>
                Share my location for this check-in. It&apos;s only compared with the other phone&apos;s and
                deleted when the result locks.
              </span>
            </label>
            <button type="submit" className="button proof-submit" disabled={!ready || busy}>
              {busy ? "Checking in…" : "Check in"}
            </button>
            {error && <p id="code-error" className="proof-error" role="alert">{error}</p>}
          </form>
        )}

        {done && (
          <div className="proof-done" role="status">
            <p>
              <strong>✓ Checked in</strong> as {done.you} against {done.opponent} at {done.tournamentName}.
            </p>
            <p className="muted">
              {!done.opponentHasAccount
                ? `${done.opponent} has no WTA account, so this game counts as practice.`
                : done.located
                  ? "When your opponent checks in too, the game is verified."
                  : "Without location this game can be partly verified at most, unless it's at a venue's night."}
            </p>
            <Link className="button-secondary" href={`/tournaments/${done.tournamentId}`}>Back to the night</Link>
          </div>
        )}

        <ProofResults refreshKey={refresh} />
      </div>
    </main>
  );
}
