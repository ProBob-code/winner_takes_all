"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiUrl } from "@/lib/api-config";
import { Avatar } from "@/components/avatar";
import { TrophyLadder } from "@/components/trophy-ladder";
import type { AvatarConfig } from "@/lib/avatar";

type LeaderboardEntry = {
  userId: string;
  displayName: string;
  /** Absent against an API from before levels and avatars. */
  level?: number;
  avatar?: AvatarConfig | null;
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

// Inline, not in the <style jsx> below: styled-jsx scopes its rules to the
// elements this file renders itself, and never reaches inside <Link>, so a
// class rule for these was silently ignored and the global gold link colour
// won, which made the champion's name gold on the gold podium card.
const NAME_LINK = { color: "inherit", textDecoration: "none" } as const;
const POD_AVATAR = {
  width: 54, height: 54, borderRadius: "50%", overflow: "hidden", display: "flex", flex: "none",
} as const;



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
      titles: acc.titles + (e.tournamentWins || 0),
    }),
    { players: 0, matches: 0, titles: 0 }
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
              <span className="lb-total-value gold">{totals.titles}</span>
              <span className="lb-total-label">TITLES WON</span>
            </div>
          </div>
        </div>

        {/* Trophies first: the ladder a win climbs and a loss falls down. The
            points table below is the all-time record. */}
        <div className="slide-in" style={{ margin: "var(--space-5) 0" }}>
          <TrophyLadder meId={meId} />
        </div>

        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 900, margin: "var(--space-5) 0 var(--space-3)" }}>
          All-time points
        </h2>

        {/* The top three, in order, tallest in the middle. */}
        {top3.length >= 3 && (
          <div className="lb-podium slide-in">
            {[top3[1], top3[0], top3[2]].map((entry, i) => {
              const place = i === 1 ? 0 : i === 0 ? 1 : 2;
              return (
                <div key={entry.userId} className={`lb-pod place-${place + 1}`}>
                  <div className="lb-pod-medal">{MEDALS[place]}</div>
                  <Link href={`/players/${encodeURIComponent(entry.userId)}`} className="lb-avatar lg" style={POD_AVATAR} aria-hidden tabIndex={-1}>
                    <Avatar avatar={entry.avatar} seed={entry.userId} size={54} />
                  </Link>
                  <div className="lb-pod-name">
                    <Link href={`/players/${encodeURIComponent(entry.userId)}`} className="lb-name-link" style={NAME_LINK}>
                      {entry.displayName}
                    </Link>
                    {entry.level ? <span className="lb-level">Lv {entry.level}</span> : null}
                    {entry.userId === meId && <span className="lb-you">YOU</span>}
                  </div>
                  <div className="lb-pod-points">{entry.points} pts</div>
                  <div className="lb-pod-meta">
                    {entry.played} played · {entry.wins}W
                    {entry.tournamentWins > 0 ? ` · 🏆 ${entry.tournamentWins}` : ""}
                  </div>
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
                  <span className="lb-avatar">
                    <Avatar avatar={entry.avatar} seed={entry.userId} size={34} />
                  </span>
                  <span className="lb-player-text">
                    <span className="lb-name">
                      <Link href={`/players/${encodeURIComponent(entry.userId)}`} className="lb-name-link" style={NAME_LINK}>
                        {entry.displayName}
                      </Link>
                      {entry.level ? <span className="lb-level">Lv {entry.level}</span> : null}
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
        /* The podium as three cards: gold for the champion, the other two
           leaning in on either side. */
        .lb-pod {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 1.5rem 1rem 1.25rem;
          border-radius: 22px;
          background: var(--bg-card);
          border: 2px solid var(--card-offset-hot);
          box-shadow: 7px 7px 0 var(--card-offset-hot);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .lb-pod.place-2 { transform: rotate(-2deg); }
        .lb-pod.place-3 { transform: rotate(2deg); }
        .lb-pod:hover { transform: translate(-3px, -5px) rotate(0deg); box-shadow: 11px 11px 0 var(--card-offset-hot); }
        .lb-pod.place-1 {
          padding-top: 2.25rem;
          background: var(--gradient-fill);
          color: var(--on-gold);
          border-color: var(--on-gold);
          box-shadow: 8px 8px 0 var(--on-gold);
        }
        .lb-pod.place-1 .lb-pod-points,
        .lb-pod.place-1 .lb-pod-meta,
        .lb-pod.place-1 .lb-pod-name { color: var(--on-gold); }
        .lb-pod-medal { font-size: 2rem; line-height: 1; margin-bottom: 0.5rem; }
        .lb-pod-name { font-weight: 800; font-size: 1rem; margin-top: 0.6rem; }
        .lb-pod-points { font-size: 0.8rem; font-weight: 800; color: var(--accent-light); margin-top: 2px; }
        .lb-pod-meta { font-size: 0.68rem; color: var(--text-muted); margin-top: 6px; }
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
          grid-template-columns: 52px minmax(150px, 2fr) 80px 80px 96px 88px 88px;
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
          background: color-mix(in oklab, var(--accent) 10%, transparent);
          box-shadow: inset 3px 0 0 var(--accent);
        }

        .lb-rank { font-size: 1rem; font-weight: 900; color: var(--text-muted); }
        .lb-player { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .lb-avatar {
          width: 34px; height: 34px; flex: none;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.72rem; font-weight: 900; letter-spacing: 0.5px;
          background: color-mix(in oklab, var(--accent) 16%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
          color: var(--accent-light);
        }
        .lb-avatar.lg { width: 54px; height: 54px; font-size: 1rem; }
        .lb-avatar { overflow: hidden; padding: 0; }
        .lb-avatar svg { width: 100%; height: 100%; }
        .lb-name-link { color: inherit; text-decoration: none; }
        .lb-name-link:hover { text-decoration: underline; }
        .lb-level {
          margin-left: 6px; padding: 1px 6px; border-radius: 999px;
          /* Its card's own text colour, so it reads on the gold podium too. */
          border: 1px solid currentColor; color: inherit; opacity: 0.85;
          font-size: 0.68rem; font-weight: 800; vertical-align: middle;
        }
        .lb-player-text { display: flex; flex-direction: column; min-width: 0; }
        .lb-name {
          font-weight: 800;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .lb-you {
          margin-left: 8px; padding: 2px 6px; border-radius: 5px;
          font-size: 0.55rem; font-weight: 900; letter-spacing: 0.5px;
          background: color-mix(in oklab, var(--accent) 20%, transparent); color: var(--accent-light);
        }
        .lb-inline-meta { display: none; font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }

        .num { text-align: right; font-variant-numeric: tabular-nums; font-size: 0.88rem; }
        .points { font-weight: 900; }
        .win { color: var(--gold); font-weight: 800; }
        .loss { color: #ef4444; font-weight: 800; }
        .dim { color: var(--text-muted); }
        .lb-titles { color: var(--gold); font-weight: 800; }

        .lb-empty { padding: 4rem 2rem; text-align: center; }
        .lb-empty-icon { font-size: 3rem; opacity: 0.35; margin-bottom: 1rem; }

        /* Narrow screens: keep the name and the points, fold the rest into
           the line under the name. */
        @media (max-width: 860px) {
          .lb-podium { grid-template-columns: 1fr; }
          .lb-pod { border-radius: 16px; padding: 1.25rem; }
          .lb-row { grid-template-columns: 44px 1fr auto; padding: 0.85rem 1rem; }
          .lb-head-row { display: none; }
          .lb-inline-meta { display: block; }
          .num:not(.points) { display: none; }
        }
      `}</style>
    </main>
  );
}
