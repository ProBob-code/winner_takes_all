"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * Staff mode: one screen, big buttons, scoring only.
 *
 * WHO THIS IS FOR
 * The person holding the phone was trained for ninety seconds, it is Friday,
 * the room is dark and loud, and they have a drink in the other hand. So:
 * nothing here is smaller than a thumb, there is no navigation, there is no
 * way to delete a tournament, publish a stream or change a setting, and the
 * only two things on screen are the two players and the buttons that score
 * them.
 *
 * WHY IT IS THE PAGE THAT GOES OFFLINE-FIRST
 * Every tap goes through lib/outbox.ts: written to IndexedDB first, sent
 * second, replayed in order when the connection returns. The score on screen
 * is the server's last word with the queued taps projected on top, so a tap
 * registers instantly and visibly even with no signal at all. A tap that has
 * not reached the server yet is marked, so staff can tell the difference and
 * do not re-tap.
 *
 * The one thing this page will not do offline is end a round or draw the next
 * one: those need the engine. It says so rather than appearing to work.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { enqueueWrite, startOutbox, subscribeToOutbox, pendingWrites } from "@/lib/outbox";
import { projectPending, type LocalScoreEvent, type PendingTap } from "@/lib/local-score";
import { FrameConfirm, type FrameConfirmation } from "@/components/frame-confirm";

interface Team {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  user_id?: string | null;
}

interface Match {
  id: string;
  phase: string;
  team_a_id: string;
  team_b_id: string;
  status: string;
  sudden_death: boolean;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  fouls_a?: number;
  fouls_b?: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  start_time: number | null;
  duration: number;
  match_order: number;
  awaiting_confirmation?: boolean;
}

