"use client";

import React, { useState, useEffect } from "react";
import "@/components/tournament-engine.css";

type Team = {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  balls_potted: number;
  black_potted: boolean;
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
  order: number;
};

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'arena' | 'standings'>('arena');
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // Sync with LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("wta_arena_quick_v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setIsStarted(parsed.isStarted || false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_arena_quick_v2", JSON.stringify({ teams, matches, isStarted }));
  }, [teams, matches, isStarted]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    setTeams([...teams, { 
      id: Math.random().toString(36).substr(2, 9), 
      name: newTeamName.trim(),
      matches_played: 0, group_points: 0, total_score: 0,
      balls_potted: 0, black_potted: false
    }]);
    setNewTeamName("");
  };

  const startTournament = () => {
    if (teams.length < 2) return;
    const initialMatches: Match[] = [];
    let matchCount = 0;
    // Simple Round Robin (2 matches each roughly)
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        if (matchCount >= teams.length) break; // Limit to 2ish matches per team for 'quick'
        initialMatches.push({
          id: `m-${matchCount}`,
          team_a_id: teams[i].id,
          team_b_id: teams[j].id,
          score_team_a: 0,
          score_team_b: 0,
          balls_potted_a: 0,
          balls_potted_b: 0,
          black_potted_a: false,
          black_potted_b: false,
          status: 'CREATED',
          winner_id: null,
          active_team_id: null,
          duration: 600,
          start_time: null,
          order: matchCount++
        });
      }
    }
    setMatches(initialMatches);
    setIsStarted(true);
  };

  const updateScore = (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'MISTAKE') => {
    const updatedMatches = matches.map(m => {
      if (m.id !== matchId || m.status !== 'LIVE') return m;
      const isA = m.team_a_id === teamId;
      const nm = { ...m };
      const points = type === 'BLACK' ? 30 : 10;

      if (isA) {
        if (type === 'BALL') nm.balls_potted_a++;
        if (type === 'BLACK') nm.black_potted_a = true;
        nm.score_team_a += points;
      } else {
        if (type === 'BALL') nm.balls_potted_b++;
        if (type === 'BLACK') nm.black_potted_b = true;
        nm.score_team_b += points;
      }

      // Check win
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
        return { 
          ...t, 
          matches_played: t.matches_played + 1,
          total_score: t.total_score + m.score_team_a,
          group_points: t.group_points + (m.winner_id === t.id ? 1 : 0)
        };
      }
      if (t.id === m.team_b_id) {
        return { 
          ...t, 
          matches_played: t.matches_played + 1,
          total_score: t.total_score + m.score_team_b,
          group_points: t.group_points + (m.winner_id === t.id ? 1 : 0)
        };
      }
      return t;
    }));
  };

  const startMatch = (matchId: string) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, status: 'LIVE', start_time: Math.floor(Date.now() / 1000) } : m));
  };

  const highlightTeam = (matchId: string, teamId: string) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, active_team_id: teamId } : m));
  };

  const reset = () => {
    if (confirm("Reset tournament? All records will be wiped.")) {
      setTeams([]); setMatches([]); setIsStarted(false);
      localStorage.removeItem("wta_arena_quick_v2");
    }
  };

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || "Unknown";

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

  if (!isStarted) {
    return (
      <div className="setup-view slide-in">
        <div className="standings-card">
          <h3 className="glow-text">Arena Roster</h3>
          <div className="team-input-row" style={{ margin: "1.5rem 0" }}>
            <input placeholder="Add team name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTeam()} />
            <button className="button button-primary" onClick={addTeam}>ADD</button>
          </div>
          <div className="roster-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {teams.map(t => (
              <div key={t.id} className="roster-item" style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '10px' }}>
                {t.name} <button onClick={() => setTeams(teams.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: '#ef4444' }}>×</button>
              </div>
            ))}
          </div>
          {teams.length >= 2 && <button className="button button-gold mt-8" style={{ width: '100%' }} onClick={startTournament}>BEGIN ARENA</button>}
        </div>
      </div>
    );
  }

  const liveMatch = matches.find(m => m.status === 'LIVE');
  const createdMatches = matches.filter(m => m.status === 'CREATED').sort((a,b) => a.order - b.order);
  const lastCompleted = [...matches].reverse().find(m => m.status === 'COMPLETED');

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
          <div className="phase-badge">QUICK MODE</div>
        </div>
        <div className="arena-tabs" style={{ display: 'flex', gap: '1rem' }}>
          <button className={`button button-sm ${activeSubTab === 'arena' ? 'button-primary' : 'button-secondary'}`} onClick={() => setActiveSubTab('arena')}>MATCHES</button>
          <button className={`button button-sm ${activeSubTab === 'standings' ? 'button-primary' : 'button-secondary'}`} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          <button className="button button-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={reset}>RESET</button>
        </div>
      </div>

      {activeSubTab === 'standings' ? (
        <div className="standings-card">
          <table className="standings-table">
            <thead><tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>Score</th></tr></thead>
            <tbody>
              {[...teams].sort((a,b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => (
                <tr key={t.id}>
                  <td className="rank-cell">#{i+1}</td>
                  <td>{t.name}</td>
                  <td className="stat-cell">{t.matches_played}</td>
                  <td className="stat-cell">{t.group_points}</td>
                  <td className="stat-cell">{t.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="center-stage">
            {liveMatch ? (
              <>
                <div className="match-status-indicator">
                  <div className="live-dot"></div>
                  LIVE • {formatTime(Math.max(0, (liveMatch.start_time || 0) + liveMatch.duration - currentTime))}
                </div>
                <div className="score-arena" style={{ width: '100%', gap: '2rem' }}>
                  <div className={`team-arena-card red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} onClick={() => highlightTeam(liveMatch.id, liveMatch.team_a_id)}>
                    <div className="pod-name" style={{ color: '#ef4444' }}>{getTeamName(liveMatch.team_a_id)}</div>
                    <div className="pod-score">{liveMatch.score_team_a}</div>
                    <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                    <div className="control-grid" style={{ marginTop: '1.5rem' }}>
                      <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>BALL +10</button>
                      <button className="score-btn black" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>BLACK +30</button>
                    </div>
                  </div>
                  <div className="vs-orb">VS</div>
                  <div className={`team-arena-card blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} onClick={() => highlightTeam(liveMatch.id, liveMatch.team_b_id)}>
                    <div className="pod-name" style={{ color: '#3b82f6' }}>{getTeamName(liveMatch.team_b_id)}</div>
                    <div className="pod-score">{liveMatch.score_team_b}</div>
                    <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                    <div className="control-grid" style={{ marginTop: '1.5rem' }}>
                      <button className="score-btn ball" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>BALL +10</button>
                      <button className="score-btn black" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>BLACK +30</button>
                    </div>
                  </div>
                </div>
              </>
            ) : lastCompleted ? (
              <div className="results-overlay" style={{ padding: '2rem' }}>
                <div className="winner-announcement" style={{ fontSize: '0.8rem' }}>Last Match Result</div>
                <div className="winner-name" style={{ fontSize: '2rem' }}>{getTeamName(lastCompleted.winner_id!)} WINS!</div>
                <div className="final-score-row" style={{ gap: '2rem', marginBottom: '1rem' }}>
                  <span>{lastCompleted.score_team_a}</span> : <span>{lastCompleted.score_team_b}</span>
                </div>
                {createdMatches.length > 0 ? (
                  <button className="button button-primary" onClick={() => startMatch(createdMatches[0].id)}>START NEXT MATCH</button>
                ) : <p className="muted">All matches finished!</p>}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <h3 className="glow-text">Arena Ready</h3>
                <button className="button button-gold mt-6" onClick={() => startMatch(createdMatches[0].id)}>LAUNCH FIRST MATCH</button>
              </div>
            )}
          </div>

          <div className="match-queue-section" style={{ marginTop: '3rem' }}>
            <h3 className="section-label" style={{ marginBottom: '1.5rem', fontSize: '0.7rem' }}>UPCOMING QUEUE</h3>
            <div className="queue-grid" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {createdMatches.map((m, i) => (
                <div key={m.id} className="queue-item" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{getTeamName(m.team_a_id)} VS {getTeamName(m.team_b_id)}</span>
                  {i === 0 && !liveMatch && <button className="button button-sm button-secondary" onClick={() => startMatch(m.id)}>START</button>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
