"use client";

/**
 * The arena for a hosted tournament, once the host has started it.
 *
 * A hosted tournament used to render a plain scoring grid that looked nothing
 * like the Quick Tournament arena players already know, so this reuses the same
 * pods, the same chrome and the same stylesheet. The difference is where the
 * state lives: Quick Tournament keeps it in the browser, while a hosted
 * tournament keeps it in the engine, so every control here calls the API and
 * the parent polls the result back in.
 *
 * Only the host gets controls. A spectator is handed the same view with the
 * callbacks omitted, which is what makes the pods render read-only.
 */

import React, { useState } from "react";
import { PoolMatchEngine } from "./pool-match-engine";
import { FootballScoreboard } from "./match-components";
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
  phase: string;
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
  start_time: number | null;
  duration: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  match_order: number;
}

export type ArenaScoreEvent = "BALL" | "BLACK" | "GOAL" | "FOUL" | "REMOVE_BALL" | "REMOVE_FOUL";

interface HostedArenaProps {
  tournamentName: string;
  isHost: boolean;
  isFootball: boolean;
  teams: ArenaTeam[];
  matches: ArenaMatch[];
  /** Unix seconds, ticked by the parent so the clock counts down. */
  currentTime: number;
  onScore: (matchId: string, teamId: string, type: ArenaScoreEvent) => void;
  onHighlight: (matchId: string, teamId: string) => void;
  onStartMatch: (matchId: string) => void;
  onExtraTime: (matchId: string) => void;
  onGenerate: () => void;
  onReorder: (matchId: string, direction: "up" | "down") => void;
}

type SubTab = "arena" | "schedule" | "standings";

const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

