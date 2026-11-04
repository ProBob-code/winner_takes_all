"use client";

// Reads the signed-in player's coin state at mount.
export const dynamic = "force-dynamic";

/**
 * The 8-ball game, hosted so that finishing one earns WTA Coins.
 *
 * The game is WTA's own, in /public/8ball (physics, rules, AI and the online
 * client; see its README). It runs in a frame and posts the result out when a
 * game ends. This page listens, claims the coins, and shows what was earned.
 *
 * It also tells the frame where the API is and whether the player is signed
 * in, which the online mode needs to open its socket.
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
import { backendFetch, getApiBaseUrl } from "@/lib/backend";
import { CoinMark } from "@/components/coin-mark";
import { CrownLogo } from "@/components/brand-mark";
import "@/components/progression.css";
import { formatCoins, formatCoinsExact } from "@/lib/format";
import { TrophyBadge } from "@/components/trophy-badge";
import { TRACKS, signedTrophies } from "@/lib/trophies";

interface Claimed {
  awarded: number;
  awards: Array<{ reason: string; amount: number; description: string }>;
  balance?: number;
  title?: string;
  message?: string;
  cappedOut?: boolean;
  /** What the game did to the player's trophies; empty when it was unrated. */
  trophies?: Array<{ track: string; delta: number; trophies: number }>;
}

/** What a rated game is worth, from /api/online/start. */
interface Stakes {
  win: number;
  loss: number;
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

const NOTE_KEY = "wta-8ball-note";

export default function PlayEightBallPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [onlineLeft, setOnlineLeft] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The note under the table, closable and remembered per device: on a phone
  // it took a fifth of the screen on every game.
  const [noteOpen, setNoteOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(NOTE_KEY) === "closed") setNoteOpen(false);
    } catch {
      /* stays open */
    }
  }, []);
  const toggleNote = (open: boolean) => {
    setNoteOpen(open);
    try {
      window.localStorage.setItem(NOTE_KEY, open ? "open" : "closed");
    } catch {
      /* for this visit only */
    }
  };
  const [claimed, setClaimed] = useState<Claimed | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [stakes, setStakes] = useState<Stakes | null>(null);

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

  // The name shown on the online table.
  useEffect(() => {
    if (!signedIn) return;
    backendFetch("/user/profile")
      .then((r) => r.json())
      .then((p: any) => {
        if (p?.ok && p.user?.name) setPlayerName(String(p.user.name));
      })
      .catch(() => {
        /* the table shows "You" */
      });
  }, [signedIn]);

  // What the game needs from the page: where the API is, and who is playing.
  const sendConfig = useCallback(() => {
    try {
      frameRef.current?.contentWindow?.postMessage(
        {
          wtaHost: true,
          type: "config",
          apiBase: getApiBaseUrl() || null,
          signedIn,
          name: playerName,
        },
        window.location.origin
      );
    } catch {
      /* the frame is not up yet; it asks again with "ready" */
    }
  }, [signedIn, playerName]);
  useEffect(() => {
    sendConfig();
  }, [sendConfig]);

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

      if (data.type === "ready") {
        sendConfig();
        return;
      }

      // A game against the AI has begun: put it on record before anyone knows
      // how it ends, so closing the tab while losing still counts as a loss.
      if (data.type === "game_start") {
        if (!signedIn || data.mode !== 1) return;
        try {
          const res = await backendFetch("/online/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sessionRef.current, mode: 1, aiRating: data.aiRating }),
          });
          const payload: any = await res.json().catch(() => ({}));
          if (payload?.ok && payload.stakes) setStakes(payload.stakes);
        } catch {
          /* unrated rather than broken: the coins still work without it */
        }
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
        const mode = data.mode === 1 ? 1 : data.mode === 3 ? 3 : 2;
        const claim = () =>
          backendFetch("/coins/claim-online", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionRef.current,
              mode,
              tableId: mode === 3 ? String(data.tableId || "") : undefined,
              won: !!data.won,
              aiRating: data.aiRating,
              seconds: Math.max(0, Math.round(Number(data.seconds) || 0)),
              shots: Math.max(0, Math.round(Number(data.shots) || 0)),
            }),
          });
        let res = await claim();
        let payload: any = await res.json().catch(() => ({}));
        // Online, the table may still be hearing from the other screen.
        for (let i = 0; mode === 3 && payload?.pending && i < 6; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await claim();
          payload = await res.json().catch(() => ({}));
        }
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
        setStakes(null);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [signedIn, sendConfig]);

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

            {claimed.trophies && claimed.trophies.length > 0 && (
              <span className="game-result-note" style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                {claimed.trophies.map((t) => (
                  <span key={t.track} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    <TrophyBadge trophies={t.trophies} size={26} />
                    <strong>{signedTrophies(t.delta)}</strong>
                    <span className="muted">{TRACKS.find((x) => x.id === t.track)?.label ?? t.track}</span>
                  </span>
                ))}
              </span>
            )}

            {claimed.cappedOut && (
              <span className="game-result-note">
                A fight at a venue is worth far more than a day of browser play — that
                is deliberate. <Link href="/run">Run a league fight</Link>.
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

      {/* The game, full screen: the design has its own header, menu and
          coin display, so the page adds no chrome around it. sandbox is
          deliberately narrow: scripts and its own origin, nothing else. */}
      <div style={{ position: "fixed", inset: 0, display: "flex", background: "#070504" }}>
        <iframe
          ref={frameRef}
          src="/8ball/index.html?v=5"
          title="WTA Eight Ball"
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          style={{ flex: 1, width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </div>
    </main>
  );
}
