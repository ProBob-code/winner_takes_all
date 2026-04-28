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
      // Group Stage: Simple Round Robin (partial)
      // For each team, generate X unique matches
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
    
    // Recalculate Standings
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

  if (!isStarted) {
    return (
      <div className="panel slide-in" style={{ padding: "3rem", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "32px" }}>
        <h2 className="glow-text mb-2">Tournament Architect</h2>
        <p className="muted mb-8">Design your local showdown. No registration required.</p>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" }}>
          <div className="format-selector">
            <label className="label-tiny">TOURNAMENT FORMAT</label>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button 
                className={`button button-sm ${format === 'KNOCKOUT' ? 'button-gold' : 'button-secondary'}`}
                onClick={() => setFormat('KNOCKOUT')}
                style={{ flex: 1 }}
              >
                DIRECT KNOCKOUT
              </button>
              <button 
                className={`button button-sm ${format === 'GROUP_STAGE' ? 'button-gold' : 'button-secondary'}`}
                onClick={() => setFormat('GROUP_STAGE')}
                style={{ flex: 1 }}
              >
                GROUP STAGE
              </button>
            </div>
          </div>

          {format === 'GROUP_STAGE' && (
            <div className="match-count">
              <label className="label-tiny">MATCHES PER TEAM</label>
              <input 
                type="number" 
                className="input mt-2 w-full" 
                value={matchesPerTeam} 
                onChange={(e) => setMatchesPerTeam(parseInt(e.target.value) || 1)}
              />
            </div>
          )}
        </div>

        <div className="mb-8">
          <label className="label-tiny">TEAMS ({teams.length})</label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input 
              className="input" 
              placeholder="Enter Team Name..." 
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTeam()}
              style={{ background: "rgba(0,0,0,0.2)" }}
            />
            <button className="button button-gold" onClick={addTeam}>ADD TEAM</button>
          </div>
          
          <div className="mt-6" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {teams.map(t => (
              <div key={t.id} className="team-pill">
                {t.name}
                <button onClick={() => setTeams(teams.filter(x => x.id !== t.id))} style={{ marginLeft: "8px", opacity: 0.5, border: "none", background: "none", color: "white", cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        </div>

        <button 
          className="button button-gold btn-glow w-full" 
          disabled={teams.length < 2}
          onClick={startTournament}
          style={{ padding: "1.5rem", fontSize: "1rem", fontWeight: 900 }}
        >
          INITIALIZE TOURNAMENT
        </button>

        <style jsx>{`
          .label-tiny { font-size: 0.65rem; font-weight: 900; letter-spacing: 2px; color: var(--text-muted); text-transform: uppercase; }
          .team-pill { background: rgba(255, 183, 0, 0.1); color: var(--gold); padding: 0.6rem 1.2rem; borderRadius: 12px; font-size: 0.85rem; font-weight: 700; border: 1px solid rgba(255, 183, 0, 0.2); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="slide-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h2 className="glow-text">Pro Manager</h2>
          <span className="muted text-xs tracking-widest">{format.replace("_", " ")} MODE ACTIVE</span>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <div className="sub-tabs">
            <button className={activeSubTab === 'matches' ? 'active' : ''} onClick={() => setActiveSubTab('matches')}>MATCHES</button>
            <button className={activeSubTab === 'standings' ? 'active' : ''} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          </div>
          <button className="button button-sm danger-subtle" onClick={reset}>RESET</button>
        </div>
      </div>

      {activeSubTab === 'standings' ? (
        <div className="panel overflow-hidden" style={{ borderRadius: "24px", border: "1px solid var(--glass-border-color)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", fontSize: "0.7rem", fontWeight: 900, color: "var(--text-muted)", letterSpacing: "1px" }}>
                <th style={{ padding: "1.5rem" }}>RANK</th>
                <th>TEAM</th>
                <th>P</th>
                <th>W</th>
                <th>BALLS</th>
                <th style={{ color: "var(--gold)" }}>PTS</th>
              </tr>
            </thead>
            <tbody>
              {[...teams].sort((a,b) => b.points - a.points || a.ballsLeftTotal - b.ballsLeftTotal).map((t, idx) => (
                <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", fontSize: "0.9rem" }}>
                  <td style={{ padding: "1.5rem", fontWeight: 800, color: idx === 0 ? "var(--gold)" : "inherit" }}>#{idx + 1}</td>
                  <td style={{ fontWeight: 700 }}>{t.name}</td>
                  <td className="muted">{t.played}</td>
                  <td className="muted">{t.won}</td>
                  <td className="muted">{t.ballsLeftTotal}</td>
                  <td style={{ fontWeight: 900, color: "var(--gold)" }}>{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
          {matches.map(m => {
            const t1 = teams.find(t => t.id === m.player1);
            const t2 = teams.find(t => t.id === m.player2);
            
            return (
              <div key={m.id} className={`match-card ${m.isCompleted ? 'completed' : ''}`}>
                <div className="match-header">
                  <span className="round-label">{m.round.toUpperCase()} MATCH</span>
                  {m.isCompleted && <span className="completed-badge">COMPLETED</span>}
                </div>
                
                <div className="match-body">
                  <div className={`team-side ${m.winner === m.player1 ? 'winner' : ''}`}>
                    <div className="name">{t1?.name || "TBD"}</div>
                    {!m.isCompleted && (
                      <div className="inputs">
                        <input type="number" value={m.score1} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, score1: parseInt(e.target.value) || 0} : x))} />
                        <span className="x">pts</span>
                        <input type="number" value={m.ballsLeft1} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, ballsLeft1: parseInt(e.target.value) || 0} : x))} />
                        <span className="x">balls</span>
                      </div>
                    )}
                    {m.isCompleted && <div className="final-score">{m.score1} pts | {m.ballsLeft1} balls</div>}
                  </div>

                  <div className="vs">VS</div>

                  <div className={`team-side ${m.winner === m.player2 ? 'winner' : ''}`}>
                    <div className="name">{t2?.name || "BYE"}</div>
                    {!m.isCompleted && t2 && (
                      <div className="inputs">
                        <input type="number" value={m.score2} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, score2: parseInt(e.target.value) || 0} : x))} />
                        <span className="x">pts</span>
                        <input type="number" value={m.ballsLeft2} onChange={(e) => setMatches(matches.map(x => x.id === m.id ? {...x, ballsLeft2: parseInt(e.target.value) || 0} : x))} />
                        <span className="x">balls</span>
                      </div>
                    )}
                    {m.isCompleted && <div className="final-score">{m.score2} pts | {m.ballsLeft2} balls</div>}
                  </div>
                </div>

                {!m.isCompleted && t2 && (
                  <div className="match-actions">
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
        .sub-tabs { display: flex; background: rgba(255,255,255,0.03); padding: 3px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }
        .sub-tabs button { padding: 0.4rem 1rem; border-radius: 10px; font-size: 0.65rem; font-weight: 800; border: none; background: none; color: var(--text-muted); cursor: pointer; transition: all 0.3s; }
        .sub-tabs button.active { background: rgba(255,255,255,0.05); color: white; }

        .match-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; padding: 1.5rem; transition: all 0.3s; }
        .match-card.completed { opacity: 0.6; background: rgba(0,0,0,0.2); }
        .match-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
        .round-label { font-size: 0.6rem; font-weight: 900; color: var(--gold); letter-spacing: 2px; }
        .completed-badge { font-size: 0.6rem; font-weight: 900; color: #10b981; }
        
        .match-body { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 2rem; }
        .team-side { text-align: center; }
        .team-side.winner .name { color: var(--gold); text-shadow: 0 0 10px rgba(255, 183, 0, 0.3); }
        .team-side .name { font-size: 1.1rem; font-weight: 800; margin-bottom: 0.75rem; }
        
        .inputs { display: flex; gap: 0.4rem; justify-content: center; align-items: center; }
        .inputs input { width: 50px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: white; text-align: center; padding: 4px; font-weight: 800; }
        .inputs .x { font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; }
        
        .vs { font-weight: 900; color: rgba(255,255,255,0.1); font-size: 0.8rem; }
        .final-score { font-size: 0.8rem; font-weight: 700; color: var(--text-muted); }

        .match-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
        .match-actions button { flex: 1; padding: 0.6rem; border-radius: 10px; border: 1px solid rgba(255, 183, 0, 0.1); background: rgba(255, 183, 0, 0.05); color: var(--gold); font-size: 0.7rem; font-weight: 900; cursor: pointer; transition: all 0.2s; }
        .match-actions button:hover { background: var(--gold); color: black; }
        
        .danger-subtle { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
      `}</style>
    </div>
  );
}