export function HostedArena({
  tournamentName,
  isHost,
  isFootball,
  teams,
  matches,
  currentTime,
  onScore,
  onHighlight,
  onStartMatch,
  onExtraTime,
  onGenerate,
  onReorder,
}: HostedArenaProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("arena");

  const liveMatch = matches.find((m) => m.status === "LIVE") || null;
  const queue = matches
    .filter((m) => m.status === "CREATED")
    .sort((a, b) => a.match_order - b.match_order);
  const played = matches.filter((m) => m.status === "COMPLETED");
  const everythingPlayed = matches.length > 0 && !liveMatch && queue.length === 0;

  const getTeamName = (teamId: string) =>
    teams.find((t) => t.id === teamId)?.name || (teamId === "BYE" ? "BYE" : "Unknown");

  const standings = [...teams].sort(
    (a, b) => b.group_points - a.group_points || b.total_score - a.total_score
  );

  const remaining = liveMatch
    ? (liveMatch.start_time || 0) + liveMatch.duration - currentTime
    : 0;

  // The pods are shared with Quick Tournament, so the engine's rows are shaped
  // into what they expect. The fields that only a local arena tracks — houses,
  // per-player events — are left out, and the pods drop those controls.
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

  return (
    <div className="engine-container animate-in" style={{ marginBottom: "1.5rem" }}>
      <div className="arena-header-v2">
        <div className="arena-meta">
          <h2 className="glow-text">{tournamentName}</h2>
          <div className="arena-badge">
            ARENA {isFootball ? "FOOTBALL" : "8-BALL"} • {teams.length} TEAMS •{" "}
            {played.length}/{matches.length} PLAYED
          </div>
        </div>
        <div className="arena-controls">
          <div className="sub-tab-switcher">
            <button
              className={`sub-tab ${activeSubTab === "arena" ? "active" : ""}`}
              onClick={() => setActiveSubTab("arena")}
            >
              ARENA
            </button>
            <button
              className={`sub-tab ${activeSubTab === "schedule" ? "active" : ""}`}
              onClick={() => setActiveSubTab("schedule")}
            >
              SCHEDULE
            </button>
            <button
              className={`sub-tab ${activeSubTab === "standings" ? "active" : ""}`}
              onClick={() => setActiveSubTab("standings")}
            >
              STANDINGS
            </button>
          </div>
        </div>
      </div>

      {activeSubTab === "arena" && (
        <div className="live-arena-v2">
          {liveMatch ? (
            <div className="match-engine-v2">
              <div className="match-timer-v3">
                <div className="live-pill">
                  <span className="live-pulse"></span> LIVE
                </div>
                <div className="timer-interactive">
                  <span className="time-val">{formatClock(remaining)}</span>
                </div>
                {liveMatch.sudden_death && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 900,
                      letterSpacing: "1px",
                      color: "#ef4444",
                    }}
                  >
                    SUDDEN DEATH • NEXT SCORE WINS
                  </span>
                )}
                {isHost && (
                  <button className="extra-time-btn" onClick={() => onExtraTime(liveMatch.id)}>
                    +1 MIN
                  </button>
                )}
              </div>

              {isFootball ? (
                <>
                  <FootballScoreboard
                    teamAName={getTeamName(liveMatch.team_a_id)}
                    teamBName={getTeamName(liveMatch.team_b_id)}
                    scoreA={liveMatch.score_team_a}
                    scoreB={liveMatch.score_team_b}
                    time={formatClock(remaining)}
                    status="LIVE"
                  />
                  {isHost && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "1rem",
                        marginTop: "1.5rem",
                      }}
                    >
                      {[liveMatch.team_a_id, liveMatch.team_b_id].map((teamId) => (
                        <button
                          key={teamId}
                          className="button button-gold"
                          onClick={() => onScore(liveMatch.id, teamId, "GOAL")}
                        >
                          + GOAL {getTeamName(teamId)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <PoolMatchEngine
                  match={asPodMatch(liveMatch)}
                  teams={asPodTeams}
                  isLocked={!isHost}
                  onUpdateScore={(matchId, teamId, type) =>
                    onScore(matchId, teamId, type as ArenaScoreEvent)
                  }
                  // Houses are not stored for a hosted match, so the pods are
                  // given no house and drop the selector rather than offering a
                  // control that could not be saved.
                  onUpdateHouse={() => {}}
                  onSetActiveTeam={(matchId, teamId) => isHost && onHighlight(matchId, teamId)}
                />
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
                          {getTeamName(m.team_a_id)} <span className="dim">vs</span>{" "}
                          {getTeamName(m.team_b_id)}
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
              <div className="phase-card glass-morphism">
                {queue.length > 0 ? (
                  <>
                    <div className="p-icon">⚔️</div>
                    <h3>NEXT UP</h3>
                    <p className="muted">
                      {getTeamName(queue[0].team_a_id)} vs {getTeamName(queue[0].team_b_id)}
                    </p>
                    {isHost ? (
                      <button
                        className="button button-gold button-lg"
                        onClick={() => onStartMatch(queue[0].id)}
                      >
                        START MATCH
                      </button>
                    ) : (
                      <p className="muted">Waiting for the host to start the match.</p>
                    )}
                  </>
                ) : everythingPlayed ? (
                  <div className="tournament-completion-card animate-in">
                    <div className="p-icon" style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>
                      🏆
                    </div>
                    <h2
                      className="glow-text-gold"
                      style={{ fontSize: "2.2rem", fontWeight: 950, marginBottom: "0.5rem" }}
                    >
                      ALL FIXTURES PLAYED
                    </h2>
                    <p className="muted" style={{ letterSpacing: "2px", marginBottom: "2rem" }}>
                      LEADING ON POINTS • {standings[0]?.name || "TBD"}
                    </p>
                    {isHost && (
                      <button className="button button-gold button-lg" onClick={onGenerate}>
                        DRAW THE NEXT ROUND
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="p-icon">🏁</div>
                    <h3>ARENA IDLE</h3>
                    <p className="muted">No fixtures have been drawn yet.</p>
                    {isHost && (
                      <button className="button button-gold button-lg" onClick={onGenerate}>
                        DRAW THE NEXT ROUND
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === "schedule" && (
        <div className="tournament-schedule-view">
          <div className="schedule-header">
            <h3 className="glow-text">Arena Schedule</h3>
            <p className="muted">
              {isHost
                ? "Reorder the queue and launch the next duel."
                : "Every fixture, in the order it will be played."}
            </p>
          </div>

          <div className="queue-list-premium mt-8">
            {queue.map((m, i) => (
              <div key={m.id} className="schedule-item-card animate-in">
                <div className="s-rank">#{i + 1}</div>
                <div className="s-info">
                  <div className="s-pair">
                    {getTeamName(m.team_a_id)} <span className="dim">vs</span>{" "}
                    {getTeamName(m.team_b_id)}
                  </div>
                  <div className="s-meta">{m.phase} STAGE</div>
                </div>
                {isHost && (
                  <div className="s-actions" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <button className="q-btn" onClick={() => onReorder(m.id, "up")} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      className="q-btn"
                      onClick={() => onReorder(m.id, "down")}
                      disabled={i === queue.length - 1}
                    >
                      ↓
                    </button>
                    {i === 0 && !liveMatch && (
                      <button
                        className="button button-gold button-sm launch-btn-small"
                        onClick={() => onStartMatch(m.id)}
                      >
                        START
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {queue.length === 0 && (
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                Nothing is queued. {isHost ? "Draw the next round from the arena." : ""}
              </p>
            )}
          </div>

          {played.length > 0 && (
            <div style={{ marginTop: "2.5rem" }}>
              <label className="section-label-v2">RESULTS</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "1rem" }}>
                {played.map((m) => (
                  <div key={m.id} className="schedule-item-card" style={{ opacity: 0.65 }}>
                    <div className="s-info">
                      <div className="s-pair">
                        {getTeamName(m.team_a_id)} <span className="dim">vs</span>{" "}
                        {getTeamName(m.team_b_id)}
                      </div>
                      <div className="s-meta">
                        WON BY {m.winner_id ? getTeamName(m.winner_id) : "—"}
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
                    {i === 0 && played.length > 0 && (
                      <span style={{ marginLeft: "8px" }}>👑</span>
                    )}
                  </td>
                  <td>{t.matches_played}</td>
                  <td style={{ color: "var(--accent-primary)" }}>{t.group_points}</td>
                  <td style={{ fontWeight: 900, color: "var(--gold)" }}>{t.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
