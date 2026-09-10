"use client";

import { useEffect, useState, useCallback } from "react";
import { readBackendJson } from "@/lib/backend";
import { FootballMatchEngine } from "@/components/football-match-engine";
import { PoolMatchEngine } from "@/components/pool-match-engine";
import { LiveFeedViewer } from "@/components/live-feed-viewer";
import { BroadcastCode } from "@/components/broadcast-code";
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
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [qPage, setQPage] = useState(0);
  const [qrMatchId, setQrMatchId] = useState<string | null>(null);
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
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const mId = params.get("matchId");
      if (mId) setActiveMatchId(mId);
    }
  }, []);

  useEffect(() => {
    fetchArena();
    const interval = setInterval(fetchArena, 5000); 
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
      
      setArena((prev: any) => {
        if (!prev || !prev.state || !prev.state.matches) return prev;
        const updatedMatches = prev.state.matches.map((m: any) => {
          if (m.status !== 'LIVE' || !m.footballData) return m;
          const fd = m.footballData;
          if (fd.half === 1 && fd.timerSeconds >= Math.floor(m.duration / 2)) {
            return m; // paused
          }
          return {
            ...m,
            footballData: {
              ...fd,
              timerSeconds: fd.timerSeconds + 1
            }
          };
        });
        return {
          ...prev,
          state: {
            ...prev.state,
            matches: updatedMatches
          }
        };
      });
    }, 1000);

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
        const matchEndTime = (lastMatch.start_time || 0) + (lastMatch.duration || 0);
        const isRecent = (currentTime - matchEndTime) < 20;

        if (isRecent) {
          setLastVictoryId(lastMatch.id);
          setShowVictory(lastMatch);
          setTimeout(() => setShowVictory(null), 10000);
        } else {
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
  const liveMatches = matches.filter(m => m.status === 'LIVE');
  const selectedSport = matches[0]?.sport || '8BALL';

  // Determine active detailed live match
  const liveMatch = matches.find(m => m.id === activeMatchId && m.status === 'LIVE') || liveMatches[0];
  const upcomingMatches = matches.filter(m => m.status === 'CREATED').sort((a, b) => a.order - b.order);
  const getTeamName = (tid: string) => teams.find(t => t.id === tid)?.name || "Unknown Team";

  const getFootballTimeDisplay = (match: any) => {
    if (!match.footballData) return "0:00";
    const fd = match.footballData;
    const halfDuration = Math.floor(match.duration / 2);
    
    if (fd.half === 1) {
      if (fd.timerSeconds >= halfDuration) {
        return "HALF TIME";
      }
      const mins = Math.floor(fd.timerSeconds / 60);
      const secs = fd.timerSeconds % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    } else {
      const totalSeconds = halfDuration + fd.timerSeconds;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }
  };

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

      <div className="spectator-badge">READ ONLY SPECTATOR STREAM</div>
      
      <div className="arena-header-v2">
        <div className="arena-meta">
          <h1 className="glow-text">{arena.name}</h1>
          <div className="arena-badge">LIVE SPECTATOR STREAM • {teams.length} TEAMS</div>
        </div>
        {liveMatches.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className={`button ${!activeMatchId ? 'button-gold' : 'button-secondary'}`}
              onClick={() => {
                setActiveMatchId(null);
                // Clear URL search params
                window.history.pushState({}, "", window.location.pathname);
              }}
            >
              📺 LIVE SCREENING ({liveMatches.length})
            </button>
          </div>
        )}
      </div>

      {/* RENDER DETAILED VIEW OR MULTIPLEX SCREENING */}
      {liveMatch && activeMatchId ? (
        <div className="match-engine-v2 animate-in mt-6">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <button className="button button-secondary button-sm" onClick={() => {
              setActiveMatchId(null);
              window.history.pushState({}, "", window.location.pathname);
            }}>
              ← BACK TO MULTIPLEX
            </button>
            <span className="sport-badge" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {liveMatch.sport === 'FOOTBALL' ? '⚽ FOOTBALL' : '🎱 8-BALL'}
            </span>
          </div>

          <div className="match-timer-v3">
            <div className="live-pill"><span className="live-pulse"></span> LIVE</div>
            <div className="timer-interactive" style={{ pointerEvents: 'none' }}>
              <span className="time-val">
                {liveMatch.sport === 'FOOTBALL' ? getFootballTimeDisplay(liveMatch) : (
                  <>
                    {Math.max(0, Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime) / 60))}:
                    {String(Math.max(0, ((liveMatch.start_time || 0) + liveMatch.duration - currentTime) % 60)).padStart(2, '0')}
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Render locked modular view depending on sport */}
          {liveMatch.sport === 'FOOTBALL' ? (
            <FootballMatchEngine 
              match={liveMatch}
              teams={teams}
              isLocked={true}
              currentTime={currentTime}
              onUpdateFootballStat={() => {}}
              onUpdateFootballData={() => {}}
              onRecordCard={() => {}}
              onPerformSubstitution={() => {}}
              onStartSecondHalf={() => {}}
              onScoreSync={() => {}}
            />
          ) : (
            <PoolMatchEngine 
              match={liveMatch}
              teams={teams}
              isLocked={true}
              onUpdateScore={() => {}}
              onUpdateHouse={() => {}}
              onSetActiveTeam={() => {}}
            />
          )}

          <div className="mt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
            {/* Shown to everyone: the server decides who may actually mint a
                broadcast token, and says so plainly if they may not. Hiding the
                control instead made the feature vanish silently whenever
                ownership could not be resolved. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                className="button button-secondary button-sm"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setQrMatchId(qrMatchId === liveMatch.id ? null : liveMatch.id)}
              >
                📷 {qrMatchId === liveMatch.id ? 'HIDE CODE' : 'STREAM THIS MATCH'}
              </button>
            </div>

            {qrMatchId === liveMatch.id && (
              <div style={{ marginBottom: '20px' }}>
                <BroadcastCode arenaId={id} matchId={liveMatch.id} onClose={() => setQrMatchId(null)} />
              </div>
            )}

            <LiveFeedViewer arenaId={id} matchId={liveMatch.id} isLive={true} />
          </div>
        </div>
      ) : liveMatches.length > 0 ? (
        <div className="live-screening-panel animate-in mt-6" style={{ width: '100%' }}>
          <h2 className="glow-text mb-2">📺 MULTIPLEX LIVE SCREENING PANEL</h2>
          <p className="muted mb-8" style={{ fontSize: '0.9rem' }}>Real-time spectator multiplex. Click on any game card to expand full tactical statistics, pitch configurations, and live timeline events.</p>
          
          <div className="screening-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px', width: '100%' }}>
            {liveMatches.map(m => {
              const isFootball = m.sport === 'FOOTBALL';
              const timeStr = isFootball ? getFootballTimeDisplay(m) : `${Math.max(0, Math.floor(((m.start_time || 0) + m.duration - currentTime) / 60))}:${String(Math.max(0, ((m.start_time || 0) + m.duration - currentTime) % 60)).padStart(2, '0')}`;
              
              return (
                <div key={m.id} className="glass-morphism screening-card hover-glow animate-in" style={{ padding: '24px', borderRadius: '12px', background: 'rgba(9, 9, 22, 0.45)', border: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span className="live-pill" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      <span className="live-pulse"></span> LIVE
                    </span>
                    <span className="sport-badge" style={{ background: isFootball ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: isFootball ? '#10b981' : '#3b82f6', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold' }}>
                      {isFootball ? '⚽ FOOTBALL' : '🎱 8-BALL'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '20px 0' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTeamName(m.team_a_id)}</div>
                      <div style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--red)', marginTop: '8px' }}>{m.score_team_a}</div>
                    </div>
                    <div style={{ fontSize: '1.2rem', color: '#555', fontWeight: 'bold', margin: '0 15px' }}>VS</div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTeamName(m.team_b_id)}</div>
                      <div style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--blue)', marginTop: '8px' }}>{m.score_team_b}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '15px' }}>
                    <span className="time-val" style={{ fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 'bold', fontSize: '1.1rem' }}>⏱️ {timeStr}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="button button-gold button-sm" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          const specLink = `${window.location.origin}/arena/${id}?matchId=${m.id}`;
                          navigator.clipboard.writeText(specLink);
                          alert("Copied specific live match spectator link to clipboard!");
                        }}
                      >
                        🔗 SHARE
                      </button>
                      <button 
                        className="button button-secondary button-sm" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          setActiveMatchId(m.id);
                          window.history.pushState({}, "", `?matchId=${m.id}`);
                        }}
                      >
                        🔍 EXPAND VIEW
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                      <button
                        className="button button-secondary button-sm"
                        style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        onClick={() => setQrMatchId(qrMatchId === m.id ? null : m.id)}
                      >
                        📷 {qrMatchId === m.id ? 'HIDE CODE' : 'STREAM'}
                      </button>
                    </div>

                    {qrMatchId === m.id && (
                      <div style={{ marginBottom: '16px' }}>
                        <BroadcastCode arenaId={id} matchId={m.id} onClose={() => setQrMatchId(null)} />
                      </div>
                    )}

                    <LiveFeedViewer arenaId={id} matchId={m.id} isLive={true} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="phase-transition-overlay animate-in mt-6">
          <div className="phase-card glass-morphism">
            <div className="p-icon">⚔️</div>
            <h3>ARENA IS CURRENTLY IDLE</h3>
            <p className="muted">Waiting for the host to launch the next high-stakes duel...</p>
          </div>
        </div>
      )}

      {/* SCHEDULE & STANDINGS SECTION */}
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

          {/* DYNAMIC AWARDS PANEL */}
          {teams.length > 0 && (() => {
            let topPlayerName = "TBD";
            let topPlayerRating = 0;
            let topPlayerTeam = "";
            
            let bestGkName = "TBD";
            let bestGkSaves = 0;
            let bestGkTeam = "";

            if (selectedSport === 'FOOTBALL') {
              const playerMap: Record<string, {
                id: string;
                name: string;
                teamName: string;
                goals: number;
                saves: number;
                attempts: number;
                yellows: number;
                reds: number;
              }> = {};

              teams.forEach((t: any) => {
                t.players.forEach((p: any) => {
                  playerMap[p.id] = {
                    id: p.id,
                    name: p.name,
                    teamName: t.name,
                    goals: 0,
                    saves: 0,
                    attempts: 0,
                    yellows: 0,
                    reds: 0
                  };
                });
              });

              matches.forEach((m: any) => {
                if (m.footballData) {
                  const fd = m.footballData;
                  const atts = fd.attempts || [];
                  atts.forEach((a: any) => {
                    if (playerMap[a.playerId]) {
                      playerMap[a.playerId].attempts++;
                      if (a.outcome === 'SCORED') playerMap[a.playerId].goals++;
                    }
                    if (a.outcome === 'SAVED' && a.goalkeeperId && playerMap[a.goalkeeperId]) {
                      playerMap[a.goalkeeperId].saves++;
                    }
                  });
                  const crds = fd.cards || [];
                  crds.forEach((c: any) => {
                    if (playerMap[c.playerId]) {
                      if (c.type === 'YELLOW') playerMap[c.playerId].yellows++;
                      else playerMap[c.playerId].reds++;
                    }
                  });
                }
              });

              const allFbPlayers = Object.values(playerMap).map(p => ({
                ...p,
                rating: (p.goals * 10) + (p.saves * 3) - (p.yellows * 2) - (p.reds * 5)
              }));

              const sortedFbPlayers = [...allFbPlayers].sort((a, b) => b.rating - a.rating || b.goals - a.goals);
              if (sortedFbPlayers.length > 0) {
                topPlayerName = sortedFbPlayers[0].name;
                topPlayerRating = sortedFbPlayers[0].rating;
                topPlayerTeam = sortedFbPlayers[0].teamName;
              }

              const sortedGks = [...allFbPlayers].sort((a, b) => b.saves - a.saves);
              if (sortedGks.length > 0 && sortedGks[0].saves > 0) {
                bestGkName = sortedGks[0].name;
                bestGkSaves = sortedGks[0].saves;
                bestGkTeam = sortedGks[0].teamName;
              }
            } else {
              const allPlayers = teams.flatMap((t: any) => t.players.map((p: any) => ({ 
                ...p, 
                teamName: t.name,
                rating: (p.total_balls_potted * 10) - (p.total_fouls * 5)
              })));
              const topPlayer = [...allPlayers].sort((a, b) => b.rating - a.rating || b.total_balls_potted - a.total_balls_potted)[0];
              if (topPlayer) {
                topPlayerName = topPlayer.name;
                topPlayerRating = topPlayer.rating;
                topPlayerTeam = topPlayer.teamName;
              }
            }

            return (
              <div className="awards-panel-spectator mt-8 glass-morphism" style={{ padding: '20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                <span className="section-label-v2 mb-4 block text-center" style={{ fontSize: '0.8rem' }}>🏆 ARENA HONOURS & STATS</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 15px', borderRadius: '4px' }}>
                    <div>
                      <span className="section-label-v2" style={{ fontSize: '0.65rem', display: 'block' }}>MAN OF THE TOURNAMENT</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--gold)', fontSize: '0.95rem' }}>{topPlayerName}</span>
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#888' }}>{topPlayerRating} rating</span>
                  </div>

                  {selectedSport === 'FOOTBALL' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 15px', borderRadius: '4px' }}>
                      <div>
                        <span className="section-label-v2" style={{ fontSize: '0.65rem', display: 'block' }}>GOLDEN GLOVE (BEST GK)</span>
                        <span style={{ fontWeight: 'bold', color: '#10b981', fontSize: '0.95rem' }}>{bestGkName}</span>
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#888' }}>{bestGkSaves} saves</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
