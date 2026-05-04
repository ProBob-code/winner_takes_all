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
      const eligible = allTeams.filter(t => {
        const count = currentMatches.filter(m => m.team_a_id === t.id || m.team_b_id === t.id).length;
        return count < matchesPerTeam;
      });

      const paired = new Set<string>();
      for (let i = 0; i < eligible.length; i++) {
        const t1 = eligible[i];
        if (paired.has(t1.id)) continue;

        const t2 = eligible.find(potential => {
          if (potential.id === t1.id || paired.has(potential.id)) return false;
          return !currentMatches.some(m => (m.team_a_id === t1.id && m.team_b_id === potential.id) || (m.team_a_id === potential.id && m.team_b_id === t1.id));
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
      alert(`Arena Published! Share this link:\n${window.location.origin}/arena/${id}`);
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

  const reset = () => { if (confirm("Reset Arena?")) { setTeams([]); setMatches([]); setIsStarted(false); setArenaId(""); } };
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
              <span className="launch-text">{teams.length >= 2 ? 'INITIALIZE STADIUM ENGINE' : 'ADD MINIMUM 2 TEAMS'}</span>
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
      <div className="arena-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div><h2 className="glow-text">{arenaName}</h2><div className="phase-badge">ARENA {tournamentType}</div></div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`button button-sm ${activeSubTab === 'arena' ? 'button-primary' : 'button-secondary'}`} onClick={() => setActiveSubTab('arena')}>ARENA</button>
          <button className={`button button-sm ${activeSubTab === 'standings' ? 'button-primary' : 'button-secondary'}`} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          <button className={`button button-sm ${arenaId ? 'button-gold' : 'button-secondary'}`} onClick={publishArena} disabled={isPublishing}>
            {isPublishing ? 'PUBLISHING...' : arenaId ? '✅ SHARED' : '🔗 SHARE'}
          </button>
          <button className="button button-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={reset}>RESET</button>
        </div>
      </div>

      {activeSubTab === 'arena' ? (
        <div className="center-stage slide-in">
          {liveMatch ? (
            <>
              <div className="match-status-indicator"><div className="live-dot"></div>LIVE • {Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime)/60)}:{( (liveMatch.start_time || 0) + liveMatch.duration - currentTime )%60}</div>
              <div className="score-arena" style={{ width: '100%' }}>
                <div className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_a_id } : m))}>
                  <div className="pod-name" style={{ color: '#ef4444' }}>{getTeamName(liveMatch.team_a_id)}</div>
                  <div className="pod-score">{liveMatch.score_team_a}</div>
                  <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                  <div className="control-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '2rem' }}>
                    <button className="score-btn" style={{ background: '#ef4444' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>BALL</button>
                    <button className="score-btn" style={{ background: '#111', border: '1px solid #fff' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>BLACK</button>
                  </div>
                </div>
                <div className="vs-orb">VS</div>
                <div className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_b_id } : m))}>
                  <div className="pod-name" style={{ color: '#3b82f6' }}>{getTeamName(liveMatch.team_b_id)}</div>
                  <div className="pod-score">{liveMatch.score_team_b}</div>
                  <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                  <div className="control-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '2rem' }}>
                    <button className="score-btn" style={{ background: '#3b82f6' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>BALL</button>
                    <button className="score-btn" style={{ background: '#111', border: '1px solid #fff' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>BLACK</button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <h3 className="glow-text">Add Players Mid-Tournament</h3>
              <div className="team-input-row" style={{ maxWidth: '400px', margin: '1.5rem auto' }}>
                <input placeholder="Late entry..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTeam()} />
                <button className="button button-primary" onClick={addTeam}>ADD</button>
              </div>
              {createdMatches.length > 0 ? <button className="button button-gold mt-4" onClick={() => setMatches(matches.map(m => m.id === createdMatches[0].id ? { ...m, status: 'LIVE', start_time: currentTime } : m))}>START NEXT MATCH</button> : <p className="muted">No matches in queue.</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="standings-card slide-in">
          <table className="standings-table">
            <thead><tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>Score</th></tr></thead>
            <tbody>
              {[...teams].sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
                <tr key={t.id}><td>#{i+1}</td><td style={{ fontWeight: 900 }}>{t.name}</td><td>{t.matches_played}</td><td style={{ color: '#8b5cf6' }}>{t.group_points}</td><td style={{ fontWeight: 900, color: '#f59e0b' }}>{t.total_score}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
