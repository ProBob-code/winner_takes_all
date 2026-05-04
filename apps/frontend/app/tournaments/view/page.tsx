"use client";
import { useEffect, useState, useCallback } from "react";
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

  const fetchTournamentData = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      const pathParts = window.location.pathname.split("/");
      const id = pathParts[pathParts.length - 1];
      if (!id || id === "view") return;

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
  }, []);

  useEffect(() => {
    fetchTournamentData();
    const interval = setInterval(fetchTournamentData, 5000);
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

  const bracketData = responses[1].status === "fulfilled" ? responses[1].value.payload : { rounds: [] };
  const participantData = responses[2].status === "fulfilled" ? responses[2].value.payload : { participants: [] };
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

  const startTournament = async () => {
    await backendFetch(`/engine/tournaments/${id}/start`, { method: "POST" });
    fetchTournamentData();
  };

  const generateMatches = async () => {
    await backendFetch(`/engine/tournaments/${id}/generate`, { method: "POST" });
    fetchTournamentData();
  };

  // Helper
  const getTeamName = (teamId: string) => engineState?.teams.find(t => t.id === teamId)?.name || "Unknown";
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const liveMatch = engineState?.matches.find(m => m.status === 'LIVE');

  return (
    <main className="page">
      <div className="shell">
        
        {/* LIVE ARENA BANNER (Visible to all if match is live) */}
        {liveMatch && (
          <div className="panel page-card animate-in" style={{ border: '1px solid var(--accent-primary)', background: 'rgba(139, 92, 246, 0.05)', marginBottom: '1.5rem' }}>
            <div className="match-status-indicator" style={{ marginBottom: '1rem' }}>
              <div className="live-dot"></div>
              LIVE MATCH • {formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
              <div style={{ textAlign: 'right', flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>{getTeamName(liveMatch.team_a_id)}</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>{liveMatch.score_team_a}</div>
                <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
              </div>
              <div className="vs-orb" style={{ width: '40px', height: '40px', fontSize: '0.8rem' }}>VS</div>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#3b82f6' }}>{getTeamName(liveMatch.team_b_id)}</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>{liveMatch.score_team_b}</div>
                <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '1.5rem', opacity: 0.6, fontSize: '0.8rem' }}>
              💡 {liveMatch.explanation}
            </div>
          </div>
        )}

        {/* Tournament Info */}
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "1.5rem" }}>{tournament.name}</h2>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span className={`tournament-status status-${tournament.status}`}>{tournament.status.replace("_", " ")}</span>
                {tournament.isPrivate && <span className="status-badge" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>🔒 PRIVATE</span>}
              </div>
            </div>
            <div className="tournament-meta">
              <div className="tournament-meta-item">💰 ₹{tournament.entryFee.amount}</div>
              <div className="tournament-meta-item">🏆 ₹{tournament.prizePool.amount}</div>
              <div className="tournament-meta-item">👥 {tournament.joinedPlayers}/{tournament.maxPlayers}</div>
            </div>
          </div>

          <div className="cta-row" style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem", flex: 1 }}>
              <JoinTournamentButton tournamentId={id} isPrivate={tournament.isPrivate} />
              <ShareTournament tournamentId={id} tournamentName={tournament.name} />
            </div>
            {isHost && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => setShowArena(!showArena)} className={`button ${showArena ? 'button-primary' : 'button-secondary'}`}>
                  🏟️ {showArena ? 'CLOSE ARENA' : 'OPEN ARENA MANAGER'}
                </button>
                <DeleteTournamentDialog tournamentId={id} tournamentName={tournament.name} />
              </div>
            )}
          </div>
        </div>

        {/* ARENA MANAGER (Host Only) */}
        {showArena && isHost && engineState && (
          <div className="engine-container animate-in" style={{ marginBottom: '3rem' }}>
            <div className="center-stage">
              {liveMatch ? (
                <div className="score-arena" style={{ width: '100%', gap: '2rem' }}>
                  <div className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} onClick={() => highlightTeam(liveMatch.id, liveMatch.team_a_id)}>
                    <div className="pod-score">{liveMatch.score_team_a}</div>
                    <div className="control-grid">
                      <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>BALL +10</button>
                      <button className="score-btn black" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>BLACK +30</button>
                      <button className="score-btn mistake" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'MISTAKE') }}>FOUL</button>
                    </div>
                  </div>
                  <div className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} onClick={() => highlightTeam(liveMatch.id, liveMatch.team_b_id)}>
                    <div className="pod-score">{liveMatch.score_team_b}</div>
                    <div className="control-grid">
                      <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>BALL +10</button>
                      <button className="score-btn black" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>BLACK +30</button>
                      <button className="score-btn mistake" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'MISTAKE') }}>FOUL</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <h3 className="glow-text">Ready for Next Match</h3>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                    {engineState.matches.filter(m => m.status === 'CREATED').length > 0 ? (
                      <button className="button button-primary" onClick={() => startMatch(engineState.matches.filter(m => m.status === 'CREATED')[0].id)}>START NEXT MATCH</button>
                    ) : (
                      <button className="button button-secondary" onClick={generateMatches}>GENERATE NEW MATCHES</button>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {engineState.phase === 'SETUP' && (
              <div className="standings-card" style={{ marginTop: '2rem' }}>
                <div className="team-input-row">
                  <input placeholder="Add team..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
                  <button className="button button-primary" onClick={addTeam}>ADD</button>
                </div>
                {engineState.teams.length >= 2 && <button className="button button-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={startTournament}>BEGIN TOURNAMENT</button>}
              </div>
            )}
          </div>
        )}

        {/* Existing Tournament Sections */}
        <div className="panel page-card" style={{ marginBottom: "1.5rem" }}>
          <h2>🏗️ Bracket</h2>
          <BracketView rounds={bracketData.rounds || []} tournamentStatus={tournament.status} />
        </div>

        <div className="panel page-card">
          <h2>📊 Standings</h2>
          <table className="leaderboard-table">
            <thead><tr><th>#</th><th>Player</th><th>Score</th><th>W/L</th></tr></thead>
            <tbody>
              {(participantData.participants || []).map((p: any, i: number) => (
                <tr key={p.userId}>
                  <td>{i + 1}</td>
                  <td>{p.displayName}</td>
                  <td>{p.totalScore} pts</td>
                  <td>{p.wins}W / {p.losses}L</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  );
}
