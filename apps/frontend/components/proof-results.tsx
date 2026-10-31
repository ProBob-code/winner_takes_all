"use client";

/**
 * A player's finished games and what they will pay (Proof of Play).
 *
 * Nobody has to approve a result. It locks 15 minutes after full time and
 * pays then; the side that lost can tap "Looks right" to lock it at once, or
 * "Something's wrong" to hold it for the host. Settled games show how they
 * were proven, so a player can see why one paid less.
 */

import { useCallback, useEffect, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { TIER_LABEL, TIER_MARK, reasonText, type ProofTier } from "@/lib/proof";
import "@/components/progression.css";

interface ProofGame {
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  teamA: { id: string; name: string; score: number };
  teamB: { id: string; name: string; score: number };
  winnerTeamId: string | null;
  mySide: string;
  status: "OPEN" | "DISPUTED" | "PAID" | "VOID";
  tier: ProofTier | null;
  reasons: string[];
  lockAt: number | null;
  canObject: boolean;
  disputedByMe: boolean;
  ruling: "STANDS" | "VOID" | null;
}

export function ProofResults({ title = "Your results", refreshKey = 0 }: { title?: string; refreshKey?: number }) {
  const [games, setGames] = useState<ProofGame[] | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await backendFetch("/proof/mine");
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) return;
      setSkew(body.serverTime * 1000 - Date.now());
      setGames(body.games);
    } catch {
      // Offline: keep what is shown.
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load, refreshKey]);

  async function act(matchId: string, action: "confirm" | "dispute") {
    setBusy(matchId);
    setMessage(null);
    try {
      const res = await backendFetch(`/proof/matches/${matchId}/${action}`, { method: "POST" });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) setMessage(body?.message ?? "That didn't go through. Try again.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!games || games.length === 0) return null;

  return (
    <section className="proof-results" aria-label={title}>
      <h2 className="proof-results-title">{title}</h2>
      {message && <p className="proof-results-error">{message}</p>}
      {games.map((g) => {
        const won = g.winnerTeamId === g.mySide;
        const draw = !g.winnerTeamId;
        const left = g.lockAt ? Math.max(0, Math.round(g.lockAt - (now + skew) / 1000)) : 0;
        const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
        const winnerName = g.winnerTeamId === g.teamA.id ? g.teamA.name : g.teamB.name;
        return (
          <article key={g.matchId} className={`proof-card ${g.status.toLowerCase()}`}>
            <div className="proof-card-head">
              <span className="proof-card-night">{g.tournamentName}</span>
              {g.status === "PAID" && g.tier && (
                <span className={`proof-tier ${g.tier.toLowerCase()}`}>
                  {TIER_MARK[g.tier]} {TIER_LABEL[g.tier]}
                </span>
              )}
              {g.status === "VOID" && <span className="proof-tier void">Void</span>}
            </div>
            <div className="proof-card-score">
              <span className={g.mySide === g.teamA.id ? "me" : ""}>{g.teamA.name}</span>
              <strong>{g.teamA.score}–{g.teamB.score}</strong>
              <span className={g.mySide === g.teamB.id ? "me" : ""}>{g.teamB.name}</span>
            </div>

            {g.status === "OPEN" && (
              <>
                <p className="proof-card-line">
                  {draw ? "A draw" : won ? "You won" : `${winnerName} won`}. Locks in <strong>{mm}</strong>
                  {g.canObject ? ", or sooner if you agree." : "."}
                </p>
                {g.canObject && (
                  <div className="proof-card-actions">
                    <button type="button" className="button" disabled={busy === g.matchId} onClick={() => void act(g.matchId, "confirm")}>
                      Looks right
                    </button>
                    <button type="button" className="button-secondary" disabled={busy === g.matchId} onClick={() => void act(g.matchId, "dispute")}>
                      Something&apos;s wrong
                    </button>
                  </div>
                )}
              </>
            )}

            {g.status === "DISPUTED" && (
              <p className="proof-card-line">
                {g.disputedByMe ? "You objected to this result." : "The other side objected to this result."} It
                pays nothing until the host rules on it, and is void if nobody does within 24 hours.
              </p>
            )}

            {(g.status === "PAID" || g.status === "VOID") && g.reasons.length > 0 && (
              <p className="proof-card-line muted">{g.reasons.map(reasonText).join(", ")}.</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
