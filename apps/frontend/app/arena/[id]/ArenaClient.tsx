"use client";

import { useEffect, useState, useCallback } from "react";
import { readBackendJson } from "@/lib/backend";
import { TeamPod, VSCore } from "@/components/match-components";
import "@/components/tournament-engine.css";

interface ArenaState {
  teams: any[];
  matches: any[];
  isStarted: boolean;
}

export function ArenaClient({ id }: { id: string }) {
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
        // Only show if it ended recently (within last 20 seconds)
        const matchEndTime = (lastMatch.start_time || 0) + (lastMatch.duration || 0);
        const isRecent = (currentTime - matchEndTime) < 20;

        if (isRecent) {
          setLastVictoryId(lastMatch.id);
          setShowVictory(lastMatch);
          setTimeout(() => setShowVictory(null), 10000);
        } else {
          // Still set lastVictoryId so we don't keep checking it
          setLastVictoryId(lastMatch.id);
        }
      }
    }
  }, [arena?.state?.matches, lastVictoryId, currentTime]);

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


  return (
    <div className="engine-container animate-in">
      {showVictory && (
        <div className="victory-overlay animate-in">
          <div className="victory-podium slide-in">
            <div className="v-crown">{showVictory.is_draw ? '🤝' : '👑'}</div>
            <div className="v-label">{showVictory.is_draw ? 'MATCH TIED' : 'CHAMPION DECLARED'}</div>
            <h1 className="v-name-xl glow-text-gold">{showVictory.is_draw ? 'STALEMATE DRAW' : getTeamName(showVictory.winner_id || "")}</h1>
            <div className="v-stats-premium">
              <span className="v-score">{showVictory.score_team_a}</span>
              <span className="v-vs">{showVictory.is_draw ? 'DRAW' : 'DEFEATED'}</span>
              <span className="v-score">{showVictory.score_team_b}</span>
            </div>
            <div className="v-footer">POINTS AWARDED: {showVictory.is_draw ? '+50 TO EACH' : '+1 WIN'}</div>
          </div>
        </div>
      )}

      <div className="spectator-badge">READ ONLY STREAM</div>
      
      <div className="arena-header-v2">
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
            <TeamPod 
              teamName={getTeamName(liveMatch.team_a_id)}
              score={liveMatch.score_team_a}
              color="red"
              isActive={liveMatch.active_team_id === liveMatch.team_a_id}
              fouls={liveMatch.fouls_a}
              house={liveMatch.team_a_house}
              ballsPotted={liveMatch.balls_potted_a}
              blackPotted={liveMatch.black_potted_a}
            />

            <VSCore />

            <TeamPod 
              teamName={getTeamName(liveMatch.team_b_id)}
              score={liveMatch.score_team_b}
              color="blue"
              isActive={liveMatch.active_team_id === liveMatch.team_b_id}
              fouls={liveMatch.fouls_b}
              house={liveMatch.team_b_house}
              ballsPotted={liveMatch.balls_potted_b}
              blackPotted={liveMatch.black_potted_b}
            />
          </div>
        </div>
      ) : (
        <div className="phase-transition-overlay animate-in">
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
