"use client";

import React, { useState, useEffect } from "react";
import { backendFetch } from "@/lib/backend";
import "@/components/tournament-engine.css";

type Team = { id: string; name: string; matches_played: number; group_points: number; total_score: number; };
type Match = { id: string; team_a_id: string; team_b_id: string; score_team_a: number; score_team_b: number; balls_potted_a: number; balls_potted_b: number; black_potted_a: boolean; black_potted_b: boolean; status: 'CREATED' | 'LIVE' | 'COMPLETED'; winner_id: string | null; active_team_id: string | null; duration: number; start_time: number | null; order: number; };

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'arena' | 'standings'>('arena');
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [arenaId, setArenaId] = useState<string>("");
  const [matchesPerTeam, setMatchesPerTeam] = useState(2);
  const [tournamentType, setTournamentType] = useState<'GROUP' | 'KNOCKOUT'>('GROUP');
  const [arenaName, setArenaName] = useState("Stadium Arena Showdown");
  const [isPublishing, setIsPublishing] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAddTeamInline, setShowAddTeamInline] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Sync with LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("wta_arena_quick_v8");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setIsStarted(parsed.isStarted || false);
      setArenaId(parsed.arenaId || "");
      setMatchesPerTeam(parsed.matchesPerTeam || 2);
      setTournamentType(parsed.tournamentType || 'GROUP');
      setArenaName(parsed.arenaName || "Stadium Arena Showdown");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_arena_quick_v8", JSON.stringify({ teams, matches, isStarted, arenaId, matchesPerTeam, tournamentType, arenaName }));
    if (arenaId && isStarted) {
      backendFetch("/public-arenas", { method: "POST", body: JSON.stringify({ id: arenaId, name: arenaName, state: { teams, matches, isStarted } }) }).catch(()=>{});
    }
  }, [teams, matches, isStarted, arenaId, matchesPerTeam, tournamentType, arenaName]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const generateMatchesPass = (allTeams: Team[], existingMatches: Match[]) => {
    const newMatches: Match[] = [];
    let currentMatches = [...existingMatches];
    
    if (tournamentType === 'GROUP') {
      // SWISS-LITE / ROUND-ROBIN LITE: Match teams with fewest matches played first
      const sortedTeams = [...allTeams].sort((a,b) => a.matches_played - b.matches_played);
      
      const paired = new Set<string>();
      for (let i = 0; i < sortedTeams.length; i++) {
        const t1 = sortedTeams[i];
        if (paired.has(t1.id) || t1.matches_played >= matchesPerTeam) continue;

        // Find best opponent: Hasn't played t1 yet, and has fewest matches played
        const t2 = sortedTeams.find(potential => {
          if (potential.id === t1.id || paired.has(potential.id) || potential.matches_played >= matchesPerTeam) return false;
          // Check if they already played
          const alreadyPlayed = currentMatches.some(m => 
            (m.team_a_id === t1.id && m.team_b_id === potential.id) || 
            (m.team_a_id === potential.id && m.team_b_id === t1.id)
          );
          return !alreadyPlayed;
        });

        if (t2) {
          paired.add(t1.id); paired.add(t2.id);
          newMatches.push({
            id: `m-${Date.now()}-${i}`, team_a_id: t1.id, team_b_id: t2.id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: 600, start_time: null,
            order: currentMatches.length + newMatches.length
          });
        }
      }
    } else {
      // Basic Knockout: Only works if powers of 2 for now, or just simple pairing
      if (allTeams.length >= 2 && currentMatches.length === 0) {
        for (let i = 0; i < allTeams.length; i += 2) {
          if (i + 1 < allTeams.length) {
            newMatches.push({
              id: `m-k-${i}`, team_a_id: allTeams[i].id, team_b_id: allTeams[i+1].id,
              score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
              black_potted_a: false, black_potted_b: false, status: 'CREATED',
              winner_id: null, active_team_id: null, duration: 600, start_time: null, order: i/2
            });
          }
        }
      }
    }
    return newMatches;
  };

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    const newTeam: Team = { id: Math.random().toString(36).substr(2, 9), name: newTeamName.trim(), matches_played: 0, group_points: 0, total_score: 0 };
    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    setNewTeamName("");

    if (isStarted && tournamentType === 'GROUP') {
      const next = generateMatchesPass(updatedTeams, matches);
      if (next.length > 0) setMatches([...matches, ...next]);
    }
  };

  const publishArena = async () => {
    setIsPublishing(true);
    const id = arenaId || Math.random().toString(36).substr(2, 8).toUpperCase();
    try {
      await backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify({ id, name: arenaName, state: { teams, matches, isStarted } })
      });
      setArenaId(id);
      setShowShareModal(true);
    } catch (e) {
      alert("Failed to publish.");
    } finally {
      setIsPublishing(false);
    }
  };

  const startTournament = () => {
    const initial = generateMatchesPass(teams, []);
    setMatches(initial);
    setIsStarted(true);
  };

  const setRemainingTime = (matchId: string, seconds: number) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, duration: seconds, start_time: currentTime } : m));
  };

  const shuffleQueue = () => {
    const created = matches.filter(m => m.status === 'CREATED');
    const shuffled = [...created].sort(() => Math.random() - 0.5);
    setMatches(matches.map(m => {
      if (m.status !== 'CREATED') return m;
      const sMatch = shuffled.shift();
      return sMatch ? { ...m, id: sMatch.id, team_a_id: sMatch.team_a_id, team_b_id: sMatch.team_b_id } : m;
    }));
  };

  const addExtraTime = (matchId: string) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, duration: m.duration + 60 } : m));
  };

  const updateScore = (matchId: string, teamId: string, type: 'BALL' | 'BLACK') => {
    setMatches(matches.map(m => {
      if (m.id !== matchId || m.status !== 'LIVE') return m;
      const nm = { ...m };
      const isA = m.team_a_id === teamId;
      if (isA) {
        if (type === 'BALL') nm.balls_potted_a = Math.min(7, nm.balls_potted_a + 1);
        if (type === 'BLACK') nm.black_potted_a = true;
        nm.score_team_a += (type === 'BLACK' ? 30 : 10);
      } else {
        if (type === 'BALL') nm.balls_potted_b = Math.min(7, nm.balls_potted_b + 1);
        if (type === 'BLACK') nm.black_potted_b = true;
        nm.score_team_b += (type === 'BLACK' ? 30 : 10);
      }
      if (nm.score_team_a >= 100 || nm.score_team_b >= 100) {
        nm.status = 'COMPLETED'; nm.winner_id = nm.score_team_a >= 100 ? nm.team_a_id : nm.team_b_id;
        setTeams(prev => prev.map(t => (t.id === nm.team_a_id || t.id === nm.team_b_id) ? { ...t, matches_played: t.matches_played + 1, total_score: t.total_score + (t.id === nm.team_a_id ? nm.score_team_a : nm.score_team_b), group_points: t.group_points + (nm.winner_id === t.id ? 1 : 0) } : t));
      }
      return nm;
    }));
  };

  const reset = () => {
    setTeams([]);
    setMatches([]);
    setIsStarted(false);
    setArenaId("");
    setShowResetModal(false);
  };
  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || "Unknown";

  const Ticker = ({ balls, black, color }: { balls: number, black: boolean, color: string }) => (
    <div className="ticker-row">
      {[...Array(7)].map((_, i) => (
        <div key={i} className={`ball-slot ${i < balls ? 'filled' : ''}`} style={{ '--accent-primary': color } as any}>{i+1}</div>
      ))}
      <div className={`ball-slot black ${black ? 'filled' : ''}`}>8</div>
    </div>
  );
  if (!isStarted) {
    return (
      <div className="setup-view slide-in" style={{ paddingBottom: '5rem' }}>
        <div className="setup-card animate-in">
          <div className="setup-header">
            <h1 className="glow-text">Arena Engine</h1>
            <p className="muted">Configure your high-stakes showdown parameters.</p>
          </div>
          
          <div className="setup-grid">
            {/* Settings Section */}
            <div className="setup-section">
              <div className="form-group">
                <label className="section-label-v2">ARENA IDENTITY</label>
                <input 
                  className="premium-input-v2" 
                  value={arenaName} 
                  onChange={e => setArenaName(e.target.value)} 
                  placeholder="e.g. Midnight Championship" 
                />
              </div>

              <div className="form-group mt-10">
                <label className="section-label-v2">TOURNAMENT FORMAT</label>
                <div className="segmented-control">
                  <button 
                    className={`segment-btn ${tournamentType === 'GROUP' ? 'active' : ''}`} 
                    onClick={() => setTournamentType('GROUP')}
                  >
                    GROUP STAGE
                  </button>
                  <button 
                    className={`segment-btn ${tournamentType === 'KNOCKOUT' ? 'active' : ''}`} 
                    onClick={() => setTournamentType('KNOCKOUT')}
                  >
                    KNOCKOUT
                  </button>
                </div>
              </div>

              {tournamentType === 'GROUP' && (
                <div className="form-group mt-10">
                  <label className="section-label-v2">MATCH QUOTA <span className="dim">(Per Team)</span></label>
                  <div className="quota-stepper">
                    <button className="step-btn" onClick={() => setMatchesPerTeam(Math.max(1, matchesPerTeam - 1))}>−</button>
                    <div className="quota-display">
                      <span className="quota-val">{matchesPerTeam}</span>
                      <span className="quota-unit">MATCHES</span>
                    </div>
                    <button className="step-btn" onClick={() => setMatchesPerTeam(matchesPerTeam + 1)}>+</button>
                  </div>
                </div>
              )}
            </div>

            {/* Roster Section */}
            <div className="setup-section roster-panel">
              <label className="section-label-v2">PARTICIPANT ROSTER</label>
              <div className="roster-input-wrapper">
                <input 
                  className="premium-input-v2"
                  placeholder="Enter Team/Player name..." 
                  value={newTeamName} 
                  onChange={e => setNewTeamName(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && addTeam()} 
                />
                <button className="add-roster-btn" onClick={addTeam}>ADD</button>
              </div>
              
              <div className="roster-list-container">
                {teams.length > 0 ? (
                  <div className="roster-scroll">
                    {teams.map((t, idx) => (
                      <div key={t.id} className="roster-item slide-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                        <div className="roster-idx">{String(idx + 1).padStart(2, '0')}</div>
                        <div className="roster-name">{t.name}</div>
                        <button className="remove-btn" onClick={() => setTeams(teams.filter(x => x.id !== t.id))}>REMOVE</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-roster">
                    <div className="empty-roster-icon">⚔️</div>
                    <p>No warriors added yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="setup-footer">
            <button 
              className={`launch-btn ${teams.length >= 2 ? 'ready' : 'disabled'}`}
              onClick={startTournament} 
              disabled={teams.length < 2}
            >
              <span className="launch-text">{teams.length >= 2 ? 'START TOURNAMENT' : 'ADD MINIMUM 2 TEAMS'}</span>
              <div className="launch-glow"></div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const liveMatch = matches.find(m => m.status === 'LIVE');
  const createdMatches = matches.filter(m => m.status === 'CREATED').sort((a,b) => a.order - b.order);
  const lastCompleted = [...matches].reverse().find(m => m.status === 'COMPLETED');

  return (
    <div className="engine-container animate-in">
      {showResetModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal glass-morphism slide-in">
            <div className="modal-icon">⚠️</div>
            <h2>Reset Arena?</h2>
            <p className="muted">This will erase all teams, matches, and current scores. This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setShowResetModal(false)}>CANCEL</button>
              <button className="button button-danger" onClick={reset}>CONFIRM RESET</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal glass-morphism slide-in">
            <div className="modal-icon">🔗</div>
            <h2>Arena Published!</h2>
            <p className="muted">Your arena is live! Share this link for real-time tracking.</p>
            <div className="share-link-wrapper mt-6">
              <input readOnly value={`${window.location.origin}/arena/${arenaId}`} className="premium-input-v2" />
              <button className="button button-gold" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/arena/${arenaId}`);
                alert("Link copied to clipboard!");
              }}>COPY</button>
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" style={{ gridColumn: '1 / -1' }} onClick={() => setShowShareModal(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      <div className="arena-header-v2">
        <div className="arena-meta">
          <h2 className="glow-text">{arenaName}</h2>
          <div className="arena-badge">ARENA {tournamentType} • {teams.length} TEAMS</div>
        </div>
        <div className="arena-controls">
          <button className="add-team-trigger" onClick={() => setShowAddTeamInline(!showAddTeamInline)}>
            + ADD TEAM
          </button>
          <div className="sub-tab-switcher">
            <button className={`sub-tab ${activeSubTab === 'arena' ? 'active' : ''}`} onClick={() => setActiveSubTab('arena')}>ARENA</button>
            <button className={`sub-tab ${activeSubTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          </div>
          <button className={`share-btn ${arenaId ? 'shared' : ''}`} onClick={publishArena} disabled={isPublishing}>
            {isPublishing ? 'SYNCING...' : arenaId ? '✓ LINK SHARED' : '🔗 SHARE ARENA'}
          </button>
          <button className="reset-trigger" onClick={() => setShowResetModal(true)}>
            <span className="icon">↺</span>
          </button>
        </div>
      </div>

      {showAddTeamInline && (
        <div className="add-team-popover slide-in">
          <input 
            className="premium-input-v2" 
            placeholder="New team name..." 
            value={newTeamName} 
            onChange={e => setNewTeamName(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && (addTeam(), setShowAddTeamInline(false))}
            autoFocus
          />
          <button className="button button-gold" onClick={() => { addTeam(); setShowAddTeamInline(false); }}>ADD</button>
        </div>
      )}

      {activeSubTab === 'arena' ? (
        <div className="live-arena-v2 slide-in">
          {liveMatch ? (
            <div className="match-engine-v2">
              <div className="match-timer-v3">
                <div className="live-pill"><span className="live-pulse"></span> LIVE</div>
                <div className="timer-interactive">
                  <button className="t-adj" onClick={() => addExtraTime(liveMatch.id)}>−</button>
                  <span className="time-val" onClick={() => {
                    const m = prompt("Set remaining minutes:", "10");
                    if (m) setRemainingTime(liveMatch.id, parseInt(m) * 60);
                  }}>
                    {Math.max(0, Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime)/60))}:
                    {String(Math.max(0, ( (liveMatch.start_time || 0) + liveMatch.duration - currentTime )%60)).padStart(2, '0')}
                  </span>
                  <button className="t-adj" onClick={() => addExtraTime(liveMatch.id)}>+</button>
                </div>
                <button className="extra-time-btn" onClick={() => addExtraTime(liveMatch.id)}>+1 MIN</button>
              </div>

              <div className="battle-view">
                {/* Team A Pod */}
                <div className={`team-pod red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_a_id } : m))}>
                  <div className="pod-inner">
                    <div className="pod-header">
                      <div className="team-initials">{getTeamName(liveMatch.team_a_id).substring(0,2).toUpperCase()}</div>
                      <h3 className="team-name">{getTeamName(liveMatch.team_a_id)}</h3>
                    </div>
                    <div className="pod-score-large">{liveMatch.score_team_a}</div>
                    <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                    <div className="pod-actions">
                      <button className="pod-btn ball-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>+ BALL</button>
                      <button className="pod-btn black-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>+ BLACK</button>
                    </div>
                  </div>
                  <div className="active-glow"></div>
                </div>

                <div className="vs-core">
                  <div className="vs-ring"></div>
                  <div className="vs-text">VS</div>
                </div>

                {/* Team B Pod */}
                <div className={`team-pod blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_b_id } : m))}>
                  <div className="pod-inner">
                    <div className="pod-header">
                      <div className="team-initials">{getTeamName(liveMatch.team_b_id).substring(0,2).toUpperCase()}</div>
                      <h3 className="team-name">{getTeamName(liveMatch.team_b_id)}</h3>
                    </div>
                    <div className="pod-score-large">{liveMatch.score_team_b}</div>
                    <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                    <div className="pod-actions">
                      <button className="pod-btn ball-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>+ BALL</button>
                      <button className="pod-btn black-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>+ BLACK</button>
                    </div>
                  </div>
                  <div className="active-glow"></div>
                </div>
              </div>

              {createdMatches.length > 0 && (
                <div className="queue-overlay slide-in">
                  <div className="queue-header">
                    <div className="queue-title">UPCOMING DUELS ({createdMatches.length})</div>
                    <button className="shuffle-btn" onClick={shuffleQueue}>🎲 SHUFFLE QUEUE</button>
                  </div>
                  <div className="queue-track">
                    {createdMatches.slice(0, 3).map((m, i) => (
                      <div key={m.id} className="queue-item">
                        <span className="q-idx">{i + 1}</span>
                        <span className="q-names">{getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}</span>
                      </div>
                    ))}
                    {createdMatches.length > 3 && <div className="queue-more">+{createdMatches.length - 3} MORE</div>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="arena-setup-mid-tournament slide-in">
              <div className="setup-card animate-in" style={{ padding: '2rem' }}>
                <h3 className="glow-text">Manage Tournament</h3>
                <p className="muted">Add new players or launch the next match.</p>
                
                <div className="mid-setup-controls" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                  <div className="roster-input-wrapper" style={{ margin: 0, width: '300px' }}>
                    <input className="premium-input-v2" placeholder="New entry..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTeam()} />
                    <button className="add-roster-btn" onClick={addTeam}>ADD</button>
                  </div>
                  {createdMatches.length > 0 ? (
                    <button className="button button-gold" onClick={() => setMatches(matches.map(m => m.id === createdMatches[0].id ? { ...m, status: 'LIVE', start_time: currentTime } : m))}>
                      START NEXT MATCH
                    </button>
                  ) : (
                    <button className="button button-secondary" disabled>QUEUE EMPTY</button>
                  )}
                </div>

                {createdMatches.length > 0 && (
                  <div className="queue-section-mid mt-8">
                    <div className="queue-header" style={{ marginBottom: '1rem' }}>
                      <span className="section-label-v2">MATCH QUEUE</span>
                      <button className="shuffle-btn" onClick={shuffleQueue}>🎲 SHUFFLE</button>
                    </div>
                    <div className="queue-list-mid">
                      {createdMatches.map((m, i) => (
                        <div key={m.id} className="mid-queue-item">
                          <span className="q-idx">#{i+1}</span>
                          <span className="q-pair">{getTeamName(m.team_a_id)} vs {getTeamName(m.team_b_id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="quick-roster-summary mt-6" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {teams.map(t => (
                    <div key={t.id} className="mini-team-chip">
                      {t.name} <span className="matches-dot">{t.matches_played}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="premium-standings slide-in">
          <div className="standings-grid-v2">
            {[...teams].sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => {
              const isTop3 = i < 3;
              const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
              
              return (
                <div key={t.id} className={`standing-card-v2 ${rankClass}`}>
                  <div className="rank-indicator">
                    {i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                  </div>
                  <div className="team-info">
                    <div className="team-name">{t.name}</div>
                    <div className="team-status">{t.matches_played} MATCHES PLAYED</div>
                  </div>
                  <div className="stats-row">
                    <div className="stat">
                      <div className="stat-label">WINS</div>
                      <div className="stat-val win">{t.group_points}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">SCORE</div>
                      <div className="stat-val score">{t.total_score}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
