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
  round: string; // 'group', 'semi', 'final'
  score1: number;
  score2: number;
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
  const [rules, setRules] = useState("Standard 8-Ball rules. 2 points for a win, 0 for loss. Group leaders advance.");
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'matches' | 'standings'>('matches');

  useEffect(() => {
    const saved = localStorage.getItem("wta_quick_tournament_pro");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setRules(parsed.rules || "");
      setIsStarted(parsed.isStarted || false);
      setFormat(parsed.format || "KNOCKOUT");
      setMatchesPerTeam(parsed.matchesPerTeam || 2);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_quick_tournament_pro", JSON.stringify({ teams, matches, rules, isStarted, format, matchesPerTeam }));
  }, [teams, matches, rules, isStarted, format, matchesPerTeam]);

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
          id: `ko-${i}`,
          player1: teams[i].id,
          player2: teams[i+1] ? teams[i+1].id : null,
          winner: null,
          round: teams.length > 4 ? 'quarter' : 'semi',
          score1: 0, score2: 0, ballsLeft1: 7, ballsLeft2: 7,
          isCompleted: false
        });
      }
    } else {
      const teamIds = teams.map(t => t.id);
      let matchCount = 0;
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < Math.min(i + 1 + matchesPerTeam, teamIds.length); j++) {
          initialMatches.push({
            id: `group-${matchCount++}`,
            player1: teamIds[i],
            player2: teamIds[j],
            winner: null,
            round: 'group',
            score1: 0, score2: 0, ballsLeft1: 7, ballsLeft2: 7,
            isCompleted: false
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
          played++;
          balls += m.ballsLeft1;
          if (m.winner === t.id) { won++; points += 2; }
        } else if (m.player2 === t.id) {
          played++;
          balls += m.ballsLeft2;
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

  const completedCount = matches.filter(m => m.isCompleted).length;
  const progressPercent = matches.length > 0 ? (completedCount / matches.length) * 100 : 0;

  if (!isStarted) {
    return (
      <div className="arena-setup-container slide-in">
        <div className="setup-header">
          <h2 className="display-text glow-text">Tournament Architect</h2>
          <p className="muted">Craft your professional local showdown.</p>
        </div>
        
        <div className="setup-grid">
          <div className="setup-card">
            <h3 className="section-label">FORMAT & RULES</h3>
            <div className="format-options">
              <button 
                className={`format-btn ${format === 'KNOCKOUT' ? 'active' : ''}`}
                onClick={() => setFormat('KNOCKOUT')}
              >
                <div className="icon">🏆</div>
                <div className="info">
                  <strong>KNOCKOUT</strong>
                  <span>Direct Elimination</span>
                </div>
              </button>
              <button 
                className={`format-btn ${format === 'GROUP_STAGE' ? 'active' : ''}`}
                onClick={() => setFormat('GROUP_STAGE')}
              >
                <div className="icon">📊</div>
                <div className="info">
                  <strong>GROUP STAGE</strong>
                  <span>Round Robin Points</span>
                </div>
              </button>
            </div>

            {format === 'GROUP_STAGE' && (
              <div className="setting-row mt-6">
                <label>Matches per Team</label>
                <div className="number-stepper">
                  <button onClick={() => setMatchesPerTeam(Math.max(1, matchesPerTeam - 1))}>-</button>
                  <input type="number" value={matchesPerTeam} readOnly />
                  <button onClick={() => setMatchesPerTeam(matchesPerTeam + 1)}>+</button>
                </div>
              </div>
            )}
          </div>

          <div className="setup-card">
            <h3 className="section-label">ROSTER ({teams.length})</h3>
            <div className="team-input-hub">
              <input 
                placeholder="Enter Team Name..." 
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTeam()}
              />
              <button className="add-btn" onClick={addTeam}>JOIN</button>
            </div>
            
            <div className="roster-list">
              {teams.length === 0 ? (
                <div className="empty-roster">No teams added yet</div>
              ) : (
                teams.map(t => (
                  <div key={t.id} className="roster-item">
                    <span>{t.name}</span>
                    <button className="remove-team" onClick={() => setTeams(teams.filter(x => x.id !== t.id))}>×</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <button 
          className="launch-btn" 
          disabled={teams.length < 2}
          onClick={startTournament}
        >
          INITIALIZE ARENA
        </button>

        <style jsx>{`
          .arena-setup-container { padding: 2rem; }
          .setup-header { text-align: center; margin-bottom: 3rem; }
          .display-text { font-size: 2.5rem; font-weight: 900; letter-spacing: -1px; }
          .setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 3rem; }
          .setup-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 24px; padding: 2rem; }
          .section-label { font-size: 0.7rem; font-weight: 900; letter-spacing: 2px; color: var(--gold); margin-bottom: 1.5rem; text-transform: uppercase; }
          
          .format-options { display: flex; flex-direction: column; gap: 1rem; }
          .format-btn { 
            display: flex; gap: 1.25rem; align-items: center; padding: 1.25rem; border-radius: 16px; 
            background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); text-align: left; transition: all 0.3s; color: white; cursor: pointer;
          }
          .format-btn.active { background: var(--gold-subtle); border-color: var(--gold); }
          .format-btn .icon { font-size: 1.5rem; }
          .format-btn strong { display: block; font-size: 0.9rem; }
          .format-btn span { font-size: 0.7rem; color: var(--text-muted); }

          .number-stepper { display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; }
          .number-stepper button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-color); background: none; color: white; cursor: pointer; }
          .number-stepper input { width: 40px; text-align: center; background: none; border: none; color: white; font-weight: 800; font-size: 1.2rem; }

          .team-input-hub { display: flex; gap: 0.5rem; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color); }
          .team-input-hub input { flex: 1; background: none; border: none; color: white; padding: 0.75rem 1rem; outline: none; }
          .add-btn { background: var(--gold); color: black; font-weight: 900; padding: 0 1.5rem; border-radius: 8px; font-size: 0.75rem; cursor: pointer; }

          .roster-list { margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
          .roster-item { background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 10px; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
          .remove-team { background: none; border: none; color: var(--red); cursor: pointer; font-size: 1.2rem; }

          .launch-btn { 
            width: 100%; padding: 1.5rem; border-radius: 16px; border: none; background: var(--gradient-gold); color: black; font-weight: 900; 
            font-size: 1.1rem; letter-spacing: 2px; cursor: pointer; transition: all 0.3s; box-shadow: 0 10px 30px rgba(217, 119, 6, 0.3);
          }
          .launch-btn:hover:not(:disabled) { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(217, 119, 6, 0.5); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="pro-manager-arena slide-in">
      <div className="arena-topbar">
        <div className="branding">
          <h2 className="display-text-sm">Pro Manager</h2>
          <div className="status-pill">
            <span className="dot animate-pulse"></span>
            {format.replace("_", " ")} ACTIVE
          </div>
        </div>

        <div className="arena-controls">
          <div className="sub-switcher">
            <button className={activeSubTab === 'matches' ? 'active' : ''} onClick={() => setActiveSubTab('matches')}>MATCHES</button>
            <button className={activeSubTab === 'standings' ? 'active' : ''} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          </div>
          <button className="reset-btn" onClick={reset}>RESET</button>
        </div>
      </div>

      <div className="arena-progress-hub">
        <div className="progress-info">
          <span>{completedCount} OF {matches.length} MATCHES COMPLETED</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
        </div>
      </div>

      {activeSubTab === 'standings' ? (
        <div className="standings-board slide-in">
          <div className="board-header">LIVE STANDINGS</div>
          <table className="standings-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>TEAM</th>
                <th>P</th>
                <th>W</th>
                <th>BALLS</th>
                <th className="highlight">PTS</th>
              </tr>
            </thead>
            <tbody>
              {[...teams].sort((a,b) => b.points - a.points || a.ballsLeftTotal - b.ballsLeftTotal).map((t, idx) => (
                <tr key={t.id} className={idx === 0 ? 'top-team' : ''}>
                  <td>{idx === 0 ? '🏆' : `#${idx + 1}`}</td>
                  <td className="team-name">{t.name}</td>
                  <td>{t.played}</td>
                  <td>{t.won}</td>
                  <td>{t.ballsLeftTotal}</td>
                  <td className="points">{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="match-arena-grid slide-in">
          {matches.map(m => {
            const t1 = teams.find(t => t.id === m.player1);
            const t2 = teams.find(t => t.id === m.player2);
            
            return (
              <div key={m.id} className={`battle-card ${m.isCompleted ? 'archived' : 'active'}`}>
                <div className="battle-header">
                  <span className="match-tag">{m.round.toUpperCase()} SHOWDOWN</span>
                  {m.isCompleted && <span className="status-badge">FINALIZED</span>}
                </div>
                
                <div className="battle-arena">
                  <div className={`competitor side-left ${m.winner === m.player1 ? 'victorious' : ''}`}>
                    <div className="team-emblem">{t1?.name.charAt(0)}</div>
                    <h4 className="name">{t1?.name || "TBD"}</h4>
                    {!m.isCompleted && (
                      <div className="score-inputs">
                        <div className="input-group">
                          <label>PTS</label>
                          <input type="number" value={m.score1} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, score1: parseInt(e.target.value) || 0} : x))} />
                        </div>
                        <div className="input-group">
                          <label>BALLS</label>
                          <input type="number" value={m.ballsLeft1} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, ballsLeft1: parseInt(e.target.value) || 0} : x))} />
                        </div>
                      </div>
                    )}
                    {m.isCompleted && <div className="result-stat">{m.score1}P / {m.ballsLeft1}B</div>}
                  </div>

                  <div className="battle-vs">
                    <div className="vs-circle">VS</div>
                  </div>

                  <div className={`competitor side-right ${m.winner === m.player2 ? 'victorious' : ''}`}>
                    <div className="team-emblem">{t2?.name ? t2.name.charAt(0) : '?'}</div>
                    <h4 className="name">{t2?.name || "BYE"}</h4>
                    {!m.isCompleted && t2 && (
                      <div className="score-inputs">
                        <div className="input-group">
                          <label>PTS</label>
                          <input type="number" value={m.score2} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, score2: parseInt(e.target.value) || 0} : x))} />
                        </div>
                        <div className="input-group">
                          <label>BALLS</label>
                          <input type="number" value={m.ballsLeft2} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, ballsLeft2: parseInt(e.target.value) || 0} : x))} />
                        </div>
                      </div>
                    )}
                    {m.isCompleted && <div className="result-stat">{m.score2}P / {m.ballsLeft2}B</div>}
                  </div>
                </div>

                {!m.isCompleted && t2 && (
                  <div className="battle-actions">
                    <button className="victory-btn left" onClick={() => completeMatch(m.id, m.player1)}>DECLARE {t1?.name} WINNER</button>
                    <button className="victory-btn right" onClick={() => completeMatch(m.id, m.player2)}>DECLARE {t2?.name} WINNER</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .pro-manager-arena { padding: 1.5rem; }
        .arena-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .display-text-sm { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.5px; }
        .status-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 0.65rem; font-weight: 800; background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 20px; color: var(--gold); border: 1px solid var(--gold-subtle); margin-top: 4px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); }
        
        .sub-switcher { display: flex; background: rgba(255,255,255,0.03); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color); }
        .sub-switcher button { padding: 0.6rem 1.2rem; border-radius: 10px; font-size: 0.7rem; font-weight: 800; border: none; background: none; color: var(--text-muted); cursor: pointer; transition: all 0.3s; }
        .sub-switcher button.active { background: var(--gradient-primary); color: white; box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3); }
        .reset-btn { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.6rem 1.2rem; border-radius: 12px; font-size: 0.7rem; font-weight: 800; cursor: pointer; margin-left: 1rem; }

        .arena-progress-hub { margin-bottom: 3rem; }
        .progress-info { display: flex; justify-content: space-between; font-size: 0.65rem; font-weight: 900; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 8px; }
        .progress-bar-bg { height: 8px; background: rgba(255,255,255,0.03); border-radius: 10px; overflow: hidden; border: 1px solid var(--border-color); }
        .progress-bar-fill { height: 100%; background: var(--gradient-primary); transition: width 1s ease-in-out; }

        .battle-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 32px; padding: 2rem; margin-bottom: 1.5rem; position: relative; transition: all 0.3s; }
        .battle-card.archived { opacity: 0.6; grayscale: 0.5; }
        .battle-header { display: flex; justify-content: space-between; margin-bottom: 2rem; }
        .match-tag { font-size: 0.6rem; font-weight: 900; color: var(--gold); letter-spacing: 2px; }
        
        .battle-arena { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 3rem; }
        .competitor { text-align: center; display: flex; flex-direction: column; align-items: center; transition: all 0.4s; }
        .team-emblem { width: 64px; height: 64px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: var(--text-muted); }
        .name { font-size: 1.5rem; font-weight: 900; margin-bottom: 1.5rem; }
        .victorious .team-emblem { border-color: var(--gold); color: var(--gold); box-shadow: 0 0 20px var(--gold-subtle); }
        .victorious .name { color: var(--gold); text-shadow: 0 0 10px rgba(255, 183, 0, 0.3); }
        
        .score-inputs { display: flex; gap: 1rem; }
        .input-group { text-align: center; }
        .input-group label { display: block; font-size: 0.6rem; font-weight: 900; color: var(--text-muted); margin-bottom: 4px; }
        .input-group input { width: 60px; height: 40px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 10px; color: white; text-align: center; font-size: 1rem; font-weight: 800; }
        
        .battle-vs { position: relative; }
        .vs-circle { width: 50px; height: 50px; border: 1px solid var(--border-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 900; color: var(--text-muted); background: var(--bg-primary); z-index: 2; }
        .battle-vs::before { content: ''; position: absolute; top: 50%; left: -4rem; right: -4rem; height: 1px; background: linear-gradient(90deg, transparent, var(--border-color), transparent); z-index: 1; }

        .battle-actions { display: flex; gap: 1rem; margin-top: 3rem; }
        .victory-btn { flex: 1; padding: 1rem; border-radius: 12px; border: 1px solid var(--gold-subtle); background: rgba(255, 183, 0, 0.05); color: var(--gold); font-size: 0.75rem; font-weight: 900; cursor: pointer; transition: all 0.3s; }
        .victory-btn:hover { background: var(--gold); color: black; transform: scale(1.02); }
        
        .result-stat { font-size: 0.85rem; font-weight: 800; color: var(--gold); background: var(--gold-subtle); padding: 4px 12px; border-radius: 8px; }

        .standings-board { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 32px; overflow: hidden; }
        .board-header { padding: 1.5rem 2rem; background: rgba(255,255,255,0.03); font-size: 0.8rem; font-weight: 900; letter-spacing: 2px; color: var(--gold); border-bottom: 1px solid var(--border-color); }
        .standings-table { width: 100%; border-collapse: collapse; text-align: left; }
        .standings-table th { padding: 1.25rem 2rem; font-size: 0.7rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
        .standings-table td { padding: 1.25rem 2rem; border-bottom: 1px solid rgba(255,255,255,0.02); font-size: 1rem; }
        .top-team { background: rgba(255, 183, 0, 0.02); }
        .top-team .team-name { color: var(--gold); font-weight: 900; }
        .standings-table .points { color: var(--gold); font-weight: 900; }
      `}</style>
    </div>
  );
}
