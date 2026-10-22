"use client";

// Reads the signed-in player's coin state at mount.
export const dynamic = "force-dynamic";

/**
 * The 8-ball game, hosted so that finishing one earns WTA Coins.
 *
 * The game itself is an untouched third-party Phaser build in /public/8ball.
 * Rather than patching it, it runs in a frame and a small reporter
 * (public/8ball/wta-coins.js) posts the result out when the game ends. This
 * page listens, claims the coins, and shows what was earned.
 *
 * WHY THE AWARDS ARE SMALL, SAID ON THE PAGE
 * A browser result is reported by the player's own device and cannot be
 * verified, so online play is worth roughly a tenth of a venue frame and sits
 * under its own daily ceiling. That is also the commercial message: the
 * product is league nights in rooms, and the coin schedule should say so
 * rather than quietly imply otherwise.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { CoinMark } from "@/components/coin-mark";
import { formatCoins, formatCoinsExact } from "@/lib/format";

interface Claimed {
  awarded: number;
  awards: Array<{ reason: string; amount: number; description: string }>;
  balance?: number;
  title?: string;
  message?: string;
  cappedOut?: boolean;
}

/** One id per loaded game, so a result can only ever be claimed once. */
function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* fall through */
  }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export default function PlayEightBallPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [onlineLeft, setOnlineLeft] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [claimed, setClaimed] = useState<Claimed | null>(null);
  const [claiming, setClaiming] = useState(false);

  // A fresh id per game, replaced once a result has been claimed so a second
  // game in the same sitting is a new claim rather than a duplicate.
  const sessionRef = useRef<string>(newSessionId());

  const loadBalance = useCallback(async () => {
    try {
      const res = await backendFetch("/coins/me");
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      const payload: any = await res.json().catch(() => ({}));
      if (payload?.ok) setBalance(payload.balance);
    } catch {
      /* the game still plays without it */
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      // Only this origin's frame may claim coins.
      if (event.origin !== window.location.origin) return;
      const data: any = event.data;
      if (!data || !data.wtaCoins) return;

      if (data.type === "exit") {
        window.location.href = "/games";
        return;
      }

      if (data.type !== "game_over") return;
      if (!signedIn) {
        setClaimed({
          awarded: 0,
          awards: [],
          message: "Sign in before your next game and it will count.",
        });
        return;
      }

      setClaiming(true);
      try {
        const res = await backendFetch("/coins/claim-online", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionRef.current,
            mode: data.mode === 1 ? 1 : 2,
            won: !!data.won,
            aiRating: data.aiRating,
            seconds: data.seconds,
            shots: data.shots,
          }),
        });
        const payload: any = await res.json().catch(() => ({}));
        if (payload?.ok) {
          setClaimed(payload);
          if (typeof payload.balance === "number") setBalance(payload.balance);
          if (typeof payload.onlineRemainingToday === "number") {
            setOnlineLeft(payload.onlineRemainingToday);
          }
        } else {
          setClaimed({ awarded: 0, awards: [], message: payload?.message });
        }
      } catch {
        setClaimed({
          awarded: 0,
          awards: [],
          message: "Could not reach the server. That game did not count.",
        });
      } finally {
        setClaiming(false);
        // The next game is a new claim.
        sessionRef.current = newSessionId();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [signedIn]);

  return (
    <main
      style={{
        // dvh rather than vh: on a phone the browser chrome collapses as you
        // scroll, and a 100vh game frame ends up taller than the screen.
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
      }}
    >
      {/* A thin strip rather than the usual chrome: the table needs the room. */}
      <header
        className="h-stack between"
        style={{
          padding: `calc(var(--space-2) + env(safe-area-inset-top, 0px)) var(--space-4) var(--space-2)`,
          borderBottom: "1px solid var(--glass-border-color)",
          gap: "var(--space-3)",
        }}
      >
        <Link
          href="/games"
          className="muted"
          style={{ fontSize: "var(--text-sm)", textDecoration: "none" }}
        >
          ← Games
        </Link>

        <div className="h-stack tight">
          {signedIn ? (
            <>
              <CoinMark size={22} />
              <strong style={{ fontSize: "var(--text-sm)" }}>
                {balance === null ? "…" : formatCoins(balance)}
              </strong>
              {onlineLeft !== null && (
                <span className="chip" title="What browser play can still earn today">
                  {formatCoins(onlineLeft)} left today
                </span>
              )}
            </>
          ) : (
            <Link href="/login" className="chip warn" style={{ textDecoration: "none" }}>
              sign in to earn coins
            </Link>
          )}
        </div>
      </header>

      {/* ── The result, over the table ──
          This used to be a strip above the iframe, which put it in a different
          part of the screen from the game's own game-over panel — so the thing
          telling you about coins appeared nowhere near the thing telling you
          the game had ended, and was easy to miss entirely. It is an overlay
          now: same place you are already looking. */}
      {claiming && (
        <div className="game-result-layer" role="status" aria-live="polite">
          <div className="game-result counting">
            <span className="spinner" aria-hidden="true" />
            <span>Counting your coins…</span>
          </div>
        </div>
      )}

      {claimed && (
        <div
          className="game-result-layer"
          role="status"
          aria-live="polite"
          onClick={() => setClaimed(null)}
        >
          <div
            className={`game-result ${claimed.awarded > 0 ? "won" : "lost"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {claimed.awarded > 0 ? (
              <>
                <span className="game-result-mark">
                  <CoinMark size={72} />
                </span>
                <span className="game-result-amount">
                  +{formatCoinsExact(claimed.awarded)}
                </span>
                <span className="game-result-unit">WTA Coins</span>
                {claimed.awards.length > 0 && (
                  <span className="game-result-note">
                    {claimed.awards.map((a) => a.description).join(" · ")}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="game-result-amount lost">No coins</span>
                <span className="game-result-note">
                  {claimed.message ?? "Only the winner earns. Beat the machine and they are yours."}
                </span>
              </>
            )}

            {claimed.cappedOut && (
              <span className="game-result-note">
                A night at a venue is worth far more than a day of browser play — that
                is deliberate. <Link href="/run">Run a league night</Link>.
              </span>
            )}

            <div className="game-result-actions">
              <button
                type="button"
                className="button"
                onClick={() => setClaimed(null)}
              >
                Play again
              </button>
              <Link className="button-secondary" href="/coins" style={{ textDecoration: "none" }}>
                My coins
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* The game. sandbox is deliberately narrow: it needs scripts and its own
          origin for localStorage, and nothing else. */}
      <iframe
        src="/8ball/index.html"
        title="8-Ball Pool"
        sandbox="allow-scripts allow-same-origin"
        style={{
          flex: 1,
          width: "100%",
          border: 0,
          display: "block",
          minHeight: "60vh",
        }}
      />

      <footer
        style={{
          padding: `var(--space-2) var(--space-4) calc(var(--space-2) + env(safe-area-inset-bottom, 0px))`,
          borderTop: "1px solid var(--glass-border-color)",
        }}
      >
        <p className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "center" }}>
          Only the winner earns — beat the machine and the coins are yours, lose and
          nothing is paid. Browser games are worth a fraction of a league night and have
          their own daily limit. WTA Coins have no cash value and cannot be bought or
          withdrawn.
        </p>
      </footer>
    </main>
  );
}
