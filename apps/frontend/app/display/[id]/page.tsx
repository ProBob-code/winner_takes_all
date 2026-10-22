"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * The big screen.
 *
 * Full bleed, readable from across a room: the live frame with both scores and
 * the clock, the table beside it, and the join QR so a walk-in can enter
 * without asking anyone.
 *
 * TWO THINGS THE BUYER PANEL CHANGED ABOUT THIS
 * Two of the twenty said the wall TV is already showing cricket, so this does
 * not assume a free screen: every size scales with the viewport rather than
 * being set for 1080p, and it works propped on a tablet or a spare monitor and
 * degrades to a phone. Nothing is positioned absolutely against an assumed
 * aspect ratio.
 *
 * WHY THERE IS NOW A WAY OUT
 * It used to have no link off it at all, on the reasoning that a read-only
 * screen should have nothing a passer-by can nudge. In practice the person who
 * opened it was the host, on their own phone, and they were stranded: the only
 * way back to the controls was the browser's back button, which is not where
 * anyone looks on a page that fills the screen. So there is one link out, in
 * the corner, dimmed until it is wanted. Nothing else is tappable.
 *
 * WHY THE TABLE EXPLAINS ITSELF
 * A table of zeroes is the most alarming thing this screen can show, and it is
 * usually telling the truth: frames have been played but not agreed, so
 * nothing has counted. The screen now says that in words, names the frames it
 * is waiting on, and labels its columns for what they actually hold — frames
 * won, not "points" — so nobody has to guess whether the night is broken.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { qrToSvg } from "@/lib/qr";
import { rankStandings, placeStandings, anythingCounted } from "@/lib/standings";

interface Team {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
}

interface Match {
  id: string;
  phase: string;
  team_a_id: string;
  team_b_id: string;
  status: string;
  sudden_death: boolean;
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
  sport?: string;
  matchesPerTeam?: number;
  teams: Team[];
  matches: Match[];
  joinCode: string | null;
  joinUrl: string | null;
  serverTime?: number;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const clock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

const phaseLabel = (phase: string) =>
  phase === "SEMI" ? "Semi-final" : phase === "FINAL" ? "Grand final" : "Group stage";

/** How many rows fit on a wall before the type shrinks past reading size. */
const ROWS_ON_SCREEN = 8;

export default function DisplayPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id;

  const [state, setState] = useState<State | null>(null);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(nowSeconds());

  /**
   * The difference between this device's clock and the server's.
   *
   * A display left on a bar's spare tablet can be minutes out, and a clock
   * counted down against a wrong "now" is wrong by that much for the whole
   * night. The offset is measured once per poll and the countdown uses it.
   */
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const [stateRes, metaRes] = await Promise.all([
        backendFetch(`/engine/tournaments/${tournamentId}/state`),
        backendFetch(`/tournaments/${tournamentId}`),
      ]);

      const payload: any = await stateRes.json();
      if (!stateRes.ok || payload?.ok === false) {
        setError(payload?.message || "This tournament could not be read.");
        return;
      }
      if (typeof payload.serverTime === "number") {
        skewRef.current = payload.serverTime - nowSeconds();
      }
      setState(payload);
      setError(null);

