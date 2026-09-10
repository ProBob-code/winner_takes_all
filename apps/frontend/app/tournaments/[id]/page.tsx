"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { readBackendJson, backendFetch } from "@/lib/backend";
import { formatMoney } from "@/lib/format";
import { BracketView } from "@/components/bracket-view";
import { JoinTournamentButton } from "@/components/join-tournament-button";
import { ShareTournament } from "@/components/share-tournament";
import { DeleteTournamentDialog } from "@/components/delete-tournament-dialog";
import "@/components/tournament-engine.css";

// --- Types ---

interface EngineTeam {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  bye_assigned: boolean;
}

interface EngineMatch {
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

interface TournamentState {
  ok: boolean;
  phase: string;
  teams: EngineTeam[];
  matches: EngineMatch[];
}

// --- Sub-components ---

function Ticker({ balls, black, color }: { balls: number, black: boolean, color: string }) {
  return (
    <div className="ticker-row">
      {[...Array(7)].map((_, i) => (
        <div key={i} className={`ball-slot ${i < balls ? 'filled' : ''}`} style={{ '--accent-primary': color } as any}>
          {i + 1}
        </div>
      ))}
      <div className={`ball-slot black ${black ? 'filled' : ''}`}>8</div>
    </div>
  );
}

// --- Main Page ---

export default function TournamentDetailPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [showArena, setShowArena] = useState(false);
  const [engineState, setEngineState] = useState<TournamentState | null>(null);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [newTeamName, setNewTeamName] = useState("");
  const [reordering, setReordering] = useState(false);

  const routeParams = useParams<{ id: string }>();
  const routeId = routeParams?.id;

  const fetchTournamentData = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      // Read the id from the route rather than by slicing the pathname: the
      // page used to live at /tournaments/view, where that slice produced
      // "view" and the page bailed, which is why every tournament link 404'd.
      const id = routeId;
      if (!id) return;

      const responses = await Promise.allSettled([
        readBackendJson<any>(`/tournaments/${id}`),
        readBackendJson<any>(`/tournaments/${id}/bracket`),
        readBackendJson<any>(`/tournaments/${id}/participants`),
        readBackendJson<any>("/user/profile"),
        readBackendJson<TournamentState>(`/engine/tournaments/${id}/state`),
      ]);
      
      setData({ responses, id });
      if (responses[4].status === "fulfilled") {
        setEngineState(responses[4].value.payload);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    fetchTournamentData();
    const interval = setInterval(fetchTournamentData, 3000);
    const timeInterval = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, [fetchTournamentData]);

  if (loading && !data) return <div className="page"><div className="shell">Loading...</div></div>;
  if (error) return <div className="page"><div className="shell">Error loading tournament</div></div>;
  
  const { responses, id } = data;
  const tournamentRes = responses[0];
  if (tournamentRes.status === "rejected") throw tournamentRes.reason;
  
  const tournament = tournamentRes.value.payload.tournament;
  if (!tournament) return <div className="page"><div className="shell">Not Found</div></div>;

  const profileData = responses[3].status === "fulfilled" ? responses[3].value.payload : null;
  const isHost = profileData?.ok && profileData?.user?.id === tournament.tournamentHostId;

  // Engine Actions
  const addTeam = async () => {
    if (!newTeamName) return;
    await backendFetch(`/engine/tournaments/${id}/add-team`, { method: "POST", body: JSON.stringify({ name: newTeamName }) });
    setNewTeamName("");
    fetchTournamentData();
  };

  const updateScore = async (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'MISTAKE') => {
    await backendFetch(`/engine/matches/${matchId}/score`, { method: "POST", body: JSON.stringify({ teamId, type }) });
    fetchTournamentData();
  };

  const highlightTeam = async (matchId: string, teamId: string) => {
    await backendFetch(`/engine/matches/${matchId}/highlight`, { method: "POST", body: JSON.stringify({ teamId }) });
    fetchTournamentData();
  };

  const startMatch = async (matchId: string) => {
    await backendFetch(`/engine/matches/${matchId}/start`, { method: "POST" });
    fetchTournamentData();
  };

  const addExtraTime = async (matchId: string) => {
    await backendFetch(`/engine/matches/${matchId}/extra-time`, { method: "POST" });
    fetchTournamentData();
  };

  const generateMatches = async () => {
    await backendFetch(`/engine/tournaments/${id}/generate`, { method: "POST" });
    fetchTournamentData();
  };

