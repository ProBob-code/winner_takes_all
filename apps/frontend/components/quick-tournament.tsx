"use client";

import React, { useState, useEffect } from "react";
import "@/components/tournament-engine.css";

type Team = {
  id: string;
  name: string;
  matches_played: number;
  group_points: number; // Matches won
  total_score: number;  // Total points accumulated
};

type Match = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  score_team_a: number;
  score_team_b: number;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  status: 'CREATED' | 'LIVE' | 'COMPLETED';
  winner_id: string | null;
  active_team_id: string | null;
  duration: number;
  start_time: number | null;
  round: string;
};

type Format = "KNOCKOUT" | "GROUP_STAGE";

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [format, setFormat] = useState<Format>("GROUP_STAGE");
  const [matchesPerTeam, setMatchesPerTeam] = useState(2);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'matches' | 'standings'>('matches');
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // Sync with LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("wta_arena_quick_v3");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setIsStarted(parsed.isStarted || false);
      setFormat(parsed.format || "GROUP_STAGE");
      setMatchesPerTeam(parsed.matchesPerTeam || 2);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_arena_quick_v3", JSON.stringify({ teams, matches, isStarted, format, matchesPerTeam }));
  }, [teams, matches, isStarted, format, matchesPerTeam]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    setTeams([...teams, { 
      id: Math.random().toString(36).substr(2, 9), 
      name: newTeamName.trim(),
      matches_played: 0, group_points: 0, total_score: 0
    }]);
    setNewTeamName("");
  };

  const startTournament = () => {
    if (teams.length < 2) return;
    const initialMatches: Match[] = [];
    
    if (format === "KNOCKOUT") {
      // Basic single elimination bracket generation
      for (let i = 0; i < teams.length; i += 2) {
        initialMatches.push(createMatchObject(`ko-${i}`, teams[i].id, teams[i+1]?.id || null, 'Round 1'));
      }
    } else {
      // Group Stage: Round Robin with limit
      let matchCount = 0;
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          if (matchCount >= (teams.length * matchesPerTeam) / 2) break;
          initialMatches.push(createMatchObject(`g-${matchCount++}`, teams[i].id, teams[j].id, 'Group'));
        }
      }
    }
    setMatches(initialMatches);
    setIsStarted(true);
  };

  const createMatchObject = (id: string, t1: string, t2: string | null, round: string): Match => ({
    id, team_a_id: t1, team_b_id: t2 || 'BYE',
    score_team_a: 0, score_team_b: 0,
    balls_potted_a: 0, balls_potted_b: 0,
    black_potted_a: false, black_potted_b: false,
    status: t2 ? 'CREATED' : 'COMPLETED',
    winner_id: t2 ? null : t1,
    active_team_id: null, duration: 600, start_time: null, round
  });

  const updateScore = (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'MISTAKE') => {
    const updatedMatches = matches.map(m => {
      if (m.id !== matchId || m.status !== 'LIVE') return m;
      const nm = { ...m };
      const isA = m.team_a_id === teamId;
      const points = type === 'BLACK' ? 30 : 10;

      if (isA) {
        if (type === 'BALL') nm.balls_potted_a = Math.min(7, nm.balls_potted_a + 1);
        if (type === 'BLACK') nm.black_potted_a = true;
        nm.score_team_a += points;
      } else {
        if (type === 'BALL') nm.balls_potted_b = Math.min(7, nm.balls_potted_b + 1);
        if (type === 'BLACK') nm.black_potted_b = true;
        nm.score_team_b += points;
      }

      // Win Condition: Race to 100
      if (nm.score_team_a >= 100 || nm.score_team_b >= 100) {
        nm.status = 'COMPLETED';
        nm.winner_id = nm.score_team_a >= 100 ? nm.team_a_id : nm.team_b_id;
        finalizeMatch(nm);
      }
      return nm;
    });
    setMatches(updatedMatches);
  };

  const finalizeMatch = (m: Match) => {
    setTeams(prev => prev.map(t => {
      if (t.id === m.team_a_id) {
        return { ...t, matches_played: t.matches_played + 1, total_score: t.total_score + m.score_team_a, group_points: t.group_points + (m.winner_id === t.id ? 1 : 0) };
      }
      if (t.id === m.team_b_id) {
        return { ...t, matches_played: t.matches_played + 1, total_score: t.total_score + m.score_team_b, group_points: t.group_points + (m.winner_id === t.id ? 1 : 0) };
      }
      return t;
    }));
  };

  const startMatch = (matchId: string) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, status: 'LIVE', start_time: Math.floor(Date.now() / 1000) } : m));
  };

  const reset = () => {
    if (confirm("Reset tournament? All progress will be lost.")) {
      setTeams([]); setMatches([]); setIsStarted(false);
      localStorage.removeItem("wta_arena_quick_v3");
    }
  };

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

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || "BYE";

  if (!isStarted) {
    return (
      <div className="setup-container slide-in">
        <div className="setup-header">
          <h2 className="glow-text">The Arena Setup</h2>
          <p className="muted">Define your showdown rules and roster.</p>
        </div>
        
        <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Rules Panel */}
          <div className="panel page-card" style={{ padding: '2rem' }}>
            <h3 className="section-label" style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.7rem', marginBottom: '1.5rem' }}>CONFIGURATION</h3>
            
            <div className="setting-group" style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, marginBottom: '0.5rem', opacity: 0.6 }}>TOURNAMENT FORMAT</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`button ${format === 'KNOCKOUT' ? 'button-primary' : 'button-secondary'}`} style={{ flex: 1 }} onClick={() => setFormat('KNOCKOUT')}>🏆 KNOCKOUT</button>
                <button className={`button ${format === 'GROUP_STAGE' ? 'button-primary' : 'button-secondary'}`} style={{ flex: 1 }} onClick={() => setFormat('GROUP_STAGE')}>📊 GROUP</button>
              </div>
            </div>

            {format === 'GROUP_STAGE' && (
              <div className="setting-group">
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, marginBottom: '0.5rem', opacity: 0.6 }}>MATCHES PER TEAM</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button className="button button-secondary" style={{ width: '40px' }} onClick={() => setMatchesPerTeam(Math.max(1, matchesPerTeam - 1))}>-</button>
                  <span style={{ fontSize: '1.5rem', fontWeight: 900 }}>{matchesPerTeam}</span>
                  <button className="button button-secondary" style={{ width: '40px' }} onClick={() => setMatchesPerTeam(matchesPerTeam + 1)}>+</button>
                </div>
              </div>
            )}
          </div>

          {/* Roster Panel */}
          <div className="panel page-card" style={{ padding: '2rem' }}>
            <h3 className="section-label" style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.7rem', marginBottom: '1.5rem' }}>ROSTER ({teams.length})</h3>
            <div className="team-input-row" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                placeholder="Team/Player name..." 
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && addTeam()}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem 1rem', color: 'white' }}
              />
              <button className="button button-primary" onClick={addTeam}>ADD</button>
            </div>
            <div className="roster-scroll" style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {teams.map(t => (
                <div key={t.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  {t.name}
                  <button onClick={() => setTeams(teams.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button 
          className="button button-gold btn-glow mt-8" 
          disabled={teams.length < 2} 
          onClick={startTournament}
          style={{ width: '100%', padding: '1.5rem', fontSize: '1.1rem' }}
        >
          BEGIN TOURNAMENT
        </button>
      </div>
    );
  }

  const liveMatch = matches.find(m => m.status === 'LIVE');
  const createdMatches = matches.filter(m => m.status === 'CREATED');
  const lastCompleted = [...matches].reverse().find(m => m.status === 'COMPLETED' && m.team_b_id !== 'BYE');

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="engine-container animate-in">
      <div className="arena-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 className="glow-text">The Arena</h2>
          <div className="phase-badge">{format.replace("_", " ")}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`button button-sm ${activeSubTab === 'matches' ? 'button-primary' : 'button-secondary'}`} onClick={() => setActiveSubTab('matches')}>MATCHES</button>
          <button className={`button button-sm ${activeSubTab === 'standings' ? 'button-primary' : 'button-secondary'}`} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          <button className="button button-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={reset}>RESET</button>
        </div>
      </div>

      {activeSubTab === 'standings' ? (
        <div className="standings-card slide-in">
          <table className="standings-table" style={{ width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th style={{ padding: '1rem' }}>RANK</th>
                <th>TEAM</th>
                <th>P</th>
                <th>W</th>
                <th>SCORE</th>
              </tr>
            </thead>
            <tbody>
              {[...teams].sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '1.25rem' }}>#{i+1}</td>
                  <td style={{ fontWeight: 700 }}>{t.name}</td>
                  <td>{t.matches_played}</td>
                  <td style={{ color: 'var(--accent-primary)' }}>{t.group_points}</td>
                  <td style={{ fontWeight: 900, color: 'var(--gold)' }}>{t.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="center-stage slide-in">
            {liveMatch ? (
              <>
                <div className="match-status-indicator">
                  <div className="live-dot"></div>
                  LIVE • {formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}
                </div>
                
                <div className="score-arena" style={{ width: '100%', gap: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {/* Team A */}
                  <div 
                    className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`}
                    onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_a_id } : m))}
                    style={{ flex: 1, padding: '2rem', textAlign: 'center', borderRadius: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.2rem', marginBottom: '0.5rem' }}>{getTeamName(liveMatch.team_a_id)}</div>
                    <div style={{ fontSize: '3rem', fontWeight: 900 }}>{liveMatch.score_team_a}</div>
                    <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                    <div className="control-grid" style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>BALL +10</button>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem', background: '#111' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>BLACK +30</button>
                    </div>
                  </div>

                  <div className="vs-orb" style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 900 }}>VS</div>

                  {/* Team B */}
                  <div 
                    className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`}
                    onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_b_id } : m))}
                    style={{ flex: 1, padding: '2rem', textAlign: 'center', borderRadius: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div style={{ color: '#3b82f6', fontWeight: 900, fontSize: '1.2rem', marginBottom: '0.5rem' }}>{getTeamName(liveMatch.team_b_id)}</div>
                    <div style={{ fontSize: '3rem', fontWeight: 900 }}>{liveMatch.score_team_b}</div>
                    <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                    <div className="control-grid" style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>BALL +10</button>
                      <button className="button button-secondary" style={{ fontSize: '0.7rem', background: '#111' }} onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>BLACK +30</button>
                    </div>
                  </div>
                </div>
              </>
            ) : lastCompleted ? (
              <div className="results-overlay slide-in">
                <div className="winner-announcement">Match Finished</div>
                <div className="winner-name">{getTeamName(lastCompleted.winner_id!)} WINS!</div>
                <div className="final-score-row" style={{ display: 'flex', gap: '2rem', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, marginBottom: '2rem' }}>
                  <span style={{ color: '#ef4444' }}>{lastCompleted.score_team_a}</span>
                  <span style={{ opacity: 0.2 }}>-</span>
                  <span style={{ color: '#3b82f6' }}>{lastCompleted.score_team_b}</span>
                </div>
                {createdMatches.length > 0 ? (
                  <button className="button button-primary" onClick={() => startMatch(createdMatches[0].id)}>START NEXT MATCH</button>
                ) : (
                  <p className="muted">Tournament Completed</p>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem' }}>
                <h3 className="glow-text" style={{ fontSize: '2rem' }}>Ready to Launch</h3>
                <p className="muted mt-2">The arena is prepared for the first showdown.</p>
                <button className="button button-gold btn-glow mt-8" onClick={() => startMatch(createdMatches[0].id)}>START MATCH #1</button>
              </div>
            )}
          </div>

          <div className="match-queue-section slide-in">
            <h3 className="section-label" style={{ fontSize: '0.7rem', color: 'var(--gold)', letterSpacing: '2px', marginBottom: '1.5rem' }}>UPCOMING QUEUE</h3>
            <div className="queue-grid" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {createdMatches.map((m, i) => (
                <div key={m.id} className="queue-item" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ opacity: 0.3, fontWeight: 900 }}>#{i+1}</span>
                    <span style={{ fontWeight: 700 }}>{getTeamName(m.team_a_id)} <span style={{ opacity: 0.2, fontSize: '0.8rem' }}>VS</span> {getTeamName(m.team_b_id)}</span>
                  </div>
                  {i === 0 && !liveMatch && <button className="button button-sm button-primary" onClick={() => startMatch(m.id)}>START</button>}
                </div>
              ))}
              {createdMatches.length === 0 && !liveMatch && (
                <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px' }}>
                  <p className="muted">No more matches in queue.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
