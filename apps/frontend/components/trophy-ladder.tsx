"use client";

/**
 * The trophy ladders: Overall, then each sport offline and online, one tab
 * each. Read from /api/trophies/leaderboard; every name leads to that
 * player's public profile.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { Avatar } from "@/components/avatar";
import { TrophyBadge } from "@/components/trophy-badge";
import type { AvatarConfig } from "@/lib/avatar";
import { TRACKS } from "@/lib/trophies";
import "@/components/progression.css";

interface Leader {
  rank: number;
  userId: string;
  name: string;
  trophies: number;
  peak: number;
  wins: number;
  losses: number;
  arena: { id: string; name: string };
  level: number;
  avatar: AvatarConfig | null;
}

export function TrophyLadder({ meId }: { meId?: string | null }) {
  const [track, setTrack] = useState("overall");
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLeaders(null);
    setFailed(false);
    (async () => {
      try {
        const res = await backendFetch(`/trophies/leaderboard?track=${encodeURIComponent(track)}&limit=50`);
        const data: any = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.ok) return setFailed(true);
        setLeaders(data.leaders ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track]);

  return (
    <section className="pp-card tl" aria-label="Trophy ladders">
      <div className="tl-head">
        <h2 style={{ margin: 0 }}>Trophy road</h2>
        <div className="av-tabs" role="tablist" aria-label="Ladder">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="av-tab"
              aria-selected={t.id === track}
              onClick={() => setTrack(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <p className="muted">Could not load this ladder. Try again in a moment.</p>
      ) : leaders === null ? (
        <p className="muted">Loading…</p>
      ) : leaders.length === 0 ? (
        <p className="muted">
          Nobody is on this ladder yet. Win a rated game and you are the first. Every
          signed-in player starts at 0 trophies.
        </p>
      ) : (
        <ol className="tl-list">
          {leaders.map((l) => (
            <li key={l.userId} className={`tl-row${l.userId === meId ? " me" : ""}`}>
              <span className="tl-rank">{l.rank}</span>
              <Link href={`/players/${encodeURIComponent(l.userId)}`} className="name-with-avatar">
                <Avatar avatar={l.avatar} seed={l.userId} size={34} />
                <span style={{ minWidth: 0 }}>
                  <span className="name-with-avatar-text tl-name">{l.name}</span>
                  <span className="tl-meta">
                    <span className="level-pill">Lv {l.level}</span> {l.arena.name}
                  </span>
                </span>
              </Link>
              <span className="tl-trophies">
                <TrophyBadge trophies={l.trophies} arenaId={l.arena.id} size={26} />
                {l.trophies.toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
