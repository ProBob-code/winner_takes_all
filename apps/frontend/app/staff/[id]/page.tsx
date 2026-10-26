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
 *
 * WHAT A NIGHT ON IT CHANGED
 * The buttons sat in a block at the top with half the screen black below
 * them, because the grid holding the two sides stretched and its contents did
 * not. On the phone it is actually used on, that is a thumb reaching up for a
 * target that could have been twice the size. Everything now fills the screen
 * it is given, and BALL is the biggest thing on it.
 *
 * Three more things came off the same night. BLACK looked like BALL — same
 * yellow, same shape, one of them ends the frame, and in a dark room that is
 * a mis-tap waiting to happen; it is now unmistakably the black. The balls
 * potted were a "1/7" chip nobody could read at a glance, and are now seven
 * pips you can count without reading. And fouls were recorded but never shown,
 * so the one number a player would actually argue about was invisible to the
 * person holding the phone.
 *
 * AND BY VOICE
 * The scorer is often the one holding the cue. components/voice-scorer.tsx
 * turns "Asha two balls one foul" into the same taps, from this phone's mic
 * or from Handy on a laptop, and "Bob note the points" wakes it hands-free.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { enqueueWrite, startOutbox, subscribeToOutbox, pendingWrites } from "@/lib/outbox";
import { projectPending, racketRuleText, type LocalScoreEvent, type PendingTap } from "@/lib/local-score";
import { RacketCallBanner, tennisGameScore } from "@/components/racket-call";
import { sportInfo } from "@/lib/sports";
import { FrameConfirm, type FrameConfirmation } from "@/components/frame-confirm";
import { VoiceScorer } from "@/components/voice-scorer";

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

/** Balls on a side at 8-ball, before the black. */
const BALLS_PER_SIDE = 7;

