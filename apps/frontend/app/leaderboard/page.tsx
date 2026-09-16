"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-config";

type LeaderboardEntry = {
  userId: string;
  displayName: string;
  /** Matches played, across bracket matches and hosted tournaments alike. */
  played: number;
  wins: number;
  losses: number;
  points: number;
  totalScore: number;
  tournamentWins: number;
  earnings: { amount: string; currency: string };
};

const MEDALS = ["🥇", "🥈", "🥉"];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "?";

const inr = (amount: string | number) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (typeof window === "undefined") return;
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || getApiUrl();

        // Knowing who is looking lets the board point out their own row.
        try {
          const meRes = await fetch(`${apiUrl}/api/user/profile`, { credentials: "include" });
          const me = await meRes.json();
          if (me?.user?.id) setMeId(me.user.id);
        } catch {
          /* signed out */
        }

        const res = await fetch(`${apiUrl}/api/leaderboard/global`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        setEntries(data.entries || []);
      } catch (err: any) {
        console.error("Leaderboard fetch error:", err);
        setError(err.message || "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <div className="empty-state slide-in">
            <div className="empty-icon loading-spin">🏆</div>
            <h3>Loading leaderboard...</h3>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Leaderboard</h2>
            <p className="muted">Something went wrong. Error: {error}</p>
          </div>
        </div>
      </main>
    );
  }

  const top3 = entries.slice(0, 3);
  const totals = entries.reduce(
    (acc, e) => ({
      players: acc.players + 1,
      matches: acc.matches + (e.played || 0),
      paid: acc.paid + Number(e.earnings?.amount || 0),
    }),
    { players: 0, matches: 0, paid: 0 }
  );

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: "1040px" }}>
        {/* Header: what this board is, and the season in three numbers. */}
        <div className="lb-header slide-in">
          <div>
            <h1 className="lb-title">Rankings</h1>
            <p className="muted lb-sub">
              Everyone who has played, from hosted tournaments and one-off matches alike.
              Three points a win, ten for taking a tournament.
            </p>
          </div>
          <div className="lb-totals">
            <div className="lb-total">
              <span className="lb-total-value">{totals.players}</span>
              <span className="lb-total-label">PLAYERS</span>
            </div>
            <div className="lb-total">
              <span className="lb-total-value">{totals.matches}</span>
              <span className="lb-total-label">MATCHES</span>
            </div>
            <div className="lb-total">
              <span className="lb-total-value gold">{inr(totals.paid)}</span>
              <span className="lb-total-label">PAID OUT</span>
            </div>
          </div>
        </div>

        {/* The top three, in order, tallest in the middle. */}
        {top3.length >= 3 && (
          <div className="lb-podium slide-in">
            {[top3[1], top3[0], top3[2]].map((entry, i) => {
              const place = i === 1 ? 0 : i === 0 ? 1 : 2;
              return (
                <div key={entry.userId} className={`lb-pod place-${place + 1}`}>
                  <div className="lb-pod-medal">{MEDALS[place]}</div>
                  <div className="lb-avatar lg">{initials(entry.displayName)}</div>
                  <div className="lb-pod-name">
                    {entry.displayName}
                    {entry.userId === meId && <span className="lb-you">YOU</span>}
                  </div>
                  <div className="lb-pod-points">{entry.points} pts</div>
                  <div className="lb-pod-meta">
                    {entry.played} played · {entry.wins}W
                    {entry.tournamentWins > 0 ? ` · 🏆 ${entry.tournamentWins}` : ""}
                  </div>
                  <div className="lb-pod-earnings">{inr(entry.earnings.amount)}</div>
                  <div className="lb-pillar" />
                </div>
              );
            })}
          </div>
        )}

        {/* The full board. */}
        <div className="lb-board slide-in">
          <div className="lb-row lb-head-row">
            <span>#</span>
            <span>PLAYER</span>
            <span className="num">PLAYED</span>
            <span className="num">TITLES</span>
            <span className="num">W/L</span>
            <span className="num">SCORE</span>
            <span className="num">POINTS</span>
            <span className="num">EARNINGS</span>
          </div>

          {entries.length === 0 ? (
            <div className="lb-empty">
              <div className="lb-empty-icon">🏁</div>
              <h3>Nobody has played yet</h3>
              <p className="muted">
                Join a tournament — every match played counts towards these rankings.
              </p>
            </div>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.userId}
                className={`lb-row ${i < 3 ? "top" : ""} ${entry.userId === meId ? "me" : ""}`}
              >
                <span className="lb-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>

                <span className="lb-player">
                  <span className="lb-avatar">{initials(entry.displayName)}</span>
                  <span className="lb-player-text">
                    <span className="lb-name">
                      {entry.displayName}
                      {entry.userId === meId && <span className="lb-you">YOU</span>}
                    </span>
                    {/* On a narrow screen the columns fold away, so the row
                        still has to say what it is worth. */}
                    <span className="lb-inline-meta">
                      {entry.played} played · {entry.wins}W/{entry.losses}L · {entry.points} pts
                    </span>
                  </span>
                </span>

                <span className="num" data-label="Played">{entry.played}</span>
                <span className="num" data-label="Titles">
                  {entry.tournamentWins > 0 ? (
                    <span className="lb-titles">🏆 {entry.tournamentWins}</span>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </span>
                <span className="num" data-label="W/L">
                  <span className="win">{entry.wins}</span>
                  <span className="dim"> / </span>
                  <span className="loss">{entry.losses}</span>
                </span>
                <span className="num" data-label="Score">{entry.totalScore}</span>
                <span className="num points" data-label="Points">{entry.points}</span>
                <span className="num earnings" data-label="Earnings">{inr(entry.earnings.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .lb-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 2rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }
        .lb-title {
          font-size: 2.4rem;
          font-weight: 900;
          margin: 0;
          background: linear-gradient(90deg, #fff, var(--gold));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .lb-sub { max-width: 46ch; font-size: 0.86rem; margin: 0.4rem 0 0; }

        .lb-totals { display: flex; gap: 1.5rem; }
        .lb-total { display: flex; flex-direction: column; align-items: flex-end; }
        .lb-total-value { font-size: 1.35rem; font-weight: 900; line-height: 1.1; }
        .lb-total-value.gold { color: var(--gold); }
        .lb-total-label {
          font-size: 0.55rem; font-weight: 900; letter-spacing: 1.5px;
          color: var(--text-muted); margin-top: 2px;
        }

        /* Podium */
        .lb-podium {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          align-items: end;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .lb-pod {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 1.5rem 1rem 1.25rem;
          border-radius: 20px 20px 12px 12px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.06);
          transition: transform 0.3s ease, border-color 0.3s ease;
        }
        .lb-pod:hover { transform: translateY(-6px); }
        .lb-pod.place-1 {
          padding-top: 2.25rem;
          border-color: rgba(245, 158, 11, 0.45);
          background: linear-gradient(180deg, rgba(245, 158, 11, 0.12), rgba(255, 255, 255, 0.02));
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }
        .lb-pod-medal { font-size: 2rem; line-height: 1; margin-bottom: 0.5rem; }
        .lb-pod-name { font-weight: 800; font-size: 1rem; margin-top: 0.6rem; }
        .lb-pod-points { font-size: 0.8rem; font-weight: 800; color: var(--accent-light); margin-top: 2px; }
        .lb-pod-meta { font-size: 0.68rem; color: var(--text-muted); margin-top: 6px; }
        .lb-pod-earnings { font-size: 1rem; font-weight: 900; color: var(--gold); margin-top: 0.75rem; }
        .lb-pillar { display: none; }

        /* Board */
        .lb-board {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          overflow: hidden;
        }
        .lb-row {
          display: grid;
          grid-template-columns: 52px minmax(150px, 2fr) 80px 80px 96px 88px 88px 110px;
          align-items: center;
          gap: 0.5rem;
          padding: 0.9rem 1.25rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .lb-row:last-child { border-bottom: none; }
        .lb-head-row {
          font-size: 0.58rem;
          font-weight: 900;
          letter-spacing: 1.5px;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.02);
        }
        .lb-row:not(.lb-head-row):hover { background: rgba(255, 255, 255, 0.035); }
        .lb-row.top { background: rgba(245, 158, 11, 0.04); }
        .lb-row.me {
          background: rgba(139, 92, 246, 0.1);
          box-shadow: inset 3px 0 0 var(--accent);
        }

        .lb-rank { font-size: 1rem; font-weight: 900; color: var(--text-muted); }
        .lb-player { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .lb-avatar {
          width: 34px; height: 34px; flex: none;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.72rem; font-weight: 900; letter-spacing: 0.5px;
          background: rgba(139, 92, 246, 0.16);
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: var(--accent-light);
        }
        .lb-avatar.lg { width: 54px; height: 54px; font-size: 1rem; }
        .lb-player-text { display: flex; flex-direction: column; min-width: 0; }
        .lb-name {
          font-weight: 800;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .lb-you {
          margin-left: 8px; padding: 2px 6px; border-radius: 5px;
          font-size: 0.55rem; font-weight: 900; letter-spacing: 0.5px;
          background: rgba(139, 92, 246, 0.2); color: var(--accent-light);
        }
        .lb-inline-meta { display: none; font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }

        .num { text-align: right; font-variant-numeric: tabular-nums; font-size: 0.88rem; }
        .points { font-weight: 900; }
        .earnings { font-weight: 900; color: var(--gold); }
        .win { color: #10b981; font-weight: 800; }
        .loss { color: #ef4444; font-weight: 800; }
        .dim { color: var(--text-muted); }
        .lb-titles { color: var(--gold); font-weight: 800; }

        .lb-empty { padding: 4rem 2rem; text-align: center; }
        .lb-empty-icon { font-size: 3rem; opacity: 0.35; margin-bottom: 1rem; }

        /* Narrow screens: keep the name and the money, fold the rest into the
           line under the name. */
        @media (max-width: 860px) {
          .lb-podium { grid-template-columns: 1fr; }
          .lb-pod { border-radius: 16px; padding: 1.25rem; }
          .lb-row { grid-template-columns: 44px 1fr auto; padding: 0.85rem 1rem; }
          .lb-head-row { display: none; }
          .lb-inline-meta { display: block; }
          .num:not(.earnings) { display: none; }
        }
      `}</style>
    </main>
  );
}