      const meta: any = await metaRes.json().catch(() => null);
      if (meta?.tournament?.name) setName(meta.tournament.name);
    } catch {
      // A display is left running unattended for hours. A failed poll keeps
      // the last good picture on the screen rather than blanking it; the next
      // poll will fix it.
      setError("Reconnecting…");
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
    // Three seconds. A score on a wall needs to look live; a minute's delay
    // makes the screen look broken while the game is being played in front of
    // it.
    const poll = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const ticker = window.setInterval(() => setTick(nowSeconds()), 500);
    return () => window.clearInterval(ticker);
  }, []);

  const liveMatch = useMemo(
    () => state?.matches.find((m) => m.status === "LIVE") ?? null,
    [state]
  );

  /** The fixtures still to be played, in the order they will be. */
  const queue = useMemo(
    () =>
      (state?.matches ?? [])
        .filter((m) => m.status === "CREATED")
        .sort((a, b) => a.match_order - b.match_order),
    [state]
  );

  const nextMatch = queue[0] ?? null;

  /**
   * Frames that are over but not yet on the table.
   *
   * This is the usual reason a table sits on zero, so the frames are named on
   * the screen rather than left for the host to work out.
   */
  const awaiting = useMemo(
    () =>
      (state?.matches ?? [])
        .filter((m) => m.status === "COMPLETED" && m.awaiting_confirmation)
        .sort((a, b) => a.match_order - b.match_order),
    [state]
  );

  const ranked = useMemo(() => rankStandings(state?.teams ?? []), [state]);

  /**
   * Position per row, with players who are exactly level sharing a place.
   *
   * Three players on one win and 100 points each used to come out as gold,
   * silver and bronze, decided by nothing but the order the database returned
   * them. See lib/standings.ts.
   */
  const places = useMemo(() => placeStandings(ranked), [ranked]);

  /**
   * Has anything reached the table yet?
   *
   * Until it has, every row is identical and the order is arbitrary, so the
   * screen stops dressing it up as a ranking: no leader, no top three, and a
   * line saying why.
   */
  const counted = useMemo(() => anythingCounted(ranked), [ranked]);

  const teamName = useCallback(
    (id: string | null) => state?.teams.find((t) => t.id === id)?.name ?? "TBC",
    [state]
  );

  const remaining = useMemo(() => {
    if (!liveMatch?.start_time) return null;
    const serverNow = tick + skewRef.current;
    return Math.max(0, liveMatch.start_time + liveMatch.duration - serverNow);
  }, [liveMatch, tick]);

  const joinQr = useMemo(() => {
    if (!state?.joinUrl) return null;
    try {
      return qrToSvg(state.joinUrl, { size: 148, margin: 2 });
    } catch {
      // The encoder covers the short URLs this app produces; anything it
      // cannot encode falls back to the code in text, which a player can type.
      return null;
    }
  }, [state?.joinUrl]);

  // One link off the page, in the corner, for the host who opened it on their
  // own phone and would otherwise have no way back.
  const backLink = (
    <Link className="display-back" href={`/tournaments/${tournamentId}`}>
      <span aria-hidden="true">&#8592;</span> Back to controls
    </Link>
  );

  if (!state) {
    return (
      <main className="display">
        <header className="display-head">
          <div className="display-title">{error ?? "Opening the screen…"}</div>
          <div className="display-head-right">{backLink}</div>
        </header>
      </main>
    );
  }

  // What the night is doing, in words rather than a bare phase name. "GROUP
  // STAGE" on its own told nobody whether a frame was being played.
  const statusLine = liveMatch
    ? `${phaseLabel(liveMatch.phase)} · being played now`
    : state.phase === "COMPLETED"
      ? "Night finished"
      : nextMatch
        ? `${phaseLabel(nextMatch.phase)} · next on the table`
        : "Waiting for the host to draw the next round";

  // total_score is points at pool — ten a ball, thirty the black, a hundred
  // if the black goes down early — and goals at football. It was headed
  // "Balls", which is the count beside it on the scorer's phone, not this.
  const scoreHeading = state.sport === "FOOTBALL" ? "Goals" : "Points";

  // "1 played" means nothing without the number it is counting towards. Only
  // shown in the group stage: the knockout has no quota.
  const framesEach =
    state.phase === "GROUP" && state.matchesPerTeam ? state.matchesPerTeam : null;

  return (
    <main className="display">
      <header className="display-head">
        <div style={{ minWidth: 0 }}>
          <div className="display-title">{name || "League night"}</div>
          <div className="display-status">
            {statusLine}
            {liveMatch?.sudden_death && <span className="display-sudden"> · sudden death</span>}
          </div>
        </div>
        <div className="display-head-right">
          {error && <span className="display-warn">{error}</span>}
          {backLink}
        </div>
      </header>

      {liveMatch ? (
        <section className="display-live">
          <div
            className={`display-team a${
              liveMatch.score_team_a > liveMatch.score_team_b ? " winning" : ""
            }`}
          >
            <div className="name">{teamName(liveMatch.team_a_id)}</div>
            <div className="score">{liveMatch.score_team_a}</div>
          </div>

          <div>
            {remaining !== null && (
              <>
                <div className={`display-clock${remaining <= 30 ? " low" : ""}`}>
                  {clock(remaining)}
                </div>
                <div className="display-clock-note">time left</div>
              </>
            )}
          </div>

          <div
            className={`display-team b${
              liveMatch.score_team_b > liveMatch.score_team_a ? " winning" : ""
            }`}
          >
            <div className="name">{teamName(liveMatch.team_b_id)}</div>
            <div className="score">{liveMatch.score_team_b}</div>
          </div>
        </section>
      ) : (
        <section className="display-live" style={{ gridTemplateColumns: "1fr" }}>
          <div style={{ textAlign: "center" }}>
            <div className="display-idle">
              {state.phase === "COMPLETED"
                ? ranked[0] && counted
                  ? `${ranked[0].name} wins the night`
                  : "Night finished"
                : nextMatch
                  ? `${teamName(nextMatch.team_a_id)} v ${teamName(nextMatch.team_b_id)}`
                  : "No frame on the table"}
            </div>
            <div className="display-idle-note">
              {state.phase === "COMPLETED"
                ? "Thanks for playing."
                : nextMatch
                  ? "Next up — the host starts the clock"
                  : "The host draws the next round from their phone"}
            </div>

            {/* What is coming, rather than half a screen of nothing. The room
                wants to know when it is their turn, and asking the host is the
                thing the big screen exists to stop. */}
            {queue.length > 1 && (
              <div className="display-queue">
                <span className="display-queue-tag">Then</span>
                {queue.slice(1, 4).map((m) => (
                  <span key={m.id} className="display-queue-item">
                    {teamName(m.team_a_id)} v {teamName(m.team_b_id)}
                  </span>
                ))}
                {queue.length > 4 && (
                  <span className="display-queue-more">+{queue.length - 4} more</span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* The usual reason a table sits on zero. Named here, where both players
          can see it, because that is what actually gets the taps. */}
      {awaiting.length > 0 && (
        <section className="display-pending">
          <span className="display-pending-tag">
            {awaiting.length === 1
              ? "Waiting to be agreed"
              : `${awaiting.length} frames waiting to be agreed`}
          </span>
          <div className="display-pending-list">
            {awaiting.slice(0, 3).map((m) => (
              <span key={m.id}>
                {teamName(m.team_a_id)} {m.score_team_a}&#8211;{m.score_team_b}{" "}
                {teamName(m.team_b_id)}
              </span>
            ))}
          </div>
          <span className="display-pending-note">
            {awaiting.length === 1 ? "It joins" : "They join"} the table once both players tap
            agree on their phones — or the host settles it for them.
          </span>
        </section>
      )}

      <footer className="display-foot">
        <section className="display-standings">
          <div className="display-standings-head">
            <h2>The table</h2>
            <span>
              {counted
                ? `Most frames won first, then ${scoreHeading.toLowerCase()}`
                : "Nothing has counted yet"}
            </span>
          </div>

          <table className="display-table">
            <thead>
              <tr>
                <th className="pos">#</th>
                <th>Player</th>
                <th className="num">Played</th>
                <th className="num">Won</th>
                <th className="num">{scoreHeading}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, ROWS_ON_SCREEN).map((team, i) => {
                const place = places[i];
                return (
                  <tr
                    key={team.id}
                    className={counted && place.position === 1 ? "leader" : undefined}
                  >
                    <td className="pos">
                      <span
                        className={
                          place.medal ? `display-place p${place.medal}` : "display-place"
                        }
                        title={place.shared ? "Level — nothing between them yet" : undefined}
                      >
                        {place.shared ? `=${place.position}` : place.position}
                      </span>
                    </td>
                    <td className="who">{team.name}</td>
                    <td className="num">
                      {team.matches_played}
                      {framesEach ? (
                        <span className="of">/{framesEach}</span>
                      ) : null}
                    </td>
                    <td className="num won">{team.group_points}</td>
                    <td className="num">{team.total_score}</td>
                  </tr>
                );
              })}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={5} className="display-empty">
                    Nobody has entered yet. Scan the code to be first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {ranked.length > 0 && !counted && (
            <p className="display-standings-note">
              Everyone is on zero because no frame has counted yet. A frame counts once it is
              finished and agreed.
            </p>
          )}
          {places.some((p) => p.shared) && (
            <p className="display-standings-note">
              A place marked = is shared. Nothing separates those players yet, so no medal has
              been won there.
            </p>
          )}
          {ranked.length > ROWS_ON_SCREEN && (
            <p className="display-standings-note">
              {ranked.length - ROWS_ON_SCREEN} more further down the table.
            </p>
          )}
        </section>

        {state.joinCode && (
          <div className="display-join">
            {joinQr && <div className="qr" dangerouslySetInnerHTML={{ __html: joinQr }} />}
            <div style={{ minWidth: 0 }}>
              <div className="display-join-label">Scan to play — free</div>
              <div className="code">{state.joinCode}</div>
              <div className="display-join-note">
                No account needed. Coins for every frame.
              </div>
            </div>
          </div>
        )}
      </footer>
    </main>
  );
}
