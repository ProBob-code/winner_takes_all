"use client";

import React, { useState, useEffect } from "react";

type Team = {
  id: string;
  name: string;
};

type Match = {
  id: string;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  round: number;
  score1: number;
  score2: number;
  ballsLeft1: number;
  ballsLeft2: number;
};

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [rules, setRules] = useState("Standard 8-Ball rules apply. Winner decided by total points.");
  const [isStarted, setIsStarted] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("wta_quick_tournament");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setRules(parsed.rules || "");
      setIsStarted(parsed.isStarted || false);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("wta_quick_tournament", JSON.stringify({ teams, matches, rules, isStarted }));
  }, [teams, matches, rules, isStarted]);

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    setTeams([...teams, { id: Math.random().toString(36).substr(2, 9), name: newTeamName.trim() }]);
    setNewTeamName("");
  };

  const startTournament = () => {
    if (teams.length < 2) return;
    
    // Generate simple bracket for round 1
    const initialMatches: Match[] = [];
    for (let i = 0; i < teams.length; i += 2) {
      initialMatches.push({
        id: `m1-${i}`,
        player1: teams[i].id,
        player2: teams[i+1] ? teams[i+1].id : null,
        winner: null,
        round: 1,
        score1: 0,
        score2: 0,
        ballsLeft1: 7,
        ballsLeft2: 7
      });
    }
    setMatches(initialMatches);
    setIsStarted(true);
  };

  const updateScore = (matchId: string, side: 1 | 2, field: 'score' | 'balls', val: number) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m;
      const updated = { ...m };
      if (field === 'score') {
        if (side === 1) updated.score1 = val;
        else updated.score2 = val;
      } else {
        if (side === 1) updated.ballsLeft1 = val;
        else updated.ballsLeft2 = val;
      }
      return updated;
    }));
  };

  const setWinner = (matchId: string, teamId: string | null) => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, winner: teamId } : m));
  };

  const reset = () => {
    if (confirm("Reset everything?")) {
      setTeams([]);
      setMatches([]);
      setIsStarted(false);
      localStorage.removeItem("wta_quick_tournament");
    }
  };

  if (!isStarted) {
    return (
      <div className="panel slide-in" style={{ padding: "2rem" }}>
        <h2 className="glow-text mb-4">Quick Tournament Setup</h2>
        <p className="muted mb-6">Host a local tournament. No login required. Track scores and manage brackets manually.</p>
        
        <div className="mb-6">
          <label className="text-xs uppercase font-bold tracking-widest muted mb-2 block">Tournament Rules</label>
          <textarea 
            className="input w-full" 
            value={rules} 
            onChange={(e) => setRules(e.target.value)}
            style={{ minHeight: "80px", background: "rgba(255,255,255,0.03)" }}
          />
        </div>

        <div className="mb-6">
          <label className="text-xs uppercase font-bold tracking-widest muted mb-2 block">Register Teams ({teams.length})</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input 
              className="input" 
              placeholder="Team Name" 
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTeam()}
            />
            <button className="button" onClick={addTeam}>Add</button>
          </div>
          
          <div className="mt-4" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {teams.map(t => (
              <span key={t.id} style={{ background: "var(--glass-bg-hover)", padding: "0.4rem 0.8rem", borderRadius: "8px", fontSize: "0.85rem", border: "1px solid var(--glass-border)" }}>
                {t.name}
              </span>
            ))}
          </div>
        </div>

        <button 
          className="button button-gold w-full" 
          disabled={teams.length < 2}
          onClick={startTournament}
        >
          Generate Bracket & Start
        </button>
      </div>
    );
  }

  return (
    <div className="slide-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 className="glow-text">Quick Manager</h2>
        <button className="button button-sm" style={{ background: "rgba(255,0,0,0.1)", color: "#ff8080" }} onClick={reset}>End Tournament</button>
      </div>

      <div className="panel p-4 mb-6" style={{ background: "rgba(139, 92, 246, 0.05)", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
        <h4 className="text-xs uppercase muted mb-2">Rules</h4>
        <p className="text-sm">{rules}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {matches.map(m => {
          const t1 = teams.find(t => t.id === m.player1);
          const t2 = teams.find(t => t.id === m.player2);
          
          return (
            <div key={m.id} className="panel p-6" style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1rem", alignItems: "center" }}>
                {/* Team 1 */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: "0.5rem", color: m.winner === m.player1 ? "var(--gold)" : "inherit" }}>
                    {t1?.name || "TBD"}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                    <div>
                      <div className="text-xs muted mb-1">Points</div>
                      <input 
                        type="number" 
                        className="input text-center" 
                        style={{ width: "60px", padding: "0.3rem" }} 
                        value={m.score1} 
                        onChange={(e) => updateScore(m.id, 1, 'score', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <div className="text-xs muted mb-1">Balls</div>
                      <input 
                        type="number" 
                        className="input text-center" 
                        style={{ width: "60px", padding: "0.3rem" }} 
                        value={m.ballsLeft1} 
                        onChange={(e) => updateScore(m.id, 1, 'balls', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <button 
                    className={`button button-sm mt-4 w-full ${m.winner === m.player1 ? 'button-gold' : 'button-secondary'}`}
                    onClick={() => setWinner(m.id, m.player1)}
                  >
                    Set Winner
                  </button>
                </div>

                <div className="muted font-bold">VS</div>

                {/* Team 2 */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: "0.5rem", color: m.winner === m.player2 ? "var(--gold)" : "inherit" }}>
                    {t2?.name || "BYE"}
                  </div>
                  {t2 && (
                    <>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                        <div>
                          <div className="text-xs muted mb-1">Points</div>
                          <input 
                            type="number" 
                            className="input text-center" 
                            style={{ width: "60px", padding: "0.3rem" }} 
                            value={m.score2} 
                            onChange={(e) => updateScore(m.id, 2, 'score', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <div className="text-xs muted mb-1">Balls</div>
                          <input 
                            type="number" 
                            className="input text-center" 
                            style={{ width: "60px", padding: "0.3rem" }} 
                            value={m.ballsLeft2} 
                            onChange={(e) => updateScore(m.id, 2, 'balls', parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                      <button 
                        className={`button button-sm mt-4 w-full ${m.winner === m.player2 ? 'button-gold' : 'button-secondary'}`}
                        onClick={() => setWinner(m.id, m.player2)}
                      >
                        Set Winner
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