interface State {
  ok: boolean;
  phase: string;
  sport: string;
  teams: Team[];
  matches: Match[];
  requireFrameConfirmation?: boolean;
  confirmations?: FrameConfirmation[];
  joinCode?: string | null;
  serverTime?: number;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const clock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

export default function StaffModePage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id;

  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<PendingTap[]>([]);
  const [tick, setTick] = useState(nowSeconds());
  const [working, setWorking] = useState(false);
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await backendFetch(`/engine/tournaments/${tournamentId}/state`);
      const payload: any = await res.json();
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "This tournament could not be read.");
        return;
      }
      if (typeof payload.serverTime === "number") {
        skewRef.current = payload.serverTime - nowSeconds();
      }
      setState(payload);
      setError(null);
    } catch {
      // Keep the last good picture. The queued taps are still being shown on
      // top of it, so the board stays usable with no network at all.
      setError(null);
    }
  }, [tournamentId]);

  /** What is still on this device, so the board can project it. */
  const readQueue = useCallback(async () => {
    const entries = await pendingWrites();
    const taps: PendingTap[] = [];
    for (const entry of entries) {
      const body = entry.body as any;
      const matchId = /\/engine\/matches\/([^/]+)\/score/.exec(entry.path)?.[1];
      if (!matchId || !body?.teamId || !body?.type) continue;
      taps.push({ matchId, teamId: body.teamId, type: body.type as LocalScoreEvent });
    }
    setQueued(taps);
  }, []);

  useEffect(() => {
    startOutbox();
    void load();
    void readQueue();
    const poll = window.setInterval(() => void load(), 4000);
    // Re-read the queue whenever it changes, so the pending marks appear and
    // clear as taps drain.
    const unsubscribe = subscribeToOutbox(() => void readQueue());
    return () => {
      window.clearInterval(poll);
      unsubscribe();
    };
  }, [load, readQueue]);

  useEffect(() => {
    const ticker = window.setInterval(() => setTick(nowSeconds()), 500);
    return () => window.clearInterval(ticker);
  }, []);

  const serverMatch = useMemo(
    () => state?.matches.find((m) => m.status === "LIVE") ?? null,
    [state]
  );

  /**
   * The board: the server's last word with everything still queued on this
   * device applied on top. Not written anywhere — the next poll replaces it.
   */
  const projection = useMemo(() => {
    if (!serverMatch) return null;
    return projectPending(serverMatch as any, queued);
  }, [serverMatch, queued]);

  const liveMatch = (projection?.match as Match | undefined) ?? serverMatch;
  const pendingHere = projection?.applied ?? 0;

  const nextMatch = useMemo(
    () =>
      state?.matches
        .filter((m) => m.status === "CREATED")
        .sort((a, b) => a.match_order - b.match_order)[0] ?? null,
    [state]
  );

  /** A frame that is decided but still waiting on both players to agree. */
  const awaiting = useMemo(
    () =>
      state?.matches
        .filter((m) => m.status === "COMPLETED" && m.awaiting_confirmation)
        .sort((a, b) => b.match_order - a.match_order)[0] ?? null,
    [state]
  );

  const teamName = useCallback(
    (id: string | null) => state?.teams.find((t) => t.id === id)?.name ?? "TBC",
    [state]
  );

  const remaining = useMemo(() => {
    if (!liveMatch?.start_time) return null;
    return Math.max(0, liveMatch.start_time + liveMatch.duration - (tick + skewRef.current));
  }, [liveMatch, tick]);

  const isFootball = state?.sport === "FOOTBALL";

  /**
   * Score a tap.
   *
   * Queued, not sent: this returns as soon as the tap is on disk, so the
   * button never waits on the network. The board updates from the queue, not
   * from the response.
   */
  const score = async (teamId: string, type: LocalScoreEvent) => {
    if (!liveMatch) return;
    await enqueueWrite({
      path: `/engine/matches/${liveMatch.id}/score`,
      body: { teamId, type },
      label: `${type} for ${teamName(teamId)}`,
    });
    void readQueue();
  };

  /** Everything that genuinely needs the server, and says so when it fails. */
  const command = async (path: string, body?: unknown) => {
    setWorking(true);
    setError(null);
    try {
      const res = await backendFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || `The server returned HTTP ${res.status}.`);
        return false;
      }
      await load();
      return true;
    } catch {
      setError("This needs a connection, and there isn't one. Scoring still works.");
      return false;
    } finally {
      setWorking(false);
    }
  };

  if (!state) {
    return (
      <main className="staff">
        <div style={{ margin: "auto", textAlign: "center" }} className="muted">
          {error ?? "Opening staff mode…"}
        </div>
      </main>
    );
  }

  const side = (which: "a" | "b") => {
    if (!liveMatch) return null;
    const teamId = which === "a" ? liveMatch.team_a_id : liveMatch.team_b_id;
    const scoreValue = which === "a" ? liveMatch.score_team_a : liveMatch.score_team_b;
    const balls = which === "a" ? liveMatch.balls_potted_a : liveMatch.balls_potted_b;
    const blackGone = which === "a" ? liveMatch.black_potted_a : liveMatch.black_potted_b;

    return (
      <div className={`staff-side ${which}`}>
        <div className="h-stack between">
          <span className="name">{teamName(teamId)}</span>
          {!isFootball && <span className="chip">{balls}/7</span>}
        </div>

        <div className="score">
          {scoreValue}
          {pendingHere > 0 && (
            <span className="pending-mark" title="Saved on this device, not sent yet">
              ●
            </span>
          )}
        </div>

        {isFootball ? (
          <>
            <button
              type="button"
              className="staff-btn big"
              onClick={() => void score(teamId, "GOAL")}
            >
              GOAL
            </button>
            <button
              type="button"
              className="staff-btn ghost"
              onClick={() => void score(teamId, "REMOVE_GOAL")}
            >
              Undo goal
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="staff-btn big"
              onClick={() => void score(teamId, "BALL")}
              disabled={balls >= 7}
            >
              BALL
            </button>
            <button
              type="button"
              className="staff-btn gold"
              onClick={() => void score(teamId, "BLACK")}
              disabled={blackGone}
            >
              BLACK
            </button>
            <div className="staff-row">
              <button
                type="button"
                className="staff-btn ghost"
                onClick={() => void score(teamId, "FOUL")}
              >
                Foul
              </button>
              <button
                type="button"
                className="staff-btn ghost"
                onClick={() => void score(teamId, "REMOVE_BALL")}
                disabled={balls <= 0}
              >
                Undo ball
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <main className="staff">
      <header className="staff-head">
        <div style={{ minWidth: 0 }}>
          <div
            className="muted"
            style={{
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            Staff mode
          </div>
          <div style={{ fontWeight: 700 }}>
            {liveMatch
              ? liveMatch.sudden_death
                ? "Sudden death"
                : "On the table"
              : state.phase === "COMPLETED"
                ? "Finished"
                : "Nothing live"}
          </div>
        </div>
        {remaining !== null && (
          <div className="staff-clock" style={remaining <= 30 ? { color: "#f87171" } : undefined}>
            {clock(remaining)}
          </div>
        )}
      </header>

      {error && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-sm)",
            background: "rgba(220, 38, 38, 0.12)",
            border: "1px solid rgba(220, 38, 38, 0.4)",
            fontSize: "var(--text-sm)",
          }}
        >
          {error}
        </div>
      )}

      {awaiting && state.requireFrameConfirmation && (
        <FrameConfirm
          matchId={awaiting.id}
          teamAId={awaiting.team_a_id}
          teamBId={awaiting.team_b_id}
          teamAName={teamName(awaiting.team_a_id)}
          teamBName={teamName(awaiting.team_b_id)}
          winnerId={awaiting.winner_id}
          scoreA={awaiting.score_team_a}
          scoreB={awaiting.score_team_b}
          confirmations={state.confirmations ?? []}
          myTeamId={null}
          isHost
          onConfirmed={() => void load()}
        />
      )}

      {liveMatch ? (
        <section className="staff-sides">
          {side("a")}
          {side("b")}
        </section>
      ) : (
        <section className="staff-sides" style={{ gridTemplateColumns: "1fr" }}>
          <div className="staff-side">
            <div className="name">
              {nextMatch
                ? `${teamName(nextMatch.team_a_id)} v ${teamName(nextMatch.team_b_id)}`
                : "No frame waiting"}
            </div>
            {nextMatch ? (
              <button
                type="button"
                className="staff-btn big"
                onClick={() => void command(`/engine/matches/${nextMatch.id}/start`)}
                disabled={working}
              >
                {working ? "Starting…" : "START THIS FRAME"}
              </button>
            ) : (
              <>
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  Draw the next round, or finish the night.
                </p>
                <button
                  type="button"
                  className="staff-btn"
                  onClick={() => void command(`/engine/tournaments/${tournamentId}/generate`)}
                  disabled={working}
                >
                  Draw the next round
                </button>
                <button
                  type="button"
                  className="staff-btn ghost"
                  onClick={() => void command(`/engine/tournaments/${tournamentId}/advance`)}
                  disabled={working}
                >
                  Into the knockout
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <footer className="h-stack tight" style={{ justifyContent: "center" }}>
        {liveMatch && (
          <button
            type="button"
            className="staff-btn ghost"
            onClick={() => void command(`/engine/matches/${liveMatch.id}/extra-time`, { seconds: 60 })}
            disabled={working}
            style={{ flex: "1 1 8rem" }}
          >
            +1 min
          </button>
        )}
        <Link
          className="staff-btn ghost"
          href={`/display/${tournamentId}`}
          style={{
            flex: "1 1 8rem",
            textDecoration: "none",
            display: "grid",
            placeItems: "center",
          }}
        >
          Big screen
        </Link>
        <Link
          className="staff-btn ghost"
          href={`/tournaments/${tournamentId}`}
          style={{
            flex: "1 1 8rem",
            textDecoration: "none",
            display: "grid",
            placeItems: "center",
          }}
        >
          Full controls
        </Link>
      </footer>
    </main>
  );
}
