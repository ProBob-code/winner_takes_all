"use client";

import React, { useState, useEffect } from "react";

type Team = {
  id: string;
  name: string;
  played: number;
  won: number;
  points: number;
  ballsLeftTotal: number;
};

type Match = {
  id: string;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  round: string;
  ballsLeft1: number;
  ballsLeft2: number;
  isCompleted: boolean;
};

type Format = "KNOCKOUT" | "GROUP_STAGE";

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [format, setFormat] = useState<Format>("KNOCKOUT");
  const [matchesPerTeam, setMatchesPerTeam] = useState(2);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'matches' | 'standings'>('matches');

  useEffect(() => {
    const saved = localStorage.getItem("wta_quick_tournament_pro");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setIsStarted(parsed.isStarted || false);
      setFormat(parsed.format || "KNOCKOUT");
      setMatchesPerTeam(parsed.matchesPerTeam || 2);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_quick_tournament_pro", JSON.stringify({ teams, matches, isStarted, format, matchesPerTeam }));
  }, [teams, matches, isStarted, format, matchesPerTeam]);

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    setTeams([...teams, { 
      id: Math.random().toString(36).substr(2, 9), 
      name: newTeamName.trim(),
      played: 0, won: 0, points: 0, ballsLeftTotal: 0
    }]);
    setNewTeamName("");
  };

  const startTournament = () => {
    if (teams.length < 2) return;
    const initialMatches: Match[] = [];
    if (format === "KNOCKOUT") {
      for (let i = 0; i < teams.length; i += 2) {
        initialMatches.push({
          id: `ko-${i}`, player1: teams[i].id, player2: teams[i+1] ? teams[i+1].id : null,
          winner: null, round: teams.length > 4 ? 'quarter' : 'semi',
          ballsLeft1: 7, ballsLeft2: 7, isCompleted: false
        });
      }
    } else {
      let matchCount = 0;
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < Math.min(i + 1 + matchesPerTeam, teams.length); j++) {
          initialMatches.push({
            id: `group-${matchCount++}`, player1: teams[i].id, player2: teams[j].id,
            winner: null, round: 'group', ballsLeft1: 7, ballsLeft2: 7, isCompleted: false
          });
        }
      }
    }
    setMatches(initialMatches);
    setIsStarted(true);
  };

  const completeMatch = (matchId: string, winnerId: string | null) => {
    const updatedMatches = matches.map(m => {
      if (m.id !== matchId) return m;
      return { ...m, winner: winnerId, isCompleted: true };
    });
    setMatches(updatedMatches);
    
    const newTeams = teams.map(t => {
      let played = 0, won = 0, points = 0, balls = 0;
      updatedMatches.forEach(m => {
        if (!m.isCompleted) return;
        if (m.player1 === t.id) {
          played++; balls += (7 - m.ballsLeft1);
          if (m.winner === t.id) { won++; points += 2; }
        } else if (m.player2 === t.id) {
          played++; balls += (7 - m.ballsLeft2);
          if (m.winner === t.id) { won++; points += 2; }
        }
      });
      return { ...t, played, won, points, ballsLeftTotal: balls };
    });
    setTeams(newTeams);
  };

  const reset = () => {
    if (confirm("Reset tournament? All records will be wiped.")) {
      setTeams([]); setMatches([]); setIsStarted(false);
      localStorage.removeItem("wta_quick_tournament_pro");
    }
  };

  const Protocol = () => (
    <div className="protocol-panel">
      <h3>📜 TOURNAMENT PROTOCOL</h3>
      <ul>
        <li><strong>Scoring:</strong> 2 Points for a match win, 0 for loss.</li>
        <li><strong>Ball Rule:</strong> Points are calculated automatically based on ball count (0-7).</li>
        <li><strong>Tie-Breaker:</strong> If points are equal, the team with most balls cleared wins.</li>
        {format === 'GROUP_STAGE' ? (
          <li><strong>Advancement:</strong> Each team plays {matchesPerTeam} matches. Top teams advance to brackets.</li>
        ) : (
          <li><strong>Advancement:</strong> Winners advance directly to the next round. Losers are eliminated.</li>
        )}
      </ul>
      <style jsx>{`
        .protocol-panel { background: var(--bg-surface); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 20px; margin-bottom: 2rem; color: var(--text-primary); }
        h3 { font-size: 0.75rem; letter-spacing: 2px; color: var(--gold); margin-bottom: 1rem; }
        ul { list-style: none; display: flex; flex-direction: column; gap: 0.75rem; }
        li { font-size: 0.8rem; line-height: 1.4; color: var(--text-secondary); }
        strong { color: var(--text-primary); }
      `}</style>
    </div>
  );

  if (!isStarted) {
    return (
      <div className="setup-container slide-in">
        <div className="setup-header">
          <h2 className="glow-text">The Arena Setup</h2>
          <p className="muted">Configure your tournament rules and roster.</p>
        </div>
        <div className="setup-grid">
          <div className="setup-card">
            <h3 className="section-label">FORMAT</h3>
            <div className="format-options">
              <button className={`format-btn ${format === 'KNOCKOUT' ? 'active' : ''}`} onClick={() => setFormat('KNOCKOUT')}>🏆 KNOCKOUT</button>
              <button className={`format-btn ${format === 'GROUP_STAGE' ? 'active' : ''}`} onClick={() => setFormat('GROUP_STAGE')}>📊 GROUP STAGE</button>
            </div>
            {format === 'GROUP_STAGE' && (
              <div className="setting-row">
                <label>Matches per Team</label>
                <div className="stepper">
                  <button onClick={() => setMatchesPerTeam(Math.max(1, matchesPerTeam - 1))}>-</button>
                  <span>{matchesPerTeam}</span>
                  <button onClick={() => setMatchesPerTeam(matchesPerTeam + 1)}>+</button>
                </div>
              </div>
            )}
          </div>
          <div className="setup-card">
            <h3 className="section-label">ROSTER ({teams.length})</h3>
            <div className="input-hub">
              <input placeholder="Team Name..." value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addTeam()} />
              <button onClick={addTeam}>ADD</button>
            </div>
            <div className="roster-grid">
              {teams.map(t => (
                <div key={t.id} className="roster-item">{t.name} <button onClick={() => setTeams(teams.filter(x => x.id !== t.id))}>×</button></div>
              ))}
            </div>
          </div>
        </div>
        <button className="start-btn" disabled={teams.length < 2} onClick={startTournament}>BEGIN TOURNAMENT</button>
        <style jsx>{`
          .setup-container { padding: 2rem; max-width: 900px; margin: 0 auto; }
          .setup-header { text-align: center; margin-bottom: 3rem; }
          .setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
          .setup-card { background: var(--bg-card); border: 1px solid var(--border-color); padding: 2rem; border-radius: 24px; }
          .section-label { font-size: 0.7rem; letter-spacing: 2px; color: var(--gold); margin-bottom: 1.5rem; }
          .format-options { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
          .format-btn { flex: 1; padding: 1rem; border-radius: 12px; border: 1px solid var(--border-color); background: none; color: var(--text-primary); cursor: pointer; font-weight: 800; font-size: 0.75rem; }
          .format-btn.active { background: var(--gold-subtle); border-color: var(--gold); }
          .stepper { display: flex; align-items: center; gap: 1.5rem; margin-top: 0.5rem; }
          .stepper button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-color); background: none; color: var(--text-primary); cursor: pointer; }
          .stepper span { font-weight: 900; color: var(--text-primary); }
          .input-hub { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
          .input-hub input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.75rem; color: var(--text-primary); }
          .input-hub button { padding: 0 1.5rem; border-radius: 10px; background: var(--gold); color: black; font-weight: 900; cursor: pointer; border: none; }
          .roster-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
          .roster-item { background: var(--bg-surface); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 10px; font-size: 0.8rem; display: flex; align-items: center; gap: 10px; color: var(--text-primary); }
          .roster-item button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1rem; }
          .start-btn { width: 100%; padding: 1.5rem; border-radius: 20px; border: none; background: var(--gradient-gold); color: black; font-weight: 900; letter-spacing: 2px; cursor: pointer; box-shadow: var(--shadow-lg); transition: transform 0.3s; }
          .start-btn:hover { transform: translateY(-3px); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="arena-container slide-in">
      <div className="arena-header">
        <div>
          <h2 className="glow-text">The Arena</h2>
          <div className="badge">{format.replace("_", " ")}</div>
        </div>
        <div className="arena-tabs">
          <button className={activeSubTab === 'matches' ? 'active' : ''} onClick={() => setActiveSubTab('matches')}>MATCHES</button>
          <button className={activeSubTab === 'standings' ? 'active' : ''} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          <button className="reset-btn" onClick={reset}>RESET</button>
        </div>
      </div>

      <Protocol />

      {activeSubTab === 'standings' ? (
        <div className="table-wrapper">
          <table className="standings-table">
            <thead>
              <tr><th>RANK</th><th>TEAM</th><th>P</th><th>W</th><th>BALLS</th><th>PTS</th></tr>
            </thead>
            <tbody>
              {[...teams].sort((a,b) => b.points - a.points || b.ballsLeftTotal - a.ballsLeftTotal).map((t, idx) => (
                <tr key={t.id} className={idx === 0 ? 'leader' : ''}>
                  <td>{idx === 0 ? '🏆' : `#${idx+1}`}</td>
                  <td className="team-name">{t.name}</td>
                  <td>{t.played}</td>
                  <td>{t.won}</td>
                  <td>{t.ballsLeftTotal}</td>
                  <td className="pts">{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="match-grid">
          {matches.map(m => {
            const t1 = teams.find(t => t.id === m.player1);
            const t2 = teams.find(t => t.id === m.player2);
            return (
              <div key={m.id} className={`match-card ${m.isCompleted ? 'done' : ''}`}>
                <div className="match-label">{m.round.toUpperCase()} MATCH</div>
                <div className="stadium">
                  <div className="side">
                    <div className="emblem">{t1?.name.charAt(0)}</div>
                    <div className="name">{t1?.name}</div>
                    {!m.isCompleted && (
                      <div className="input-group">
                        <label>BALLS LEFT (0-7)</label>
                        <input type="number" min="0" max="7" value={m.ballsLeft1} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, ballsLeft1: Math.min(7, Math.max(0, parseInt(e.target.value) || 0))} : x))} />
                      </div>
                    )}
                    {m.isCompleted && <div className="result">{7 - m.ballsLeft1} CLEARED</div>}
                  </div>
                  <div className="vs-hub">VS</div>
                  <div className="side">
                    <div className="emblem">{t2?.name ? t2.name.charAt(0) : '?'}</div>
                    <div className="name">{t2?.name || "BYE"}</div>
                    {!m.isCompleted && t2 && (
                      <div className="input-group">
                        <label>BALLS LEFT (0-7)</label>
                        <input type="number" min="0" max="7" value={m.ballsLeft2} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, ballsLeft2: Math.min(7, Math.max(0, parseInt(e.target.value) || 0))} : x))} />
                      </div>
                    )}
                    {m.isCompleted && t2 && <div className="result">{7 - m.ballsLeft2} CLEARED</div>}
                  </div>
                </div>
                {!m.isCompleted && t2 && (
                  <div className="actions">
                    <button onClick={() => completeMatch(m.id, m.player1)}>WINNER: {t1?.name}</button>
                    <button onClick={() => completeMatch(m.id, m.player2)}>WINNER: {t2?.name}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <style jsx>{`
        .arena-container { padding: 1rem; }
        .arena-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .badge { display: inline-block; font-size: 0.6rem; font-weight: 900; background: var(--gold-subtle); color: var(--gold); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--gold); margin-top: 4px; }
        .arena-tabs { display: flex; gap: 0.5rem; background: var(--bg-surface); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color); }
        .arena-tabs button { padding: 0.6rem 1rem; border-radius: 10px; border: none; background: none; color: var(--text-muted); font-size: 0.7rem; font-weight: 900; cursor: pointer; }
        .arena-tabs button.active { background: var(--gradient-primary); color: white; }
        .reset-btn { color: #ef4444 !important; background: rgba(239, 68, 68, 0.1) !important; margin-left: 0.5rem; }
        
        .match-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
        @media (min-width: 768px) { .match-grid { grid-template-columns: 1fr; } }
        
        .match-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 32px; padding: 2rem; transition: all 0.3s; }
        .match-card.done { opacity: 0.6; }
        .match-label { font-size: 0.6rem; letter-spacing: 2px; color: var(--gold); margin-bottom: 1.5rem; }
        .stadium { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .side { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 120px; text-align: center; }
        .emblem { width: 50px; height: 50px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 15px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 900; color: var(--text-primary); margin-bottom: 0.5rem; }
        .name { font-size: 1.1rem; font-weight: 900; color: var(--text-primary); margin-bottom: 1rem; }
        .input-group label { display: block; font-size: 0.6rem; font-weight: 900; color: var(--text-muted); margin-bottom: 4px; }
        .input-group input { width: 60px; height: 40px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 10px; color: var(--text-primary); text-align: center; font-weight: 900; }
        .vs-hub { font-size: 0.75rem; font-weight: 900; color: var(--text-muted); padding: 10px; border: 1px solid var(--border-color); border-radius: 50%; }
        .result { font-weight: 900; color: var(--gold); font-size: 0.8rem; }
        .actions { display: flex; gap: 0.5rem; margin-top: 2rem; width: 100%; }
        .actions button { flex: 1; padding: 0.75rem; border-radius: 12px; border: 1px solid var(--gold-subtle); background: var(--gold-subtle); color: var(--gold); font-weight: 900; font-size: 0.7rem; cursor: pointer; transition: all 0.3s; }
        .actions button:hover { background: var(--gold); color: black; }

        .table-wrapper { overflow-x: auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 24px; }
        .standings-table { width: 100%; border-collapse: collapse; text-align: left; }
        .standings-table th { padding: 1.25rem; font-size: 0.65rem; color: var(--text-muted); letter-spacing: 1px; }
        .standings-table td { padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.02); color: var(--text-primary); font-size: 0.9rem; }
        .leader { background: var(--gold-subtle); }
        .pts { font-weight: 900; color: var(--gold); }
      `}</style>
    </div>
  );
}
