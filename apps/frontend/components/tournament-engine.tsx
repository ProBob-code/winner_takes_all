"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { readBackendJson, backendFetch } from "@/lib/backend";
import { BroadcastCode } from "@/components/broadcast-code";
import { LiveFeedViewer } from "@/components/live-feed-viewer";
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
  active_team_id: string | null;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  start_time: number | null;
  duration: number;
  score_team_a: number;
  score_team_b: number;
  winner_id: string | null;
  explanation: string;
  match_order: number;
  ended_by?: 'SCORE' | 'TIME';
}

type Sport = '8BALL' | 'FOOTBALL';

interface TournamentState {
  ok: boolean;
  phase: 'SETUP' | 'GROUP' | 'KNOCKOUT' | 'COMPLETED' | 'open';
  /** Absent on tournaments created before the column existed; those are 8-ball. */
  sport?: Sport;
  teams: Team[];
  matches: Match[];
}

export function TournamentEngine({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName?: string;
}) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [reordering, setReordering] = useState(false);

  // --- Spectators and streaming (opt in) ---
  //
  // A hosted tournament is private until its host says otherwise. Publishing
  // mirrors it into the arena system, which is what Live Screening lists and
  // what cameras attach to; nothing here is visible to anyone until then.

  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showStreamCode, setShowStreamCode] = useState(false);

  // Derived from the tournament so republishing after a reload keeps the same
  // spectator link rather than stranding the old one.
  const arenaId = useMemo(
    () => `T${tournamentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toUpperCase()}`,
    [tournamentId]
  );

  const arenaName = tournamentName?.trim() || "Hosted Tournament";
  const sport: Sport = state?.sport === 'FOOTBALL' ? 'FOOTBALL' : '8BALL';
  const isFootball = sport === 'FOOTBALL';

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

  /**
   * The tournament as the arena system understands it. Live Screening and the
   * streaming endpoints are keyed on arena + match, so a hosted tournament has
   * to present itself in that shape to be spectatable at all.
   */
  const arenaState = useCallback(
    (current: TournamentState, isStarted: boolean) => ({
      isStarted,
      selectedSport: sport,
      teams: current.teams.map((t) => ({ ...t, is_team: false, players: [] })),
      matches: current.matches.map((m) => ({ ...m, sport })),
    }),
    [sport]
  );

  const pushArena = useCallback(
    async (current: TournamentState, isStarted: boolean) => {
      const res = await backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify({ id: arenaId, name: arenaName, state: arenaState(current, isStarted) }),
      });
      if (!res.ok) {
        let message = `The server returned HTTP ${res.status}.`;
        try {
          const body: any = await res.json();
          if (body?.message) message = body.message;
        } catch {
          /* non-JSON error */
        }
        throw new Error(message);
      }
    },
    [arenaId, arenaName, arenaState]
  );

  // Reflect whether this tournament is already being spectated, so the control
  // reads correctly after a reload rather than defaulting to unpublished.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetch(`/public-arenas/${arenaId}`);
        if (!res.ok || cancelled) return;
        const data: any = await res.json();
        if (!cancelled && data?.ok) setPublished(!!data.arena?.state?.isStarted);
      } catch {
        /* not published */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [arenaId]);

  const publishToSpectators = useCallback(async () => {
    if (!state) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await pushArena(state, true);
      setPublished(true);
    } catch (err: any) {
      setPublishError(err?.message || "Could not publish to spectators.");
    } finally {
      setPublishing(false);
    }
  }, [state, pushArena]);

  const stopSpectating = useCallback(async () => {
    if (!state) return;
    setPublishing(true);
    setPublishError(null);
    try {
      // Clearing isStarted removes it from Live Screening and stops every
      // camera attached to it, the same way closing a quick tournament does.
      await pushArena(state, false);
      setPublished(false);
      setShowStreamCode(false);
    } catch (err: any) {
      setPublishError(err?.message || "Could not stop spectating.");
    } finally {
      setPublishing(false);
    }
  }, [state, pushArena]);

  // Keep spectators current while published, at a fixed cadence rather than on
  // every score change, so a busy match does not become a request per tap.
  const lastPushRef = useRef(0);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!published || !state) return;
    if (pushTimerRef.current) return;

    const wait = Math.max(0, 5000 - (Date.now() - lastPushRef.current));
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      lastPushRef.current = Date.now();
      pushArena(state, true).catch(() => {
        setPublishError("Spectators are not receiving updates.");
      });
    }, wait);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [published, state, pushArena]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000); 
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

  const updateScore = async (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'MISTAKE' | 'GOAL') => {
    await backendFetch(`/engine/matches/${matchId}/score`, {
      method: "POST",
      body: JSON.stringify({ teamId, type })
    });
    fetchState();
  };

  const highlightTeam = async (matchId: string, teamId: string) => {
    await backendFetch(`/engine/matches/${matchId}/highlight`, {
      method: "POST",
      body: JSON.stringify({ teamId })
    });
    fetchState();
  };

  const reorderMatch = async (matchId: string, direction: 'up' | 'down') => {
    if (!state) return;
    setReordering(true);
    const createdMatches = state.matches.filter(m => m.status === 'CREATED');
    const idx = createdMatches.findIndex(m => m.id === matchId);
    if (idx === -1) return;

    const newMatches = [...createdMatches];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newMatches.length) return;

    [newMatches[idx], newMatches[targetIdx]] = [newMatches[targetIdx], newMatches[idx]];
    
    await backendFetch(`/engine/tournaments/${tournamentId}/reorder`, {
      method: "POST",
      body: JSON.stringify({ matchIds: newMatches.map(m => m.id) })
    });
    fetchState();
    setReordering(false);
  };

  if (loading) return <div className="loading-state">Stadium Arena Initializing...</div>;
  if (!state) return <div className="error-state">Tournament not found</div>;

  const liveMatch = state.matches.find(m => m.status === 'LIVE');
  const createdMatches = state.matches.filter(m => m.status === 'CREATED');
  const lastCompletedMatch = [...state.matches].reverse().find(m => m.status === 'COMPLETED');
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getTeamName = (id: string) => state.teams.find(t => t.id === id)?.name || "Unknown Team";

  // Ticker Component
  const Ticker = ({ balls, black, color }: { balls: number, black: boolean, color: string }) => (
    <div className="ticker-row">
      {[...Array(7)].map((_, i) => (
        <div key={i} className={`ball-slot ${i < balls ? 'filled' : ''}`} style={{ '--accent-primary': color } as any}>
          {i + 1}
        </div>
      ))}
      <div className={`ball-slot black ${black ? 'filled' : ''}`}>8</div>
    </div>
  );

  return (
    <div className="engine-container animate-in">
      <div className="engine-header">
        <div>
          <h1 className="glow-text">Stadium Arena Manager</h1>
          <p className="muted">
            {isFootball ? '⚽ Football' : '🎱 8-Ball'} · Host Perspective &amp; Real-time Scoring
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Private until the host chooses otherwise. */}
          {state.phase !== "open" && state.phase !== "SETUP" && (
            <button
              className={published ? "close-tournament-trigger" : "share-btn"}
              onClick={published ? stopSpectating : publishToSpectators}
              disabled={publishing}
              title={
                published
                  ? "Remove from Live Screening and stop all cameras"
                  : "Let people watch this tournament and add cameras"
              }
            >
              {publishing
                ? "WORKING…"
                : published
                  ? "STOP SPECTATING"
                  : "PUBLISH TO SPECTATORS"}
            </button>
          )}
          <div className="phase-badge">{state.phase.toUpperCase()}</div>
        </div>
      </div>

      {publishError && (
        <p style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: "8px" }}>{publishError}</p>
      )}

      {published && (
        <p className="muted" style={{ fontSize: "0.78rem", marginTop: "8px" }}>
          📺 Live on the spectator network — anyone can watch, and cameras can be added.
        </p>
      )}

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
        <>
          <div className="center-stage slide-in">
            {liveMatch ? (
              <>
                <div className="match-status-indicator">
                  <div className="live-dot"></div>
                  LIVE MATCH • {formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}
                </div>

                {published && (
                  <div style={{ width: "100%", margin: "0 0 1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                      <button
                        className="button button-secondary button-sm"
                        style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                        onClick={() => setShowStreamCode(!showStreamCode)}
                      >
                        📷 {showStreamCode ? "HIDE CODE" : "STREAM THIS MATCH"}
                      </button>
                    </div>

                    {showStreamCode && (
                      <div
                        style={{
                          marginBottom: "16px",
                          padding: "20px",
                          borderRadius: "12px",
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <BroadcastCode
                          arenaId={arenaId}
                          matchId={liveMatch.id}
                          onClose={() => setShowStreamCode(false)}
                        />
                      </div>
                    )}

                    <LiveFeedViewer arenaId={arenaId} matchId={liveMatch.id} isLive={true} />
                  </div>
                )}

                <div className="score-arena" style={{ width: '100%', gap: '2rem' }}>
                  {/* RED TEAM */}
                  <div 
                    className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`}
                    onClick={() => highlightTeam(liveMatch.id, liveMatch.team_a_id)}
                  >
                    {liveMatch.active_team_id === liveMatch.team_a_id && <div className="active-badge">Active Turn</div>}
                    <div className="pod-name" style={{ color: '#ef4444' }}>{getTeamName(liveMatch.team_a_id)}</div>
                    <div className="pod-score">{liveMatch.score_team_a}</div>
                    {!isFootball && (
                      <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                    )}
                    
                    {isFootball ? (
                      <div className="control-grid" style={{ marginTop: '2rem' }}>
                        <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'GOAL') }}>
                          <span>⚽ GOAL</span>
                          <span className="points">+1</span>
                        </button>
                      </div>
                    ) : (
                    <div className="control-grid" style={{ marginTop: '2rem' }}>
                      <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>
                        <span>🎱 BALL</span>
                        <span className="points">+10</span>
                      </button>
                      <button className="score-btn black" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>
                        <span>⚫ BLACK</span>
                        <span className="points">+30</span>
                      </button>
                      <button className="score-btn mistake" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'MISTAKE') }}>
                        <span>❌ ERROR</span>
                        <span className="points">P2 +10</span>
                      </button>
                    </div>
                    )}
                  </div>

                  <div className="vs-orb">VS</div>

                  {/* BLUE TEAM */}
                  <div 
                    className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`}
                    onClick={() => highlightTeam(liveMatch.id, liveMatch.team_b_id)}
                  >
                    {liveMatch.active_team_id === liveMatch.team_b_id && <div className="active-badge">Active Turn</div>}
                    <div className="pod-name" style={{ color: '#3b82f6' }}>{getTeamName(liveMatch.team_b_id)}</div>
                    <div className="pod-score">{liveMatch.score_team_b}</div>
                    {!isFootball && (
                      <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                    )}
                    
                    {isFootball ? (
                      <div className="control-grid" style={{ marginTop: '2rem' }}>
                        <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'GOAL') }}>
                          <span>⚽ GOAL</span>
                          <span className="points">+1</span>
                        </button>
                      </div>
                    ) : (
                    <div className="control-grid" style={{ marginTop: '2rem' }}>
                      <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>
                        <span>🎱 BALL</span>
                        <span className="points">+10</span>
                      </button>
                      <button className="score-btn black" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>
                        <span>⚫ BLACK</span>
                        <span className="points">+30</span>
                      </button>
                      <button className="score-btn mistake" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'MISTAKE') }}>
                        <span>❌ ERROR</span>
                        <span className="points">P1 +10</span>
                      </button>
                    </div>
                    )}
                  </div>
                </div>

                <div className="explanation-banner" style={{ marginTop: '2rem', width: '100%' }}>
                  <span>💡 {liveMatch.explanation}</span>
                </div>
              </>
            ) : lastCompletedMatch && (
              <div className="results-overlay">
                <div className="winner-announcement">Match Complete</div>
                <div className="winner-name">{getTeamName(lastCompletedMatch.winner_id!)} WINS!</div>
                <div className="final-score-row">
                  <div className="final-score-item">
                    <span className="f-score">{lastCompletedMatch.score_team_a}</span>
                    <span className="f-name">{getTeamName(lastCompletedMatch.team_a_id)}</span>
                  </div>
                  <div className="f-score" style={{ opacity: 0.2 }}>-</div>
                  <div className="final-score-item">
                    <span className="f-score">{lastCompletedMatch.score_team_b}</span>
                    <span className="f-name">{getTeamName(lastCompletedMatch.team_b_id)}</span>
                  </div>
                </div>
                <div className="muted" style={{ marginBottom: '2rem' }}>
                  Ended by {lastCompletedMatch.ended_by || 'Unknown'}
                </div>
                {createdMatches.length > 0 ? (
                  <button className="button button-primary" onClick={() => startMatch(createdMatches[0].id)}>
                    PROCEED TO NEXT MATCH
                  </button>
                ) : (
                  <button className="button button-secondary" onClick={generateMatches}>
                    GENERATE NEXT ROUND
                  </button>
                )}
              </div>
            )}
          </div>

          {/* QUEUE SYSTEM */}
          <div className="match-queue-section slide-in">
            <div className="queue-header">
              <h3>Upcoming Queue ({createdMatches.length})</h3>
              <p className="muted">Match creator can rearrange the order.</p>
            </div>
            <div className="queue-grid">
              {createdMatches.map((m, i) => (
                <div key={m.id} className="queue-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <span className="rank-cell">#{i + 1}</span>
                    <div style={{ fontWeight: 700 }}>
                      {getTeamName(m.team_a_id)} <span style={{ opacity: 0.3 }}>VS</span> {getTeamName(m.team_b_id)}
                    </div>
                  </div>
                  <div className="queue-controls">
                    <button className="q-btn" onClick={() => reorderMatch(m.id, 'up')} disabled={i === 0 || reordering}>↑</button>
                    <button className="q-btn" onClick={() => reorderMatch(m.id, 'down')} disabled={i === createdMatches.length - 1 || reordering}>↓</button>
                    {i === 0 && !liveMatch && (
                      <button className="button button-primary button-sm" style={{ marginLeft: '1rem' }} onClick={() => startMatch(m.id)}>
                        START NOW
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {createdMatches.length === 0 && !liveMatch && (
                <div className="panel page-card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <p className="muted">Queue empty. Ready for the next phase?</p>
                  <button className="button button-secondary" onClick={generateMatches}>GENERATE MATCHES</button>
                </div>
              )}
            </div>
          </div>

          {/* STANDINGS */}
          <div className="standings-card" style={{ marginTop: "4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3>Current Standings</h3>
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
        </>
      )}
    </div>
  );
}
