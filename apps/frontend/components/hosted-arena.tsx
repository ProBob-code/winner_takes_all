"use client";

/**
 * The arena for a hosted tournament, once the host has started it.
 *
 * This is Quick Tournament's arena — the same pods, timer bar, controls,
 * stream codes, camera feeds, victory podium and knockout progression — run
 * against the engine instead of the browser. Quick Tournament keeps its state
 * locally; a hosted tournament keeps it on the server, so every control here
 * calls the API and the scoring rules live there (see the API's
 * lib/tournament-engine.ts). The parent polls the state back in.
 *
 * Only the host gets controls. Everyone else sees the same view read-only,
 * plus the live camera feeds once the host has put the tournament on air.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backendFetch } from "@/lib/backend";
import { PoolMatchEngine } from "./pool-match-engine";
import { FootballScoreboard } from "./match-components";
import { BroadcastCode } from "./broadcast-code";
import { LiveFeedViewer } from "./live-feed-viewer";
import type { Match, Team } from "./football-match-engine";
import "./tournament-engine.css";

export interface ArenaTeam {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  bye_assigned: boolean;
}

export interface ArenaMatch {
  id: string;
  phase: "GROUP" | "SEMI" | "FINAL" | string;
  team_a_id: string;
  team_b_id: string;
  status: "CREATED" | "LIVE" | "COMPLETED";
  sudden_death: boolean;
  active_team_id: string | null;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  fouls_a?: number;
  fouls_b?: number;
  team_a_house?: "SOLID" | "STRIPES";
  team_b_house?: "SOLID" | "STRIPES";
  start_time: number | null;
  duration: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  match_order: number;
  ended_by?: "SCORE" | "TIME" | null;
}

export type ArenaScoreEvent =
  | "BALL" | "BLACK" | "GOAL" | "FOUL"
  | "REMOVE_BALL" | "REMOVE_FOUL" | "REMOVE_GOAL";

interface HostedArenaProps {
  tournamentId: string;
  tournamentName: string;
  isHost: boolean;
  isFootball: boolean;
  /** The tournament's engine phase: GROUP, KNOCKOUT or COMPLETED. */
  phase: string;
  teams: ArenaTeam[];
  matches: ArenaMatch[];
  matchesPerTeam: number;
  /** The spectator-network arena this tournament publishes as. */
  arenaId: string;
  published: boolean;
  /** Unix seconds on the server's clock, ticked by the parent. */
  currentTime: number;
  /** Merge one match the server just returned, ahead of the next poll. */
  onMatchUpdate: (match: ArenaMatch) => void;
  /** Re-read the whole state. */
  onRefresh: () => void;
}

type SubTab = "arena" | "schedule" | "standings";

/** Seconds left at which the host is offered more time, as in Quick Tournament. */
const EXTRA_TIME_PROMPT_AT = 30;

const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

const phaseLabel = (phase: string) =>
  phase === "SEMI" ? "SEMI-FINAL" : phase === "FINAL" ? "GRAND FINAL" : "GROUP STAGE";

/** The final bell. Browsers may refuse audio before any interaction; that is fine. */
function playBuzzer() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [440, 880, 1320, 1760].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5 / (i + 1), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 5);
    });
  } catch {
    /* no audio available */
  }
}

