"use client";

import { useState, useEffect, useCallback } from "react";
import { readBackendJson, backendFetch } from "@/lib/backend";
import "./tournament-engine.css";

interface Team {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  bye_assigned: boolean;
}

interface Match {
  id: string;
  phase: string;
  team_a_id: string;
  team_b_id: string;
  status: 'CREATED' | 'LIVE' | 'COMPLETED';
  sudden_death: boolean;
  start_time: number | null;
  duration: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  explanation: string;
}

interface TournamentState {
  ok: boolean;
  phase: 'SETUP' | 'GROUP' | 'KNOCKOUT' | 'COMPLETED' | 'open';
  teams: Team[];
  matches: Match[];
}

export function TournamentEngine({ tournamentId }: { tournamentId: string }) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  const fetchState = useCallback(async () => {
    try {
      const { payload } = await readBackendJson<TournamentState>(`/engine/tournaments/${tournamentId}/state`);
      if (payload.ok) {
        setState(payload);
      }
    } catch (err) {
      console.error("Failed to fetch tournament state", err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000); // Poll every 3s
    const timeInterval = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, [fetchState]);

  const addTeam = async () => {
    if (!newTeamName) return;
    const { payload } = await readBackendJson<any>(`/engine/tournaments/${tournamentId}/add-team`, {
      method: "POST",
      body: JSON.stringify({ name: newTeamName })
    });
    if (payload.ok) {
      setNewTeamName("");
      fetchState();
    }
  };

  const startTournament = async () => {
    await backendFetch(`/engine/tournaments/${tournamentId}/start`, { method: "POST" });
    fetchState();
  };

  const generateMatches = async () => {
    await backendFetch(`/engine/tournaments/${tournamentId}/generate`, { method: "POST" });
    fetchState();
  };

  const startMatch = async (matchId: string) => {
    await backendFetch(`/engine/matches/${matchId}/start`, { method: "POST" });
    fetchState();
  };

  const updateScore = async (matchId: string, teamId: string, points: number) => {
    await backendFetch(`/engine/matches/${matchId}/score`, {
      method: "POST",
      body: JSON.stringify({ teamId, points })
    });
    fetchState();
  };

  if (loading) return <div className="loading-state">Initializing Engine...</div>;
  if (!state) return <div className="error-state">Tournament not found</div>;

  const liveMatch = state.matches.find(m => m.status === 'LIVE');
  const nextMatch = state.matches.find(m => m.status === 'CREATED');
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getTeamName = (id: string) => state.teams.find(t => t.id === id)?.name || "Unknown Team";

  return (
    <div className="engine-container animate-in">
      <div className="engine-header">
        <div>
          <h1 className="glow-text">Tournament Hub</h1>
          <p className="muted">Deterministic State Engine v2.0</p>
        </div>
        <div className="phase-badge">{state.phase.toUpperCase()}</div>
      </div>

      {state.phase === 'open' || state.phase === 'SETUP' ? (
        <div className="setup-view slide-in">
          <div className="standings-card">
            <h3>Registered Teams ({state.teams.length})</h3>
            <div className="team-input-row" style={{ margin: "1.5rem 0" }}>
              <input 
                placeholder="Enter team name..." 
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
              />
              <button className="button button-primary" onClick={addTeam}>ADD TEAM</button>
            </div>
            <ul className="list">
              {state.teams.map(t => (
                <li key={t.id} className="list-item">
                  <span className="value">{t.name}</span>
                  <span className="label">READY</span>
                </li>
              ))}
            </ul>
            {state.teams.length >= 2 && (
              <button className="button button-secondary" style={{ marginTop: "2rem", width: "100%" }} onClick={startTournament}>
                START TOURNAMENT
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="live-view slide-in">
          {liveMatch ? (
            <div className="live-match-card">
              <div className="match-status-indicator">
                <div className="live-dot"></div>
                LIVE MATCH
              </div>

              {liveMatch.sudden_death && (
                <div className="sudden-death-overlay">
                  <div className="sd-title">SUDDEN DEATH</div>
                  <div className="sd-subtitle">Next point wins immediately!</div>
                </div>
              )}

              <div className="timer-area">
                <div className={`timer-display ${((liveMatch.start_time || 0) + liveMatch.duration - currentTime) < 60 ? 'danger' : ''}`}>
                  {formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}
                </div>
              </div>

              <div className="score-arena">
                <div className="team-score-pod">
                  <div className="pod-name">{getTeamName(liveMatch.team_a_id)}</div>
                  <div className="pod-score">{liveMatch.score_team_a}</div>
                  <div className="control-grid">
                    <button className="score-btn ball" onClick={() => updateScore(liveMatch.id, liveMatch.team_a_id, 10)}>
                      <span>🎱 BALL</span>
                      <span className="points">+10</span>
                    </button>
                    <button className="score-btn black" onClick={() => updateScore(liveMatch.id, liveMatch.team_a_id, 30)}>
                      <span>⚫ BLACK</span>
                      <span className="points">+30</span>
                    </button>
                    <button className="score-btn mistake" onClick={() => updateScore(liveMatch.id, liveMatch.team_b_id, 10)}>
                      <span>❌ ERROR</span>
                      <span className="points">P2 +10</span>
                    </button>
                  </div>
                </div>

                <div className="vs-orb">VS</div>

                <div className="team-score-pod">
                  <div className="pod-name">{getTeamName(liveMatch.team_b_id)}</div>
                  <div className="pod-score">{liveMatch.score_team_b}</div>
                  <div className="control-grid">
                    <button className="score-btn ball" onClick={() => updateScore(liveMatch.id, liveMatch.team_b_id, 10)}>
                      <span>🎱 BALL</span>
                      <span className="points">+10</span>
                    </button>
                    <button className="score-btn black" onClick={() => updateScore(liveMatch.id, liveMatch.team_b_id, 30)}>
                      <span>⚫ BLACK</span>
                      <span className="points">+30</span>
                    </button>
                    <button className="score-btn mistake" onClick={() => updateScore(liveMatch.id, liveMatch.team_a_id, 10)}>
                      <span>❌ ERROR</span>
                      <span className="points">P1 +10</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="explanation-banner">
                <span className="icon">💡</span>
                <span>{liveMatch.explanation}</span>
              </div>
            </div>
          ) : (
            <div className="standby-arena">
              {nextMatch ? (
                <div className="panel page-card" style={{ textAlign: "center" }}>
                  <h3>Next Match Ready</h3>
                  <div className="muted" style={{ margin: "1rem 0" }}>
                    {getTeamName(nextMatch.team_a_id)} vs {getTeamName(nextMatch.team_b_id)}
                  </div>
                  <button className="button button-primary" onClick={() => startMatch(nextMatch.id)}>
                    LAUNCH MATCH
                  </button>
                </div>
              ) : (
                <div className="panel page-card" style={{ textAlign: "center" }}>
                  <h3>Standings Refreshed</h3>
                  <p className="muted">All matches for this round are complete.</p>
                  <button className="button button-primary" onClick={generateMatches}>
                    GENERATE NEXT MATCHES
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="standings-card" style={{ marginTop: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3>Standings</h3>
              <button className="button-secondary button-sm" onClick={() => fetchState()}>REFRESH</button>
            </div>
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {state.teams.sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
                  <tr key={t.id}>
                    <td className="rank-cell">#{i + 1}</td>
                    <td className="team-name-cell">
                      {t.name}
                      {t.bye_assigned && <span className="status-badge" style={{ marginLeft: "10px", fontSize: "0.6rem" }}>BYE RECEIVED</span>}
                    </td>
                    <td className="stat-cell">{t.matches_played}</td>
                    <td className="stat-cell">{t.group_points}</td>
                    <td className="stat-cell">{t.total_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {state.phase === 'GROUP' && (
            <div className="panel page-card" style={{ marginTop: "2rem" }}>
              <h4>Admin: Mid-Tournament Addition</h4>
              <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
                Allowed only if no match is LIVE. New teams start with 0 matches.
              </p>
              <div className="team-input-row">
                <input 
                  placeholder="New team name..." 
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  disabled={!!liveMatch}
                />
                <button className="button button-secondary" onClick={addTeam} disabled={!!liveMatch}>
                  ADD MID-TOURNAMENT
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