export default function StaffModePage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id;

  const [state, setState] = useState<State | null>(null);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<Array<PendingTap & { id: string }>>([]);
  /**
   * Taps already sent but not yet in a server snapshot.
   *
   * A tap leaves the queue the moment the server accepts it, and the board
   * used to drop it then, falling back to the last poll, which did not have
   * it yet. So every goal, point or undo flickered back for up to the 4 s
   * between polls (found testing football live: the board read 2-1 while the
   * server had 2-0). A sent tap now stays on the board until a poll that
   * began after it was sent comes back, and a drained tap prompts that poll
   * at once.
   */
  const [settled, setSettled] = useState<Array<PendingTap & { id: string; sentAt: number }>>([]);
  const queuedIdsRef = useRef<Map<string, PendingTap>>(new Map());
  /** Tap ids the last snapshot already contains (from the state route). */
  const appliedRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(nowSeconds());
  const [working, setWorking] = useState(false);
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const startedAt = Date.now();
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
      // The server lists the taps it has applied, so the board knows exactly
      // which of its own it no longer needs to add. Timing alone could not
      // tell: a tap applied just before a poll, but noticed as sent just
      // after it, was counted twice (seen live as 3-0 on the way to 2-0).
      // A sent tap the server has not listed is kept, for at most 20 s.
      const applied = new Set<string>(Array.isArray(payload.appliedEventIds) ? payload.appliedEventIds : []);
      appliedRef.current = applied;
      setSettled((prev) =>
        prev.filter((tap) => !applied.has(tap.id) && (applied.size > 0 || tap.sentAt >= startedAt) && Date.now() - tap.sentAt < 20_000)
      );
      setError(null);
    } catch {
      // Keep the last good picture. The queued taps are still being shown on
      // top of it, so the board stays usable with no network at all.
      setError(null);
    }
  }, [tournamentId]);
  const loadRef = useRef<(() => Promise<void>) | null>(null);
  loadRef.current = load;

  /**
   * The night's name, once.
   *
   * A venue running two tables has two of these phones open, and "Staff mode"
   * on both of them is how a frame gets scored onto the wrong night.
   */
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await backendFetch(`/tournaments/${tournamentId}`);
        const payload: any = await res.json().catch(() => null);
        if (!cancelled && payload?.tournament?.name) setName(payload.tournament.name);
      } catch {
        // The name is a convenience. Scoring does not wait on it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  /** What is still on this device, so the board can project it. */
  const readQueue = useCallback(async () => {
    const entries = await pendingWrites();
    const taps: Array<PendingTap & { id: string }> = [];
    const ids = new Map<string, PendingTap>();
    for (const entry of entries) {
      const body = entry.body as any;
      const matchId = /\/engine\/matches\/([^/]+)\/score/.exec(entry.path)?.[1];
      if (!matchId || !body?.teamId || !body?.type) continue;
      const tapId = String(body.eventId ?? entry.seq);
      const tap = { matchId, teamId: body.teamId, type: body.type as LocalScoreEvent };
      taps.push({ ...tap, id: tapId });
      ids.set(tapId, tap);
    }
    // Whatever left the queue since last time was sent: keep it on the board
    // until a fresh snapshot carries it, and fetch that snapshot now.
    const sent: Array<PendingTap & { id: string; sentAt: number }> = [];
    for (const [id, tap] of queuedIdsRef.current) {
      if (!ids.has(id)) sent.push({ ...tap, id, sentAt: Date.now() });
    }
    queuedIdsRef.current = ids;
    if (sent.length > 0) setSettled((prev) => [...prev, ...sent]);
    setQueued(taps);
    if (sent.length > 0) void loadRef.current?.();
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
    // Sent-but-unconfirmed taps first: they happened before the queued ones.
    // Anything the server has already applied is in serverMatch and skipped.
    const applied = appliedRef.current;
    const notYetApplied = [...settled, ...queued].filter((tap) => !applied.has(tap.id));
    return projectPending(serverMatch as any, notYetApplied, state?.sport ?? "8BALL");
  }, [serverMatch, queued, settled]);

  const liveMatch = (projection?.match as Match | undefined) ?? serverMatch;
  const pendingHere = projection?.applied ?? 0;

  const ordered = useMemo(
    () => [...(state?.matches ?? [])].sort((a, b) => a.match_order - b.match_order),
    [state]
  );

  const queue = useMemo(() => ordered.filter((m) => m.status === "CREATED"), [ordered]);
  const nextMatch = queue[0] ?? null;

  /**
   * Which frame of how many.
   *
   * "On the table" said nothing about whether the night was starting or
   * nearly over, which is the first thing anyone asks the person scoring.
   */
  const frameNumber = useMemo(() => {
    const done = ordered.filter((m) => m.status === "COMPLETED").length;
    return liveMatch ? done + 1 : done;
  }, [ordered, liveMatch]);

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
  // Tennis, badminton, pickleball, table tennis: rally points to a target.
  const sport = sportInfo(state?.sport);
  const isRally = sport.kind === "rally";
  const isTennis = sport.id === "TENNIS";

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
    const otherValue = which === "a" ? liveMatch.score_team_b : liveMatch.score_team_a;
    const balls = which === "a" ? liveMatch.balls_potted_a : liveMatch.balls_potted_b;
    const blackGone = which === "a" ? liveMatch.black_potted_a : liveMatch.black_potted_b;
    const fouls = (which === "a" ? liveMatch.fouls_a : liveMatch.fouls_b) ?? 0;
    const ahead = scoreValue > otherValue;

    return (
      <div className={`staff-side ${which}${ahead ? " ahead" : ""}`}>
        <div className="staff-side-head">
          <span className="name">{teamName(teamId)}</span>
          {ahead && <span className="staff-ahead">ahead</span>}
        </div>

        {/* Score and state on one line. Stacked, the two sides together were
            taller than a phone, so the scorer had to scroll to reach the
            second player — at the table, mid-frame. */}
        <div className="staff-readout">
          <div className="score">
            {scoreValue}
            {pendingHere > 0 && (
              <span className="pending-mark" title="Saved on this device, not sent yet">
                ●
              </span>
            )}
          </div>

          <div className="staff-meta">
            {/* Counted, not read. Seven pips fill as the balls go down, so the
                state of the frame is legible from across a dark room. */}
            {isTennis && (
              <span className="staff-fouls" title="The game in progress">
                This game <strong style={{ fontSize: "1.4em" }}>{tennisGameScore(liveMatch, which === "a" ? "A" : "B")}</strong>
              </span>
            )}
            {!isFootball && !isRally && (
              <div
                className="staff-pips"
                aria-label={`${balls} of ${BALLS_PER_SIDE} balls potted`}
              >
                {Array.from({ length: BALLS_PER_SIDE }, (_, i) => (
                  <span key={i} className={`staff-pip${i < balls ? " on" : ""}`} />
                ))}
                <span className={`staff-pip black${blackGone ? " on" : ""}`} />
              </div>
            )}

            {/* Recorded all along and shown nowhere, which made it the one
                number a player could argue about and the scorer could not
                check. */}
            {fouls > 0 && (
              <span className="staff-fouls">
                {fouls} {fouls === 1 ? "foul" : "fouls"}
              </span>
            )}
          </div>
        </div>

        {isRally ? (
          <>
            <button
              type="button"
              className="staff-btn big"
              onClick={() => void score(teamId, "POINT")}
            >
              POINT
              <span className="staff-btn-note">rally won</span>
            </button>
            <button
              type="button"
              className="staff-btn ghost"
              onClick={() => void score(teamId, "REMOVE_POINT")}
              disabled={scoreValue <= 0}
            >
              Undo point
            </button>
          </>
        ) : isFootball ? (
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
              disabled={balls >= BALLS_PER_SIDE}
            >
              BALL
              <span className="staff-btn-note">
                {balls >= BALLS_PER_SIDE ? "all seven down" : `${BALLS_PER_SIDE - balls} left`}
              </span>
            </button>
            <button
              type="button"
              className="staff-btn black"
              onClick={() => void score(teamId, "BLACK")}
              disabled={blackGone}
            >
              BLACK
              <span className="staff-btn-note">ends the frame</span>
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
          <div className="staff-kicker">
            {name || "Staff mode"}
            {liveMatch?.sudden_death && <span className="staff-sudden"> · sudden death</span>}
          </div>
          <div className="staff-where">
            {liveMatch
              ? `${sport.kind === "pool" ? "Frame" : "Match"} ${frameNumber}${queue.length > 0 ? ` · ${queue.length} to come` : " · last one drawn"}`
              : state.phase === "COMPLETED"
                ? "The night is finished"
                : nextMatch
                  ? "Nothing on the table yet"
                  : "Nothing drawn"}
          </div>
        </div>
        {remaining !== null && (
          <div className={`staff-clock${remaining <= 30 ? " low" : ""}`}>
            {clock(remaining)}
            <span className="staff-clock-note">left</span>
          </div>
        )}
      </header>

      {error && <div className="staff-error">{error}</div>}

      {/* Voice: the same taps as the buttons, for a scorer with a cue or a
          drink in hand. Spoken taps go through the same outbox. */}
      {liveMatch && (
        <VoiceScorer
          match={liveMatch}
          players={[
            { id: liveMatch.team_a_id, name: teamName(liveMatch.team_a_id) },
            { id: liveMatch.team_b_id, name: teamName(liveMatch.team_b_id) },
          ]}
          sport={isFootball ? "FOOTBALL" : isRally ? "RALLY" : "POOL"}
          rallySport={sport.id}
          onScore={score}
        />
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

      {liveMatch && isRally && (
        <div style={{ textAlign: "center", margin: "0.25rem 0" }}>
          <RacketCallBanner
            match={liveMatch}
            sport={sport.id}
            nameA={teamName(liveMatch.team_a_id)}
            nameB={teamName(liveMatch.team_b_id)}
          />
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            {isTennis ? "Score is games. " : ""}
            {racketRuleText(sport.id)}
          </div>
        </div>
      )}

      {liveMatch ? (
        <section className="staff-sides">
          {side("a")}
          {side("b")}
        </section>
      ) : (
        <section className="staff-sides one">
          <div className="staff-side">
            <div className="staff-side-head">
              <span className="name">
                {nextMatch
                  ? `${teamName(nextMatch.team_a_id)} v ${teamName(nextMatch.team_b_id)}`
                  : "No frame waiting"}
              </span>
            </div>
            {nextMatch ? (
              <>
                <p className="staff-hint">
                  Call them to the table, then start the clock.
                </p>
                <button
                  type="button"
                  className="staff-btn big"
                  onClick={() => void command(`/engine/matches/${nextMatch.id}/start`)}
                  disabled={working}
                >
                  {working ? "Starting…" : "START THIS FRAME"}
                </button>
                {queue.length > 1 && (
                  <p className="staff-hint">
                    Then {teamName(queue[1].team_a_id)} v {teamName(queue[1].team_b_id)}
                    {queue.length > 2 ? `, and ${queue.length - 2} more` : ""}.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="staff-hint">
                  Everyone drawn has played. Draw another round, or move the night into the
                  knockout.
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

      {/* Who is up after this one, so the scorer can call them over without
          going to another screen to find out. */}
      {liveMatch && nextMatch && (
        <p className="staff-next">
          Next: {teamName(nextMatch.team_a_id)} v {teamName(nextMatch.team_b_id)}
        </p>
      )}

      <footer className="staff-foot">
        {liveMatch && (
          <button
            type="button"
            className="staff-btn ghost"
            onClick={() => void command(`/engine/matches/${liveMatch.id}/extra-time`, { seconds: 60 })}
            disabled={working}
          >
            +1 min
          </button>
        )}
        <Link className="staff-btn ghost" href={`/display/${tournamentId}`}>
          Big screen
        </Link>
        <Link className="staff-btn ghost" href={`/tournaments/${tournamentId}`}>
          Full controls
        </Link>
      </footer>
    </main>
  );
}
