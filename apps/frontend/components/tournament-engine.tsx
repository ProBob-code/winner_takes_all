"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import "./tournament-engine.css";

// ── Types ──
interface EngineTeam {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  bye_assigned: number;
}

interface EngineMatch {
  id: string;
  tournament_id: string;
  phase: string;
  team_a_id: string;
  team_b_id: string;
  teamAName: string;
  teamBName: string;
  status: string;
  start_time: number | null;
  duration: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  winnerName: string | null;
  ended_by: string | null;
  sudden_death: number;
  match_order: number;
  explanation: string | null;
  timer?: { remaining: number; expired: boolean; danger: boolean } | null;
}

interface EngineState {
  phase: string;
  teams: EngineTeam[];
  matches: EngineMatch[];
  liveMatch: EngineMatch | null;
  nextMatch: EngineMatch | null;
}

interface TournamentEngineProps {
  tournamentId: string;
  apiBase?: string;
}

// ── API helpers ──
async function engineFetch(apiBase: string, path: string, opts: RequestInit = {}) {
  const url = `${apiBase}/api/engine${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
    credentials: "include",
  });
  return res.json();
}

// ── Main Component ──
export function TournamentEngine({ tournamentId, apiBase = "" }: TournamentEngineProps) {
  const [state, setState] = useState<EngineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Setup state
  const [newTeamName, setNewTeamName] = useState("");
  const [duration, setDuration] = useState(10); // minutes
  const [adding, setAdding] = useState(false);

  // Timer
  const [timerRemaining, setTimerRemaining] = useState<number>(0);
  const [timerDanger, setTimerDanger] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch state ──
  const fetchState = useCallback(async () => {
    try {
      const data = await engineFetch(apiBase, `/tournaments/${tournamentId}/state`);
      if (data.ok) {
        setState(data);
        // Update timer from server
        if (data.liveMatch?.timer) {
          setTimerRemaining(data.liveMatch.timer.remaining);
          setTimerDanger(data.liveMatch.timer.danger);
          setTimerExpired(data.liveMatch.timer.expired);
        }
      } else {
        setError(data.message || "Failed to load");
      }
    } catch (e) {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }, [apiBase, tournamentId]);

  // Initial load + polling
  useEffect(() => {
    fetchState();
    pollRef.current = setInterval(fetchState, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState]);

  // Client-side timer countdown (between server polls)
  useEffect(() => {
    if (state?.liveMatch && state.liveMatch.start_time && state.liveMatch.status !== "COMPLETED") {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimerRemaining(prev => {
          const next = Math.max(0, prev - 1);
          setTimerDanger(next > 0 && next <= 60);
          if (next === 0 && !timerExpired) {
            setTimerExpired(true);
            // Trigger server-side timer check
            engineFetch(apiBase, `/matches/${state.liveMatch!.id}/check-timer`, { method: "POST" })
              .then(() => fetchState());
          }
          return next;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [state?.liveMatch?.id, state?.liveMatch?.status]);

  // ── Actions ──
  const addTeam = async () => {
    if (!newTeamName.trim()) return;
    setAdding(true);
    const path = state?.phase === "GROUP"
      ? `/tournaments/${tournamentId}/add-team`
      : `/tournaments/${tournamentId}/teams`;
    await engineFetch(apiBase, path, {
      method: "POST",
      body: JSON.stringify({ name: newTeamName.trim() }),
    });
    setNewTeamName("");
    setAdding(false);
    await fetchState();
  };

  const startTournament = async () => {
    await engineFetch(apiBase, `/tournaments/${tournamentId}/start`, {
      method: "POST",
      body: JSON.stringify({ duration: duration * 60 }),
    });
    await fetchState();
  };

  const startMatch = async (matchId: string) => {
    await engineFetch(apiBase, `/matches/${matchId}/start`, { method: "POST" });
    await fetchState();
  };

  const scoreEvent = async (matchId: string, team: "A" | "B", type: "ball" | "black" | "mistake") => {
    await engineFetch(apiBase, `/matches/${matchId}/score`, {
      method: "POST",
      body: JSON.stringify({ team, type }),
    });
    await fetchState();
  };

  const forceEndMatch = async (matchId: string) => {
    await engineFetch(apiBase, `/matches/${matchId}/end`, { method: "POST" });
    await fetchState();
  };

  const generateMatches = async () => {
    await engineFetch(apiBase, `/tournaments/${tournamentId}/generate`, {
      method: "POST",
      body: JSON.stringify({ duration: duration * 60 }),
    });
    await fetchState();
  };

  // ── Helpers ──
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getPhaseOrder = (p: string) => {
    const order: Record<string, number> = { SETUP: 0, open: 0, GROUP: 1, KNOCKOUT: 2, COMPLETED: 3 };
    return order[p] ?? 0;
  };

  if (loading) return <div className="engine-container engine-fade-in"><p style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading tournament engine...</p></div>;
  if (error) return <div className="engine-container engine-fade-in"><p style={{ textAlign: "center", padding: "3rem", color: "#ef4444" }}>{error}</p></div>;
  if (!state) return null;

  const phase = state.phase;
  const currentPhaseIdx = getPhaseOrder(phase);
  const phases = ["SETUP", "GROUP", "KNOCKOUT", "COMPLETED"];

  // ── Render ──
  return (
    <div className="engine-container engine-fade-in">
      <div className="engine-header">
        <h1>🏟️ Tournament Engine</h1>
        <p className="engine-subtitle">Dynamic tournament with deterministic fairness</p>
      </div>

      {/* Phase Bar */}
      <div className="phase-bar">
        {phases.map((p, i) => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div className={`phase-step ${currentPhaseIdx === i ? "active" : ""} ${currentPhaseIdx > i ? "completed" : ""}`}>
              {currentPhaseIdx > i ? "✓" : ""} {p}
            </div>
            {i < phases.length - 1 && <div className={`phase-connector ${currentPhaseIdx > i ? "done" : ""}`} />}
          </div>
        ))}
      </div>

      {/* ── SETUP / OPEN Phase ── */}
      {(phase === "SETUP" || phase === "open") && (
        <div className="setup-panel engine-fade-in">
          <div className="setup-section">
            <h3>Teams ({state.teams.length})</h3>
            <div className="team-input-row">
              <input
                className="team-input"
                placeholder="Enter team name..."
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTeam()}
              />
              <button className="btn-add-team" onClick={addTeam} disabled={adding || !newTeamName.trim()}>
                {adding ? "Adding..." : "+ Add"}
              </button>
            </div>
            <div className="team-list">
              {state.teams.map((t, i) => (
                <div key={t.id} className="team-chip">
                  <div>
                    <span className="team-number">#{i + 1}</span>
                    {t.name}
                  </div>
                </div>
              ))}
              {state.teams.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>
                  No teams added yet. Add at least 2 to start.
                </p>
              )}
            </div>
          </div>

          <div className="setup-section">
            <h3>Match Duration</h3>
            <div className="duration-config">
              <input
                type="number"
                className="duration-input"
                value={duration}
                min={1}
                max={60}
                onChange={e => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <span className="duration-unit">minutes per match</span>
            </div>
          </div>

          <button
            className="btn-start-tournament"
            onClick={startTournament}
            disabled={state.teams.length < 2}
          >
            🚀 Start Tournament ({state.teams.length} teams)
          </button>
        </div>
      )}

      {/* ── GROUP Phase ── */}
      {phase === "GROUP" && (
        <div className="engine-fade-in">
          {/* Live Match */}
          {state.liveMatch && (
            <LiveMatchPanel
              match={state.liveMatch}
              timerRemaining={timerRemaining}
              timerDanger={timerDanger}
              timerExpired={timerExpired}
              onScore={(team, type) => scoreEvent(state.liveMatch!.id, team, type)}
              onForceEnd={() => forceEndMatch(state.liveMatch!.id)}
            />
          )}

          {/* Next Match */}
          {!state.liveMatch && state.nextMatch && (
            <div className="next-match-card engine-fade-in">
              <h4>Next Match</h4>
              <div className="next-match-teams">{state.nextMatch.teamAName} vs {state.nextMatch.teamBName}</div>
              {state.nextMatch.explanation && (
                <p className="match-explanation">{state.nextMatch.explanation}</p>
              )}
              <button className="ctrl-btn primary" onClick={() => startMatch(state.nextMatch!.id)}>
                ▶ Start Match
              </button>
            </div>
          )}

          {/* No matches available — generate more */}
          {!state.liveMatch && !state.nextMatch && (
            <div className="next-match-card engine-fade-in">
              <h4>No Matches Pending</h4>
              <p className="match-explanation">Generate the next round of matches, or add more teams.</p>
              <div className="match-controls">
                <button className="ctrl-btn primary" onClick={generateMatches}>⚡ Generate Next Matches</button>
              </div>
            </div>
          )}

          {/* Add Team Mid-Tournament */}
          {!state.liveMatch && (
            <div style={{ marginBottom: "1.5rem" }}>
              <div className="team-input-row">
                <input
                  className="team-input"
                  placeholder="Add team mid-tournament..."
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTeam()}
                />
                <button className="btn-add-team" onClick={addTeam} disabled={adding || !newTeamName.trim()}>
                  + Add Team
                </button>
              </div>
            </div>
          )}

          {/* Standings */}
          <StandingsTable teams={state.teams} />

          {/* Match History */}
          <MatchHistory matches={state.matches.filter(m => m.status === "COMPLETED")} />
        </div>
      )}

      {/* ── KNOCKOUT Phase ── */}
      {phase === "KNOCKOUT" && (
        <div className="engine-fade-in">
          {state.liveMatch && (
            <LiveMatchPanel
              match={state.liveMatch}
              timerRemaining={timerRemaining}
              timerDanger={timerDanger}
              timerExpired={timerExpired}
              onScore={(team, type) => scoreEvent(state.liveMatch!.id, team, type)}
              onForceEnd={() => forceEndMatch(state.liveMatch!.id)}
            />
          )}

          {!state.liveMatch && state.nextMatch && (
            <div className="next-match-card engine-fade-in">
              <h4>{state.nextMatch.phase === "FINAL" ? "🏆 FINAL" : "SEMI-FINAL"}</h4>
              <div className="next-match-teams">{state.nextMatch.teamAName} vs {state.nextMatch.teamBName}</div>
              {state.nextMatch.explanation && <p className="match-explanation">{state.nextMatch.explanation}</p>}
              <button className="ctrl-btn primary" onClick={() => startMatch(state.nextMatch!.id)}>
                ▶ Start Match
              </button>
            </div>
          )}

          <KnockoutBracket matches={state.matches} />
          <StandingsTable teams={state.teams} title="Group Stage Final Standings" />
        </div>
      )}

      {/* ── COMPLETED Phase ── */}
      {phase === "COMPLETED" && (
        <div className="engine-fade-in">
          <CompletedView matches={state.matches} teams={state.teams} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// ── Sub-Components ──
// ═══════════════════════════════════════════

function LiveMatchPanel({
  match, timerRemaining, timerDanger, timerExpired,
  onScore, onForceEnd,
}: {
  match: EngineMatch;
  timerRemaining: number;
  timerDanger: boolean;
  timerExpired: boolean;
  onScore: (team: "A" | "B", type: "ball" | "black" | "mistake") => void;
  onForceEnd: () => void;
}) {
  const isSuddenDeath = match.status === "SUDDEN_DEATH" || match.sudden_death === 1;
  const aWinning = match.score_team_a > match.score_team_b;
  const bWinning = match.score_team_b > match.score_team_a;
  const tied = match.score_team_a === match.score_team_b;

  return (
    <div className={`live-match-panel engine-fade-in ${isSuddenDeath ? "sudden-death-mode" : ""}`}>
      <div className="match-label">
        {match.phase === "FINAL" ? "🏆 FINAL" : match.phase === "SEMI" ? "SEMI-FINAL" : "GROUP MATCH"} — LIVE
      </div>
      {match.explanation && <div className="match-explanation">{match.explanation}</div>}

      {/* Timer */}
      <div className="timer-display">
        {isSuddenDeath ? (
          <div className="timer-value sudden-death">⚡ SUDDEN DEATH</div>
        ) : (
          <div className={`timer-value ${timerDanger ? "danger" : ""} ${timerExpired ? "expired" : ""}`}>
            {formatTimeStatic(timerRemaining)}
          </div>
        )}
        <div className="timer-label">
          {isSuddenDeath ? "NEXT POINT WINS" : timerExpired ? "TIME EXPIRED" : "REMAINING"}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="scoreboard">
        <div className="score-side">
          <div className="score-team-name">{match.teamAName}</div>
          <div className={`score-value ${aWinning ? "winning" : bWinning ? "losing" : "tied"}`}>
            {match.score_team_a}
          </div>
        </div>
        <div className="score-divider">
          <div className="score-vs">VS</div>
        </div>
        <div className="score-side">
          <div className="score-team-name">{match.teamBName}</div>
          <div className={`score-value ${bWinning ? "winning" : aWinning ? "losing" : "tied"}`}>
            {match.score_team_b}
          </div>
        </div>
      </div>

      {/* Scoring Buttons */}
      <div className="scoring-grid">
        <div className="scoring-team-col">
          <h4>{match.teamAName}</h4>
          <div className="score-btn-stack">
            <button className="score-btn ball" onClick={() => onScore("A", "ball")}>
              🎱 Ball <span className="score-points">+10</span>
            </button>
            <button className="score-btn black" onClick={() => onScore("A", "black")}>
              ⚫ Black <span className="score-points">+30</span>
            </button>
            <button className="score-btn mistake" onClick={() => onScore("A", "mistake")}>
              ❌ Mistake <span className="score-points">→ +10 to {match.teamBName}</span>
            </button>
          </div>
        </div>
        <div className="scoring-team-col">
          <h4>{match.teamBName}</h4>
          <div className="score-btn-stack">
            <button className="score-btn ball" onClick={() => onScore("B", "ball")}>
              🎱 Ball <span className="score-points">+10</span>
            </button>
            <button className="score-btn black" onClick={() => onScore("B", "black")}>
              ⚫ Black <span className="score-points">+30</span>
            </button>
            <button className="score-btn mistake" onClick={() => onScore("B", "mistake")}>
              ❌ Mistake <span className="score-points">→ +10 to {match.teamAName}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="match-controls">
        <button className="ctrl-btn danger" onClick={onForceEnd}>⏹ Force End Match</button>
      </div>
    </div>
  );
}

function StandingsTable({ teams, title = "Standings" }: { teams: EngineTeam[]; title?: string }) {
  if (teams.length === 0) return null;
  return (
    <div className="standings-panel engine-fade-in">
      <h3>{title}</h3>
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>W</th>
            <th>P</th>
            <th>Score</th>
            <th>BYE</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.id} className={i < 4 ? "highlight-row" : ""}>
              <td className="rank-cell">{i + 1}</td>
              <td className="team-name-cell">{t.name}</td>
              <td className="stat-cell">{t.group_points}</td>
              <td className="stat-cell">{t.matches_played}</td>
              <td className="stat-cell">{t.total_score}</td>
              <td className="stat-cell">{t.bye_assigned ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchHistory({ matches }: { matches: EngineMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="history-panel engine-fade-in">
      <h3>Match History</h3>
      {matches.map(m => (
        <div key={m.id} className="history-item">
          <span className="history-teams">{m.teamAName} vs {m.teamBName}</span>
          <span className="history-score">{m.score_team_a} – {m.score_team_b}</span>
          {m.ended_by && (
            <span className={`history-badge ${m.ended_by === "TIME" ? "time" : m.ended_by === "SUDDEN_DEATH" ? "sd" : "score"}`}>
              {m.ended_by}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function KnockoutBracket({ matches }: { matches: EngineMatch[] }) {
  const semis = matches.filter(m => m.phase === "SEMI");
  const finals = matches.filter(m => m.phase === "FINAL");
  if (semis.length === 0 && finals.length === 0) return null;

  return (
    <div className="knockout-bracket engine-fade-in">
      {semis.length > 0 && (
        <div className="bracket-round">
          <div className="bracket-round-label">Semi-Finals</div>
          <div className="bracket-matches">
            {semis.map(m => <BracketMatchCard key={m.id} match={m} />)}
          </div>
        </div>
      )}
      {finals.length > 0 && (
        <div className="bracket-round">
          <div className="bracket-round-label">🏆 Final</div>
          <div className="bracket-matches">
            {finals.map(m => <BracketMatchCard key={m.id} match={m} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function BracketMatchCard({ match }: { match: EngineMatch }) {
  const isLive = match.status === "LIVE" || match.status === "SUDDEN_DEATH";
  return (
    <div className={`bracket-match-card ${isLive ? "live" : ""} ${match.status === "COMPLETED" ? "completed" : ""}`}>
      <div className={`bracket-team-row ${match.winner_id === match.team_a_id ? "winner" : match.winner_id ? "loser" : ""}`}>
        <span>{match.teamAName}</span>
        <span>{match.score_team_a}</span>
      </div>
      <div className={`bracket-team-row ${match.winner_id === match.team_b_id ? "winner" : match.winner_id ? "loser" : ""}`}>
        <span>{match.teamBName}</span>
        <span>{match.score_team_b}</span>
      </div>
    </div>
  );
}

function CompletedView({ matches, teams }: { matches: EngineMatch[]; teams: EngineTeam[] }) {
  const finalMatch = matches.find(m => m.phase === "FINAL" && m.status === "COMPLETED");
  const championName = finalMatch?.winnerName || teams[0]?.name || "Champion";

  return (
    <>
      <div className="champion-panel">
        <div className="champion-icon">🏆</div>
        <div className="champion-name">{championName}</div>
        <div className="champion-subtitle">Tournament Champion</div>
      </div>
      <KnockoutBracket matches={matches} />
      <StandingsTable teams={teams} title="Final Standings" />
      <MatchHistory matches={matches.filter(m => m.status === "COMPLETED")} />
    </>
  );
}

function formatTimeStatic(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