  const reorderMatch = async (matchId: string, direction: 'up' | 'down') => {
    if (!engineState) return;
    setReordering(true);
    const created = engineState.matches.filter(m => m.status === 'CREATED');
    const idx = created.findIndex(m => m.id === matchId);
    if (idx === -1) return;

    const newList = [...created];
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= newList.length) return;

    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    await backendFetch(`/engine/tournaments/${id}/reorder`, { method: "POST", body: JSON.stringify({ matchIds: newList.map(m => m.id) }) });
    fetchTournamentData();
    setReordering(false);
  };

  // Helper
  const getTeamName = (teamId: string) => engineState?.teams.find(t => t.id === teamId)?.name || (teamId === 'BYE' ? 'BYE' : "Unknown");
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const liveMatch = engineState?.matches.find(m => m.status === 'LIVE');
  const createdMatches = engineState?.matches.filter(m => m.status === 'CREATED') || [];

  return (
    <main className="page">
      <div className="shell">
        
        {/* LIVE ARENA BANNER (Everyone) */}
        {liveMatch && (
          <div className="panel page-card animate-in" style={{ border: '1px solid var(--accent-primary)', background: 'rgba(139, 92, 246, 0.05)', marginBottom: '1.5rem', padding: '2rem' }}>
            <div className="match-status-indicator" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <div className="live-dot"></div>
              <span style={{ fontWeight: 900, letterSpacing: '2px' }}>LIVE MATCH</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span style={{ fontWeight: 900, color: 'var(--gold)' }}>{formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3rem' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444', marginBottom: '0.5rem' }}>{getTeamName(liveMatch.team_a_id)}</div>
                <div style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1 }}>{liveMatch.score_team_a}</div>
                <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
              </div>
              <div className="vs-orb" style={{ width: '80px', height: '80px', fontSize: '1.2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>VS</div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#3b82f6', marginBottom: '0.5rem' }}>{getTeamName(liveMatch.team_b_id)}</div>
                <div style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1 }}>{liveMatch.score_team_b}</div>
                <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
              </div>
            </div>
          </div>
        )}

        {/* Tournament Header */}
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "2rem", fontWeight: 900 }}>{tournament.name}</h2>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: '0.5rem' }}>
                <span className={`status-badge ${tournament.status}`}>{tournament.status.toUpperCase()}</span>
                {tournament.isPrivate && <span className="status-badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>PRIVATE</span>}
              </div>
            </div>
            <div className="tournament-meta" style={{ display: 'flex', gap: '1.5rem' }}>
              <div style={{ textAlign: 'right' }}><div className="label" style={{ fontSize: '0.6rem', opacity: 0.5 }}>FEE</div><div style={{ fontWeight: 900 }}>₹{tournament.entryFee.amount}</div></div>
              <div style={{ textAlign: 'right' }}><div className="label" style={{ fontSize: '0.6rem', opacity: 0.5 }}>REWARDS</div><div style={{ fontWeight: 900, color: 'var(--gold)' }}>₹{tournament.prizePool.amount}</div></div>
              <div style={{ textAlign: 'right' }}><div className="label" style={{ fontSize: '0.6rem', opacity: 0.5 }}>PLAYERS</div><div style={{ fontWeight: 900 }}>{tournament.joinedPlayers}/{tournament.maxPlayers}</div></div>
            </div>
          </div>

          <div className="cta-row" style={{ marginTop: "2rem", display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <JoinTournamentButton tournamentId={id} isPrivate={tournament.isPrivate} />
              <ShareTournament tournamentId={id} tournamentName={tournament.name} />
            </div>
            {isHost && (
              <button onClick={() => setShowArena(!showArena)} className={`button ${showArena ? 'button-primary' : 'button-gold'}`} style={{ minWidth: '200px' }}>
                🏟️ {showArena ? 'CLOSE MANAGER' : 'MANAGE ARENA'}
              </button>
            )}
          </div>
        </div>

        {/* ARENA MANAGER (Host Only) */}
        {showArena && isHost && engineState && (
          <div className="engine-container animate-in" style={{ marginBottom: '3rem' }}>
            <div className="center-stage" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {liveMatch ? (
                <>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 className="glow-text">LIVE SCORING</h3>
                    <button className="button button-secondary button-sm" onClick={() => addExtraTime(liveMatch.id)}>+1 MIN EXTRA TIME</button>
                  </div>
                  <div className="score-arena" style={{ width: '100%', gap: '2rem' }}>
                    <div 
                      className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} 
                      onClick={() => highlightTeam(liveMatch.id, liveMatch.team_a_id)}
                    >
                      {liveMatch.active_team_id === liveMatch.team_a_id && <div className="active-badge">AT TABLE</div>}
                      <div className="pod-score">{liveMatch.score_team_a}</div>
                      <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                      <div className="control-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', width: '100%', marginTop: '1.5rem' }}>
                        <button className="score-btn" style={{ background: '#ef4444' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>BALL</button>
                        <button className="score-btn" style={{ background: '#111', border: '1px solid #fff' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>BLACK</button>
                      </div>
                    </div>
                    
                    <div 
                      className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} 
                      onClick={() => highlightTeam(liveMatch.id, liveMatch.team_b_id)}
                    >
                      {liveMatch.active_team_id === liveMatch.team_b_id && <div className="active-badge">AT TABLE</div>}
                      <div className="pod-score">{liveMatch.score_team_b}</div>
                      <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                      <div className="control-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', width: '100%', marginTop: '1.5rem' }}>
                        <button className="score-btn" style={{ background: '#3b82f6' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>BALL</button>
                        <button className="score-btn" style={{ background: '#111', border: '1px solid #fff' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>BLACK</button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <h3 className="glow-text">ARENA IDLE</h3>
                  {createdMatches.length > 0 ? (
                    <div style={{ marginTop: '1.5rem' }}>
                      <p className="muted">Next: {getTeamName(createdMatches[0].team_a_id)} vs {getTeamName(createdMatches[0].team_b_id)}</p>
                      <button className="button button-gold mt-4" onClick={() => startMatch(createdMatches[0].id)}>START NEXT MATCH</button>
                    </div>
                  ) : (
                    <button className="button button-secondary mt-4" onClick={generateMatches}>GENERATE NEXT ROUND</button>
                  )}
                </div>
              )}
            </div>

            {/* Match Queue Management */}
            <div className="match-queue-section" style={{ marginTop: '2rem' }}>
              <h3 className="section-label">UPCOMING QUEUE ({createdMatches.length})</h3>
              <div className="queue-grid">
                {createdMatches.map((m, i) => (
                  <div key={m.id} className="queue-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ opacity: 0.3, fontWeight: 900 }}>#{i+1}</span>
                      <span style={{ fontWeight: 700 }}>{getTeamName(m.team_a_id)} vs {getTeamName(m.team_b_id)}</span>
                    </div>
                    <div className="queue-controls">
                      <button className="q-btn" onClick={() => reorderMatch(m.id, 'up')} disabled={i === 0 || reordering}>↑</button>
                      <button className="q-btn" onClick={() => reorderMatch(m.id, 'down')} disabled={i === createdMatches.length - 1 || reordering}>↓</button>
                      {i === 0 && !liveMatch && <button className="button button-primary button-sm" style={{ marginLeft: '1rem' }} onClick={() => startMatch(m.id)}>START</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {engineState.phase === 'SETUP' && engineState.matches.length === 0 && (
              <div className="standings-card" style={{ marginTop: '2rem', padding: '2rem' }}>
                <h3 className="section-label">ROSTER SETUP</h3>
                <div className="team-input-row" style={{ marginTop: '1rem' }}>
                  <input placeholder="Add team name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTeam()} />
                  <button className="button button-primary" onClick={addTeam}>ADD</button>
                </div>
                {engineState.teams.length >= 2 && <button className="button button-gold mt-4" style={{ width: '100%' }} onClick={generateMatches}>GENERATE MATCHES</button>}
              </div>
            )}
          </div>
        )}

        {/* Existing Tournament Sections */}
        <div className="panel page-card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: '1rem', letterSpacing: '1px', opacity: 0.7, marginBottom: '1.5rem' }}>🏆 LEADERBOARD</h2>
          <table className="leaderboard-table">
            <thead><tr><th>RANK</th><th>TEAM / PLAYER</th><th>PLAYED</th><th>WINS</th><th>SCORE</th></tr></thead>
            <tbody>
              {(engineState?.teams || []).sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
                <tr key={t.id}>
                  <td style={{ padding: '1rem' }}>#{i+1}</td>
                  <td style={{ fontWeight: 900 }}>{t.name}</td>
                  <td>{t.matches_played}</td>
                  <td style={{ color: 'var(--accent-primary)' }}>{t.group_points}</td>
                  <td style={{ fontWeight: 900, color: 'var(--gold)' }}>{t.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* RESET BUTTON (Host Only) */}
        {isHost && (
          <div style={{ marginTop: '4rem', textAlign: 'center' }}>
            <DeleteTournamentDialog tournamentId={id} tournamentName={tournament.name} />
          </div>
        )}
      </div>
    </main>
  );
}