export function HostedArena({
  tournamentId,
  tournamentName,
  isHost,
  isFootball,
  phase,
  teams,
  matches,
  matchesPerTeam,
  arenaId,
  published,
  currentTime,
  onMatchUpdate,
  onRefresh,
}: HostedArenaProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("arena");
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showBroadcastCode, setShowBroadcastCode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [confirmRestartId, setConfirmRestartId] = useState<string | null>(null);
  const [confirmOffAir, setConfirmOffAir] = useState(false);
  const [victoryMatch, setVictoryMatch] = useState<ArenaMatch | null>(null);
  const [dismissedPromptId, setDismissedPromptId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setMounted(true), []);

  // ── Talking to the engine ──
  //
  // Actions are sent one at a time, in the order they were made. Two taps in
  // quick succession would otherwise both read the same score and one of them
  // would be lost.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const send = useCallback(
    (path: string, body?: unknown): Promise<any> => {
      const job = queueRef.current.then(async () => {
        setBusy(true);
        try {
          const res = await backendFetch(path, {
            method: "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          let payload: any = {};
          try {
            payload = await res.json();
          } catch {
            /* non-JSON error body */
          }
          if (!res.ok || payload?.ok === false) {
            setActionError(payload?.message || `The server returned HTTP ${res.status}.`);
            return null;
          }
          setActionError(null);
          return payload;
        } catch {
          setActionError("The server could not be reached. Check your connection and try again.");
          return null;
        } finally {
          setBusy(false);
          onRefresh();
        }
      });
      queueRef.current = job.catch(() => undefined);
      return job;
    },
    [onRefresh]
  );

  const recordScore = async (matchId: string, teamId: string, type: ArenaScoreEvent) => {
    const payload = await send(`/engine/matches/${matchId}/score`, { teamId, type });
    if (payload?.match) onMatchUpdate(payload.match);
  };

  const setActiveTeam = (matchId: string, teamId: string) =>
    send(`/engine/matches/${matchId}/highlight`, { teamId });

  const setHouse = (matchId: string, team: "A" | "B", house: "SOLID" | "STRIPES") =>
    send(`/engine/matches/${matchId}/house`, { team, house });

  const adjustTime = (matchId: string, seconds: number) =>
    send(`/engine/matches/${matchId}/extra-time`, { seconds });

  const startMatch = (matchId: string) => send(`/engine/matches/${matchId}/start`);

  const restartMatch = (matchId: string) => send(`/engine/matches/${matchId}/restart`);

  const drawNextRound = async () => {
    const payload = await send(`/engine/tournaments/${tournamentId}/generate`);
    setNotice(payload?.message || null);
  };

  const advance = async () => {
    const payload = await send(`/engine/tournaments/${tournamentId}/advance`);
    if (payload) setNotice(null);
  };

  const publish = async (live: boolean) => {
    const payload = await send(`/engine/tournaments/${tournamentId}/publish`, { live });
    return !!payload;
  };

  const reorder = (queue: ArenaMatch[], matchId: string, direction: "up" | "down") => {
    const idx = queue.findIndex((m) => m.id === matchId);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || target < 0 || target >= queue.length) return;
    const next = [...queue];
    [next[idx], next[target]] = [next[target], next[idx]];
    return send(`/engine/tournaments/${tournamentId}/reorder`, { matchIds: next.map((m) => m.id) });
  };

  // ── Derived state ──

  const liveMatch = matches.find((m) => m.status === "LIVE") || null;
  const queue = matches
    .filter((m) => m.status === "CREATED")
    .sort((a, b) => a.match_order - b.match_order);
  const played = matches.filter((m) => m.status === "COMPLETED");
  const finalMatch = matches.find((m) => m.phase === "FINAL") || null;
  const semis = matches.filter((m) => m.phase === "SEMI");
  const concluded = phase === "COMPLETED" || finalMatch?.status === "COMPLETED";
  const inKnockout = phase === "KNOCKOUT" || semis.length > 0 || !!finalMatch;
  const quotaRemaining = teams.some((t) => t.matches_played < matchesPerTeam);

  const getTeamName = (teamId: string | null) =>
    teams.find((t) => t.id === teamId)?.name || (teamId === "BYE" ? "BYE" : "TBD");

  const standings = [...teams].sort(
    (a, b) => b.group_points - a.group_points || b.total_score - a.total_score
  );
  const championId = concluded ? finalMatch?.winner_id ?? null : null;
  const champion = championId ? getTeamName(championId) : null;

  const remaining = liveMatch ? (liveMatch.start_time || 0) + liveMatch.duration - currentTime : 0;

  // ── The end of a match ──
  //
  // Quick Tournament raises the podium the moment a match is decided. Here a
  // match is decided on the server, so it shows up as a match that was live on
  // the previous poll and is finished on this one.
  const lastStatusRef = useRef<Map<string, ArenaMatch["status"]>>(new Map());

  useEffect(() => {
    const previous = lastStatusRef.current;
    for (const m of matches) {
      if (previous.get(m.id) === "LIVE" && m.status === "COMPLETED") {
        setVictoryMatch(m);
        if (m.ended_by === "TIME") playBuzzer();
      }
    }
    lastStatusRef.current = new Map(matches.map((m) => [m.id, m.status]));
  }, [matches]);

  useEffect(() => {
    if (!victoryMatch) return;
    const timer = setTimeout(() => setVictoryMatch(null), 10000);
    return () => clearTimeout(timer);
  }, [victoryMatch]);

  // When the clock reaches zero, ask for the state straight away rather than
  // waiting for the next poll: that request is what settles the match.
  const settledRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!liveMatch || liveMatch.sudden_death || remaining > 0) return;
    if (settledRequestRef.current === liveMatch.id) return;
    settledRequestRef.current = liveMatch.id;
    onRefresh();
  }, [liveMatch, remaining, onRefresh]);

  // A code is only good for the match it was issued for.
  useEffect(() => {
    if (!liveMatch) setShowBroadcastCode(false);
  }, [liveMatch]);

  const spectatorLink =
    typeof window !== "undefined" ? `${window.location.origin}/arena/${arenaId}` : `/arena/${arenaId}`;

  const toggleStream = async () => {
    if (showBroadcastCode) {
      setShowBroadcastCode(false);
      return;
    }
    // A stream code is checked against the published arena, so going on air
    // is part of putting a camera on the match.
    if (!published && !(await publish(true))) return;
    setShowBroadcastCode(true);
  };

  // The pods are shared with Quick Tournament, so the engine's rows are shaped
  // into what they expect. Per-player tracking is Quick Tournament's alone; a
  // hosted match is scored per side.
  const asPodMatch = (m: ArenaMatch): Match => ({
    id: m.id,
    team_a_id: m.team_a_id,
    team_b_id: m.team_b_id,
    score_team_a: m.score_team_a,
    score_team_b: m.score_team_b,
    balls_potted_a: m.balls_potted_a,
    balls_potted_b: m.balls_potted_b,
    black_potted_a: m.black_potted_a,
    black_potted_b: m.black_potted_b,
    status: m.status,
    winner_id: m.winner_id,
    active_team_id: m.active_team_id,
    duration: m.duration,
    start_time: m.start_time,
    order: m.match_order,
    fouls_a: m.fouls_a ?? 0,
    fouls_b: m.fouls_b ?? 0,
    team_a_house: m.team_a_house ?? "SOLID",
    team_b_house: m.team_b_house ?? "STRIPES",
    sport: isFootball ? "FOOTBALL" : "8BALL",
  });

  const asPodTeams: Team[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    matches_played: t.matches_played,
    group_points: t.group_points,
    total_score: t.total_score,
    total_balls_potted: 0,
    total_fouls: 0,
    is_team: false,
    players: [],
  }));

  // ── What the arena shows when nothing is live ──

  const renderIdle = () => {
    if (queue.length > 0) {
      const next = queue[0];
      return (
        <>
          <div className="p-icon">{next.phase === "FINAL" ? "👑" : "⚔️"}</div>
          <h3>NEXT UP • {phaseLabel(next.phase)}</h3>
          <p className="muted">
            {getTeamName(next.team_a_id)} vs {getTeamName(next.team_b_id)} • {formatClock(next.duration)}
          </p>
          {isHost ? (
            <button className="button button-gold button-lg" onClick={() => startMatch(next.id)} disabled={busy}>
              LAUNCH MATCH
            </button>
          ) : (
            <p className="muted">Waiting for the host to launch the match.</p>
          )}
        </>
      );
    }

    if (concluded) {
      return (
        <div className="tournament-completion-card animate-in">
          <div className="p-icon" style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>🏆</div>
          <h2 className="glow-text-gold" style={{ fontSize: "2.5rem", fontWeight: 950, marginBottom: "0.5rem" }}>
            TOURNAMENT CONCLUDED
          </h2>
          <p className="muted" style={{ letterSpacing: "2px", marginBottom: "3rem" }}>
            THE BATTLE HAS SETTLED • CHAMPIONS REMAIN
          </p>
          <div className="final-results-summary">
            <div className="summary-item gold-border">
              <div className="item-label">TOURNAMENT CHAMPION</div>
              <div className="item-value">{champion || standings[0]?.name || "TBD"}</div>
            </div>
            {finalMatch && (
              <div className="summary-item">
                <div className="item-label">GRAND FINAL</div>
                <div className="item-value">
                  {finalMatch.score_team_a} - {finalMatch.score_team_b}
                </div>
              </div>
            )}
          </div>
          <button className="button button-gold button-lg mt-12 w-full" onClick={() => setActiveSubTab("standings")}>
            VIEW FULL HALL OF FAME
          </button>
        </div>
      );
    }

    if (inKnockout) {
      return (
        <>
          <div className="p-icon">⚔️</div>
          <h3>SEMI-FINALS COMPLETE</h3>
          <p className="muted">The finalists have been decided! Ready for the Grand Finale?</p>
          {isHost ? (
            <button className="button button-gold button-lg" onClick={advance} disabled={busy}>
              ADVANCE TO FINALS
            </button>
          ) : (
            <p className="muted">Waiting for the host to draw the final.</p>
          )}
        </>
      );
    }

    return (
      <>
        <div className="p-icon">🏁</div>
        <h3>{quotaRemaining ? "ROUND COMPLETE" : "GROUP STAGE COMPLETE"}</h3>
        <p className="muted">
          {quotaRemaining
            ? "Every drawn fixture has been played. Draw the next round, or take the leaders into the knockouts."
            : "All teams have reached their match quota. Ready to resolve the tournament?"}
        </p>
        {isHost ? (
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {quotaRemaining && (
              <button className="button button-secondary button-lg" onClick={drawNextRound} disabled={busy}>
                DRAW THE NEXT ROUND
              </button>
            )}
            <button className="button button-gold button-lg" onClick={advance} disabled={busy || teams.length < 2}>
              ADVANCE TO KNOCKOUTS
            </button>
          </div>
        ) : (
          <p className="muted">Waiting for the host.</p>
        )}
      </>
    );
  };

  return (
    <div className="engine-container animate-in" style={{ marginBottom: "1.5rem" }}>
      {/* ── Victory podium ── */}
      {victoryMatch && (
        <div className="victory-overlay">
          <div className="victory-podium">
            <div className="v-match-status">
              {!victoryMatch.winner_id ? "DRAW" : victoryMatch.phase === "FINAL" ? "GRAND FINAL" : "MATCH COMPLETE"}
            </div>
            {victoryMatch.winner_id ? (
              <>
                <div className="v-crown">👑</div>
                <h1 className="v-name-xl glow-text-gold">{getTeamName(victoryMatch.winner_id)}</h1>
                <div className="v-label" style={{ letterSpacing: "8px", color: "var(--gold)", marginBottom: "3rem", fontWeight: 950 }}>
                  {victoryMatch.phase === "FINAL" ? "CHAMPION" : "VICTORIOUS"}
                </div>
              </>
            ) : (
              <>
                <div className="v-crown">🤝</div>
                <h1 className="v-name-xl glow-text">STALEMATE</h1>
                <div className="v-label" style={{ letterSpacing: "8px", color: "rgba(255,255,255,0.4)", marginBottom: "3rem", fontWeight: 950 }}>
                  DRAW DECLARED
                </div>
              </>
            )}
            <div className="v-stats-comparison">
              <div className="v-team-result">
                <span className="v-team-name">{getTeamName(victoryMatch.team_a_id)}</span>
                <span className="v-team-score">{victoryMatch.score_team_a}</span>
              </div>
              <div className="v-vs-divider">VS</div>
              <div className="v-team-result">
                <span className="v-team-name">{getTeamName(victoryMatch.team_b_id)}</span>
                <span className="v-team-score">{victoryMatch.score_team_b}</span>
              </div>
            </div>
            {!victoryMatch.winner_id && !isFootball && (
              <div className="v-footer">POINTS AWARDED: +50 TO EACH</div>
            )}
            <div className="v-actions-row">
              <button className="v-action-btn" onClick={() => setVictoryMatch(null)}>CONTINUE TO ARENA</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="arena-header-v2">
        <div className="arena-meta">
          <h2 className="glow-text">{tournamentName}</h2>
          <div className="arena-badge">
            ARENA {isFootball ? "FOOTBALL" : "8-BALL"} • {inKnockout ? "KNOCKOUT" : "GROUP"} • {teams.length} TEAMS •{" "}
            {played.length}/{matches.length} PLAYED
          </div>
        </div>
        <div className="arena-controls">
          <div className="sub-tab-switcher">
            {(["arena", "schedule", "standings"] as SubTab[]).map((tab) => (
              <button
                key={tab}
                className={`sub-tab ${activeSubTab === tab ? "active" : ""}`}
                onClick={() => setActiveSubTab(tab)}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          {isHost ? (
            <button
              className={`share-btn ${published ? "shared" : ""}`}
              disabled={busy}
              onClick={async () => {
                if (published || (await publish(true))) setShowShareModal(true);
              }}
              title={published ? "Spectator link and broadcast settings" : "Put this tournament on Live Screening and open it to cameras"}
            >
              {published ? "✓ ON AIR" : "🔗 SHARE ARENA"}
            </button>
          ) : (
            published && (
              <span className="live-pill" title="Anyone can watch this tournament">
                <span className="live-pulse"></span> ON AIR
              </span>
            )
          )}
        </div>
      </div>

      {actionError && (
        <p style={{ color: "#ef4444", fontSize: "0.85rem", margin: "0 0 12px" }}>{actionError}</p>
      )}
      {notice && (
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 12px" }}>{notice}</p>
      )}

      {/* ── Arena ── */}
      {activeSubTab === "arena" && (
        <div className="live-arena-v2">
          {liveMatch ? (
            <div className="match-engine-v2">
              <div className="match-timer-v3">
                <div className="live-pill">
                  <span className="live-pulse"></span> LIVE
                </div>
                <div className="timer-interactive">
                  {isHost && (
                    <button className="t-adj" onClick={() => adjustTime(liveMatch.id, -60)} disabled={busy} title="One minute less">
                      −
                    </button>
                  )}
                  <span className="time-val">{liveMatch.sudden_death ? "0:00" : formatClock(remaining)}</span>
                  {isHost && (
                    <button className="t-adj" onClick={() => adjustTime(liveMatch.id, 60)} disabled={busy} title="One minute more">
                      +
                    </button>
                  )}
                </div>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 800, letterSpacing: "0.5px" }}>
                  {phaseLabel(liveMatch.phase)}
                </span>
                {liveMatch.sudden_death && (
                  <span style={{ fontSize: "0.7rem", fontWeight: 900, letterSpacing: "1px", color: "#ef4444" }}>
                    SUDDEN DEATH • NEXT SCORE WINS
                  </span>
                )}
                {isHost && (
                  <>
                    <button
                      className="extra-time-btn"
                      style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}
                      onClick={() => setConfirmRestartId(liveMatch.id)}
                      disabled={busy}
                    >
                      RESTART
                    </button>
                    <button className="extra-time-btn" onClick={() => adjustTime(liveMatch.id, 60)} disabled={busy}>
                      +1 MIN
                    </button>
                    <button
                      className="extra-time-btn"
                      style={{ background: "rgba(139, 92, 246, 0.12)", color: "#a78bfa", border: "1px solid rgba(139, 92, 246, 0.3)" }}
                      onClick={toggleStream}
                      disabled={busy}
                      title={published ? "Put a camera on this match" : "Goes on air, then shows a code for a camera"}
                    >
                      {showBroadcastCode ? "HIDE CODE" : "STREAM"}
                    </button>
                  </>
                )}
                {isHost &&
                  !liveMatch.sudden_death &&
                  remaining > 0 &&
                  remaining <= EXTRA_TIME_PROMPT_AT &&
                  dismissedPromptId !== liveMatch.id && (
                    <div className="extra-time-toast animate-in">
                      <div className="toast-content">
                        <span>CRITICAL TIME! NEED EXTRA?</span>
                        <button
                          className="button button-gold button-sm"
                          onClick={() => {
                            adjustTime(liveMatch.id, 120);
                            setDismissedPromptId(liveMatch.id);
                          }}
                        >
                          +2 MINS
                        </button>
                        <button className="s-btn" onClick={() => setDismissedPromptId(liveMatch.id)}>×</button>
                      </div>
                    </div>
                  )}
              </div>

              {/* The host runs the match from here, so this is where the code to
                  hand a camera operator belongs. */}
              {isHost && showBroadcastCode && published && (
                <div
                  className="animate-in"
                  style={{
                    margin: "16px 0",
                    padding: "20px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <BroadcastCode
                    arenaId={arenaId}
                    matchId={liveMatch.id}
                    onClose={() => setShowBroadcastCode(false)}
                  />
                </div>
              )}

              {isFootball ? (
                <>
                  <FootballScoreboard
                    teamAName={getTeamName(liveMatch.team_a_id)}
                    teamBName={getTeamName(liveMatch.team_b_id)}
                    scoreA={liveMatch.score_team_a}
                    scoreB={liveMatch.score_team_b}
                    time={liveMatch.sudden_death ? "GOLDEN GOAL" : formatClock(remaining)}
                    status="LIVE"
                  />
                  {isHost && (
                    <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
                      {[liveMatch.team_a_id, liveMatch.team_b_id].map((teamId) => (
                        <div key={teamId} style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="button button-gold"
                            onClick={() => recordScore(liveMatch.id, teamId, "GOAL")}
                          >
                            + GOAL {getTeamName(teamId)}
                          </button>
                          <button
                            className="button button-secondary"
                            onClick={() => recordScore(liveMatch.id, teamId, "REMOVE_GOAL")}
                            title="Take back the last goal"
                          >
                            −
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <PoolMatchEngine
                  match={asPodMatch(liveMatch)}
                  teams={asPodTeams}
                  isLocked={!isHost}
                  onUpdateScore={(matchId, teamId, type) => {
                    if (isHost) recordScore(matchId, teamId, type);
                  }}
                  onUpdateHouse={(matchId, team, house) => {
                    if (isHost) setHouse(matchId, team, house);
                  }}
                  onSetActiveTeam={(matchId, teamId) => {
                    if (isHost) setActiveTeam(matchId, teamId);
                  }}
                />
              )}

              {published && (
                <div className="mt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px", width: "100%" }}>
                  <LiveFeedViewer arenaId={arenaId} matchId={liveMatch.id} isLive={true} />
                </div>
              )}

              {queue.length > 0 && (
                <div className="queue-overlay">
                  <div className="queue-header">
                    <div className="queue-title">UPCOMING DUELS ({queue.length})</div>
                  </div>
                  <div className="queue-track">
                    {queue.slice(0, 3).map((m, i) => (
                      <div key={m.id} className="queue-item">
                        <span className="q-idx">{i + 1}</span>
                        <span className="q-names">
                          {getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}
                        </span>
                      </div>
                    ))}
                    {queue.length > 3 && <div className="queue-more">+{queue.length - 3} MORE</div>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="phase-transition-overlay">
              <div className="phase-card glass-morphism">{renderIdle()}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Schedule ── */}
      {activeSubTab === "schedule" && (
        <div className="tournament-schedule-view">
          <div className="schedule-header">
            <h3 className="glow-text">Arena Schedule</h3>
            <p className="muted">
              {isHost ? "Reorder the queue and launch the next duel." : "Every fixture, in the order it will be played."}
            </p>
          </div>

          <div className="queue-list-premium mt-8">
            {queue.map((m, i) => (
              <div key={m.id} className="schedule-item-card animate-in">
                <div className="s-rank">#{i + 1}</div>
                <div className="s-info">
                  <div className="s-pair">
                    {getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}
                  </div>
                  <div className="s-meta">
                    {phaseLabel(m.phase)} • {Math.round(m.duration / 60)} MIN
                  </div>
                </div>
                {isHost && (
                  <div className="s-actions" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <button className="q-btn" onClick={() => adjustTime(m.id, -60)} disabled={busy || m.duration <= 60} title="One minute less">
                      −
                    </button>
                    <button className="q-btn" onClick={() => adjustTime(m.id, 60)} disabled={busy} title="One minute more">
                      +
                    </button>
                    <button className="q-btn" onClick={() => reorder(queue, m.id, "up")} disabled={busy || i === 0}>
                      ↑
                    </button>
                    <button className="q-btn" onClick={() => reorder(queue, m.id, "down")} disabled={busy || i === queue.length - 1}>
                      ↓
                    </button>
                    {!liveMatch && (
                      <button
                        className="button button-gold button-sm launch-btn-small"
                        onClick={() => {
                          startMatch(m.id);
                          setActiveSubTab("arena");
                        }}
                        disabled={busy}
                      >
                        LAUNCH
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {queue.length === 0 && (
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                Nothing is queued. {isHost && !concluded ? "Draw the next round or advance from the arena." : ""}
              </p>
            )}
          </div>

          {played.length > 0 && (
            <div style={{ marginTop: "2.5rem" }}>
              <label className="section-label-v2">RESULTS</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "1rem" }}>
                {[...played].reverse().map((m) => (
                  <div key={m.id} className="schedule-item-card" style={{ opacity: 0.65 }}>
                    <div className="s-info">
                      <div className="s-pair">
                        {getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}
                      </div>
                      <div className="s-meta">
                        {phaseLabel(m.phase)} • {m.winner_id ? `WON BY ${getTeamName(m.winner_id)}` : "DRAW"}
                        {m.ended_by === "TIME" ? " ON TIME" : ""}
                      </div>
                    </div>
                    <div style={{ fontFamily: "monospace", fontWeight: 900 }}>
                      {m.score_team_a} - {m.score_team_b}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Standings ── */}
      {activeSubTab === "standings" && (
        <div className="premium-standings">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>TEAM / PLAYER</th>
                <th>PLAYED</th>
                <th>WINS</th>
                <th>SCORE</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr key={t.id}>
                  <td style={{ padding: "1rem" }}>#{i + 1}</td>
                  <td style={{ fontWeight: 900 }}>
                    {t.name}
                    {(championId ? championId === t.id : i === 0 && played.length > 0) && (
                      <span style={{ marginLeft: "8px" }}>👑</span>
                    )}
                    {t.bye_assigned && (
                      <span className="status-badge" style={{ marginLeft: "10px", fontSize: "0.6rem" }}>BYE</span>
                    )}
                  </td>
                  <td>
                    {t.matches_played}
                    {!inKnockout && <span className="muted">/{matchesPerTeam}</span>}
                  </td>
                  <td style={{ color: "var(--accent-primary)" }}>{t.group_points}</td>
                  <td style={{ fontWeight: 900, color: "var(--gold)" }}>{t.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ── */}
      {confirmRestartId && mounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🔄</div>
            <h2>Restart Match?</h2>
            <p className="muted">This will reset the current scores, fouls, and ball counts for this match, and start its clock again. Are you sure?</p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setConfirmRestartId(null)}>CANCEL</button>
              <button
                className="button button-danger"
                onClick={() => {
                  restartMatch(confirmRestartId);
                  setConfirmRestartId(null);
                }}
              >
                RESTART MATCH
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showShareModal && mounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🚀</div>
            <h2 className="glow-text">Arena is Live!</h2>
            <p className="muted">
              This tournament is on the spectator network: it appears in Live Screening, anyone with the link can
              watch, and you can put cameras on a live match with STREAM.
            </p>
            <div className="share-link-premium mt-8">
              <div className="link-display">
                <span className="link-text">{spectatorLink}</span>
              </div>
              <div className="share-actions-group-v2 mt-6">
                <button
                  className="button button-gold w-full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(spectatorLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "COPIED! ✅" : "📋 COPY LINK"}
                </button>
                {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                  <button
                    className="button button-secondary w-full"
                    onClick={() =>
                      navigator.share({ title: tournamentName, text: `Watch ${tournamentName} live`, url: spectatorLink }).catch(() => {})
                    }
                  >
                    📤 SHARE
                  </button>
                )}
              </div>
            </div>
            <div className="modal-actions mt-8">
              <button
                className="button button-danger"
                onClick={() => {
                  setShowShareModal(false);
                  setConfirmOffAir(true);
                }}
              >
                TAKE OFF AIR
              </button>
              <button className="button button-secondary" onClick={() => setShowShareModal(false)}>CLOSE</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmOffAir && mounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🏁</div>
            <h2>Take Off Air?</h2>
            <p className="muted">
              The tournament will stop appearing in Live Screening and every live camera feed will end. The
              tournament itself carries on; you can go back on air at any time.
            </p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setConfirmOffAir(false)}>CANCEL</button>
              <button
                className="button button-danger"
                onClick={async () => {
                  setConfirmOffAir(false);
                  if (await publish(false)) setShowBroadcastCode(false);
                }}
              >
                TAKE OFF AIR
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
