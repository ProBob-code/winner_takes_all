"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { readBackendJson } from "@/lib/backend";
import "@/components/tournament-engine.css";

interface ArenaState {
  teams: any[];
  matches: any[];
  isStarted: boolean;
}

export default function PublicArenaPage() {
  const params = useParams();
  const id = params.id as string;
  const [arena, setArena] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  const fetchArena = useCallback(async () => {
    try {
      const { payload } = await readBackendJson<any>(`/public-arenas/${id}`);
      if (payload.ok) {
        setArena(payload.arena);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchArena();
    const interval = setInterval(fetchArena, 5000); // Polling for live updates
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [fetchArena]);

  if (loading) return <div className="page"><div className="shell">Initializing Arena Stream...</div></div>;
  if (!arena) return <div className="page"><div className="shell">Arena not found or expired.</div></div>;

  const state: ArenaState = arena.state;
  const liveMatch = state.matches.find(m => m.status === 'LIVE');
  const getTeamName = (tid: string) => state.teams.find(t => t.id === tid)?.name || "BYE";
  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

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
    <main className="page">
      <div className="shell engine-container animate-in">
        <div className="arena-header" style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 className="glow-text" style={{ fontSize: '2.5rem' }}>{arena.name}</h1>
          <div className="phase-badge">LIVE SPECTATOR VIEW</div>
        </div>

        {liveMatch ? (
          <div className="center-stage slide-in" style={{ padding: '3rem' }}>
            <div className="match-status-indicator" style={{ marginBottom: '2rem' }}>
              <div className="live-dot"></div>
              LIVE • {formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}
            </div>
            <div className="score-arena" style={{ width: '100%', gap: '3rem' }}>
              <div className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} style={{ cursor: 'default' }}>
                <div className="pod-name" style={{ color: '#ef4444' }}>{getTeamName(liveMatch.team_a_id)}</div>
                <div className="pod-score" style={{ fontSize: '5rem' }}>{liveMatch.score_team_a}</div>
                <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
              </div>
              <div className="vs-orb" style={{ width: '80px', height: '80px', fontSize: '1.2rem' }}>VS</div>
              <div className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} style={{ cursor: 'default' }}>
                <div className="pod-name" style={{ color: '#3b82f6' }}>{getTeamName(liveMatch.team_b_id)}</div>
                <div className="pod-score" style={{ fontSize: '5rem' }}>{liveMatch.score_team_b}</div>
                <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
              </div>
            </div>
          </div>
        ) : (
          <div className="panel page-card slide-in" style={{ textAlign: 'center', padding: '4rem' }}>
            <h2 className="muted">Arena is currently idle.</h2>
            <p className="muted mt-4">Waiting for the host to start the next match...</p>
          </div>
        )}

        <div style={{ marginTop: '4rem' }}>
          <h3 className="section-label">CURRENT STANDINGS</h3>
          <div className="standings-card mt-4">
            <table className="standings-table">
              <thead><tr><th>RANK</th><th>TEAM</th><th>P</th><th>W</th><th>SCORE</th></tr></thead>
              <tbody>
                {[...state.teams].sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
                  <tr key={t.id}>
                    <td>#{i+1}</td>
                    <td style={{ fontWeight: 900 }}>{t.name}</td>
                    <td>{t.matches_played}</td>
                    <td style={{ color: '#8b5cf6' }}>{t.group_points}</td>
                    <td style={{ fontWeight: 900, color: '#f59e0b' }}>{t.total_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '5rem', opacity: 0.3 }}>
          <p>Powered by Winner Takes All (WTA) Stadium Engine</p>
        </div>
      </div>
    </main>
  );
}
