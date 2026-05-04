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
  const [lastVictoryId, setLastVictoryId] = useState<string | null>(null);
  const [showVictory, setShowVictory] = useState<any>(null);
  const [qPage, setQPage] = useState(0);
  const qSize = 5;

  const fetchArena = useCallback(async () => {
    try {
      const { payload } = await readBackendJson<any>(`/public-arenas/${id}`);
      if (payload?.ok && payload?.arena) {
        setArena(payload.arena);
      }
    } catch (err) {
      console.error("Fetch Arena Error:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchArena();
    const interval = setInterval(fetchArena, 5000); 
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [fetchArena]);

  useEffect(() => {
    if (arena?.state?.matches) {
      const lastMatch = [...arena.state.matches]
        .sort((a, b) => (b.order || 0) - (a.order || 0))
        .find(m => m.status === 'COMPLETED');
        
      if (lastMatch && lastMatch.id !== lastVictoryId) {
        setLastVictoryId(lastMatch.id);
        setShowVictory(lastMatch);
        setTimeout(() => setShowVictory(null), 10000);
      }
    }
  }, [arena?.state?.matches, lastVictoryId]);

  if (loading) return (
    <div className="setup-view slide-in">
      <div className="setup-card glass-morphism" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="live-pulse" style={{ margin: '0 auto 1.5rem', width: '20px', height: '20px' }}></div>
        <div className="glow-text">INITIALIZING ARENA STREAM...</div>
        <p className="muted mt-4">Connecting to Stadium Arena network</p>
      </div>
    </div>
  );

  if (!arena || !arena.state) return (
    <div className="setup-view slide-in">
      <div className="setup-card glass-morphism" style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="modal-icon">⚠️</div>
        <div className="glow-text">ARENA NOT FOUND</div>
        <p className="muted mt-4">The battleground has expired or does not exist.</p>
        <button className="button button-gold mt-8" onClick={() => window.location.href = "/"}>BACK TO HOME</button>
      </div>
    </div>
  );

  const state: ArenaState = arena.state;
  const matches = state.matches || [];
  const teams = state.teams || [];
  const liveMatch = matches.find(m => m.status === 'LIVE');
  const upcomingMatches = matches.filter(m => m.status === 'CREATED').sort((a, b) => a.order - b.order);
  
  const getTeamName = (tid: string) => teams.find(t => t.id === tid)?.name || "Unknown Team";

  const Ticker = ({ balls, black, color }: { balls: number, black: boolean, color: string }) => (
    <div className="ticker-row">
      {[...Array(7)].map((_, i) => (
        <div key={i} className={`ball-slot ${i < balls ? 'filled' : ''}`} style={{ '--accent-primary': color } as any}>{i + 1}</div>
      ))}
      <div className={`ball-slot black ${black ? 'filled' : ''}`}>8</div>
    </div>
  );

  return (
    <div className="engine-container animate-in" style={{ padding: '2rem', minHeight: '100vh', background: 'transparent' }}>
      {showVictory && (
        <div className="victory-overlay animate-in">
          <div className="fireworks-container">
            <div className="firework"></div><div className="firework"></div><div className="firework"></div><div className="firework"></div><div className="firework"></div>
          </div>
          <div className="victory-podium slide-in">
            <div className="v-crown">👑</div>
            <div className="v-label">CHAMPION DECLARED</div>
            <h1 className="v-name-xl glow-text-gold">{getTeamName(showVictory.winner_id || "")}</h1>
            <div className="v-stats-premium">
              <span className="v-score">{showVictory.score_team_a}</span>
              <span className="v-vs">DEFEATED</span>
              <span className="v-score">{showVictory.score_team_b}</span>
            </div>
            <div className="v-footer">MATCH CONCLUDED • STADIUM ARENA STREAM</div>
          </div>
        </div>
      )}

      <div className="spectator-badge">READ ONLY STREAM</div>
      
      <div className="arena-header-v2" style={{ marginBottom: '3rem' }}>
        <div className="arena-meta">
          <h1 className="glow-text">{arena.name}</h1>
          <div className="arena-badge">LIVE SPECTATOR STREAM • {teams.length} TEAMS</div>
        </div>
      </div>

      {liveMatch ? (
        <div className="match-engine-v2 animate-in">
          <div className="match-timer-v3">
            <div className="live-pill"><span className="live-pulse"></span> LIVE</div>
            <div className="timer-interactive" style={{ pointerEvents: 'none' }}>
              <span className="time-val">
                {Math.max(0, Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime) / 60))}:
                {String(Math.max(0, ((liveMatch.start_time || 0) + liveMatch.duration - currentTime) % 60)).padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="battle-view">
            <div className={`team-pod red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`}>
              <div className="pod-inner">
                <div className="pod-header">
                  <div className="team-initials">{getTeamName(liveMatch.team_a_id).substring(0, 2).toUpperCase()}</div>
                  <div className="team-title-stack">
                    <h3 className="team-name">{getTeamName(liveMatch.team_a_id)}</h3>
                    {liveMatch.fouls_a > 0 && <div className="foul-chip" style={{ cursor: 'default' }}>FOULS: {liveMatch.fouls_a}</div>}
                  </div>
                  {liveMatch.team_a_house && (
                    <div className="house-selector">
                      <div className="house-opt active">{liveMatch.team_a_house === 'SOLID' ? '●' : '◐'}</div>
                    </div>
                  )}
                </div>
                <div className="pod-score-large">{liveMatch.score_team_a}</div>
                <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
              </div>
              <div className="active-glow" style={{ background: '#ef4444', opacity: 0.2 }}></div>
            </div>

            <div className="vs-core"><div className="vs-ring"></div><div className="vs-text">VS</div></div>

            <div className={`team-pod blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`}>
              <div className="pod-inner">
                <div className="pod-header">
                  <div className="team-initials">{getTeamName(liveMatch.team_b_id).substring(0, 2).toUpperCase()}</div>
                  <div className="team-title-stack">
                    <h3 className="team-name">{getTeamName(liveMatch.team_b_id)}</h3>
                    {liveMatch.fouls_b > 0 && <div className="foul-chip" style={{ cursor: 'default' }}>FOULS: {liveMatch.fouls_b}</div>}
                  </div>
                  {liveMatch.team_b_house && (
                    <div className="house-selector">
                      <div className="house-opt active">{liveMatch.team_b_house === 'SOLID' ? '●' : '◐'}</div>
                    </div>
                  )}
                </div>
                <div className="pod-score-large">{liveMatch.score_team_b}</div>
                <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
              </div>
              <div className="active-glow" style={{ background: '#3b82f6', opacity: 0.2 }}></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="phase-transition-overlay animate-in" style={{ padding: '4rem' }}>
          <div className="phase-card glass-morphism">
            <div className="p-icon">⚔️</div>
            <h3>ARENA IS CURRENTLY IDLE</h3>
            <p className="muted">Waiting for the host to launch the next high-stakes duel...</p>
          </div>
        </div>
      )}

      <div className="schedule-grid mt-12">
        <div className="queue-column">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <label className="section-label-v2">UPCOMING DUELS</label>
            <div className="pagination-v2">
              <button className={`p-btn ${qPage === 0 ? 'disabled' : ''}`} onClick={() => setQPage(p => Math.max(0, p - 1))}>←</button>
              <span className="p-info">PAGE {qPage + 1} / {Math.ceil(upcomingMatches.length / qSize) || 1}</span>
              <button className={`p-btn ${qPage >= Math.ceil(upcomingMatches.length / qSize) - 1 ? 'disabled' : ''}`} onClick={() => setQPage(p => p + 1)}>→</button>
            </div>
          </div>
          <div className="queue-list-premium">
            {upcomingMatches.slice(qPage * qSize, (qPage + 1) * qSize).map((m, i) => (
              <div key={m.id} className="schedule-item-card animate-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="s-rank">#{qPage * qSize + i + 1}</div>
                <div className="s-info">
                  <div className="s-pair">{getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}</div>
                </div>
              </div>
            ))}
            {upcomingMatches.length === 0 && (
              <div className="empty-roster" style={{ background: 'rgba(255,255,255,0.02)', padding: '2rem' }}>
                <div className="empty-roster-icon" style={{ opacity: 0.2 }}>🏁</div>
                <p>No duels currently scheduled</p>
              </div>
            )}
          </div>
        </div>

        <div className="summary-column">
          <label className="section-label-v2">LIVE STANDINGS</label>
          <div className="standings-grid-v2">
            {[...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
              <div key={t.id} className={`standing-card-v2 ${i === 0 ? 'gold' : 'normal'}`} style={{ padding: '1rem' }}>
                <div className="team-info">
                  <div className="team-name" style={{ fontSize: '0.9rem' }}>{t.name}</div>
                  <div className="team-status">{t.group_points} WINS • {t.total_score} PTS</div>
                </div>
                <div className="rank-indicator" style={{ fontSize: '1rem' }}>
                  {i === 0 ? '👑' : `#${i + 1}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
