"use client";

import React, { useState, useEffect } from "react";
import { backendFetch } from "@/lib/backend";
import "@/components/tournament-engine.css";

type Team = { id: string; name: string; matches_played: number; group_points: number; total_score: number; };
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
  team_a_house?: 'SOLID' | 'STRIPES';
  team_b_house?: 'SOLID' | 'STRIPES';
  fouls_a: number;
  fouls_b: number;
  is_draw?: boolean;
};

type ModalConfig = {
  icon: string;
  title: string;
  message: string;
  onConfirm: () => void;
  showCancel?: boolean;
};

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'arena' | 'standings'>('arena');
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [arenaId, setArenaId] = useState<string>("");
  const [matchesPerTeam, setMatchesPerTeam] = useState(3);
  const [defaultDuration, setDefaultDuration] = useState(600);
  const [tournamentType, setTournamentType] = useState<'GROUP' | 'KNOCKOUT'>('GROUP');
  const [arenaName, setArenaName] = useState("Stadium Arena Showdown");
  const [isPublishing, setIsPublishing] = useState(false);
  const [victoryMatch, setVictoryMatch] = useState<Match | null>(null);
  const [extraTimePromptId, setExtraTimePromptId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAddTeamInline, setShowAddTeamInline] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
  const [manualPair, setManualPair] = useState<[string, string]>(["", ""]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [arenaPin, setArenaPin] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState<{ mode: 'SET' | 'VERIFY', onConfirm: (pin: string) => void } | null>(null);

  // Sync with LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("wta_arena_quick_v9");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTeams(parsed.teams || []);
      setMatches(parsed.matches || []);
      setIsStarted(parsed.isStarted || false);
      setArenaId(parsed.arenaId || "");
      setMatchesPerTeam(parsed.matchesPerTeam || 3);
      setDefaultDuration(parsed.defaultDuration || 600);
       setTournamentType(parsed.tournamentType || 'GROUP');
      setArenaName(parsed.arenaName || "Stadium Arena Showdown");
      setArenaPin(parsed.arenaPin || null);
      setIsLocked(parsed.isLocked || false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_arena_quick_v9", JSON.stringify({ 
      teams, matches, isStarted, arenaId, matchesPerTeam, defaultDuration, 
      tournamentType, arenaName, arenaPin, isLocked 
    }));
    if (arenaId && isStarted) {
      backendFetch("/public-arenas", { 
        method: "POST", 
        body: JSON.stringify({ 
          id: arenaId, name: arenaName, state: { teams, matches, isStarted },
          pin: arenaPin 
        }) 
      }).catch(() => { });
    }
  }, [teams, matches, isStarted, arenaId, matchesPerTeam, defaultDuration, tournamentType, arenaName, arenaPin, isLocked]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setCurrentTime(now);
      
      setMatches(prev => {
        let changed = false;
        const next = prev.map(m => {
          if (m.status === 'LIVE' && m.start_time) {
            const remaining = (m.start_time + m.duration) - now;
            
            if (remaining > 0 && remaining <= 30 && extraTimePromptId !== m.id) {
              setExtraTimePromptId(m.id);
            }

            if (remaining <= 0) {
              changed = true;
              setExtraTimePromptId(null);
              playBuzzer();
              const winnerId = m.score_team_a > m.score_team_b ? m.team_a_id : (m.score_team_b > m.score_team_a ? m.team_b_id : null);
              const isDraw = m.score_team_a === m.score_team_b;
              const nm = { ...m, status: 'COMPLETED' as const, winner_id: winnerId, is_draw: isDraw };
              
              setVictoryMatch(nm);
              setTimeout(() => setVictoryMatch(null), 10000);
              
              setTeams(tPrev => tPrev.map(t => (t.id === nm.team_a_id || t.id === nm.team_b_id) ? { 
                ...t, 
                matches_played: t.matches_played + 1, 
                total_score: t.total_score + (t.id === nm.team_a_id ? nm.score_team_a : nm.score_team_b) + (isDraw ? 50 : 0), 
                group_points: t.group_points + (nm.winner_id === t.id ? 1 : 0) 
              } : t));
              
              return nm;
            }
          }
          return m;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [extraTimePromptId]);

  const playBuzzer = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playBell = (startTime: number, frequency: number, volume: number) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 5);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + 5);
      };
      const now = audioCtx.currentTime;
      [440, 880, 1320, 1760].forEach((freq, i) => playBell(now, freq, 0.5 / (i + 1)));
    } catch (e) { console.error("Audio failed", e); }
  };

  const generateMatchesPass = (allTeams: Team[], existingMatches: Match[]) => {
    const newMatches: Match[] = [];
    let currentMatches = [...existingMatches];

    if (tournamentType === 'GROUP') {
      let quotaReached = false;
      while (!quotaReached) {
        const sortedTeams = [...allTeams].sort((a, b) => {
          const m1 = currentMatches.filter(m => m.team_a_id === a.id || m.team_b_id === a.id).length;
          const m2 = currentMatches.filter(m => m.team_a_id === b.id || m.team_b_id === b.id).length;
          return m1 - m2;
        });

        let passCreated = false;
        const pairedInThisPass = new Set<string>();

        for (let i = 0; i < sortedTeams.length; i++) {
          const t1 = sortedTeams[i];
          const t1MatchCount = currentMatches.filter(m => m.team_a_id === t1.id || m.team_b_id === t1.id).length;

          if (pairedInThisPass.has(t1.id) || t1MatchCount >= matchesPerTeam) continue;

          const t2 = sortedTeams.find(potential => {
            if (potential.id === t1.id || pairedInThisPass.has(potential.id)) return false;
            const t2MatchCount = currentMatches.filter(m => m.team_a_id === potential.id || m.team_b_id === potential.id).length;
            if (t2MatchCount >= matchesPerTeam) return false;

            const alreadyPlayed = currentMatches.some(m =>
              (m.team_a_id === t1.id && m.team_b_id === potential.id) ||
              (m.team_a_id === potential.id && m.team_b_id === t1.id)
            );
            return !alreadyPlayed;
          });

          if (t2) {
            pairedInThisPass.add(t1.id); pairedInThisPass.add(t2.id);
            const m: Match = {
              id: `m-${Date.now()}-${newMatches.length}-${Math.random()}`, team_a_id: t1.id, team_b_id: t2.id,
              score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
              black_potted_a: false, black_potted_b: false, status: 'CREATED',
              winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null,
              order: currentMatches.length,
              team_a_house: 'SOLID', team_b_house: 'STRIPES',
              fouls_a: 0, fouls_b: 0
            };
            newMatches.push(m);
            currentMatches.push(m);
            passCreated = true;
          }
        }
        if (!passCreated) quotaReached = true;
      }
    } else {
      if (allTeams.length >= 2 && currentMatches.length === 0) {
        for (let i = 0; i < allTeams.length; i += 2) {
          if (i + 1 < allTeams.length) {
            newMatches.push({
              id: `m-k-${i}-${Math.random()}`, team_a_id: allTeams[i].id, team_b_id: allTeams[i + 1].id,
              score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
              black_potted_a: false, black_potted_b: false, status: 'CREATED',
              winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: i / 2,
              team_a_house: 'SOLID', team_b_house: 'STRIPES',
              fouls_a: 0, fouls_b: 0
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

  const removeTeam = (teamId: string) => {
    if (isLocked) return;
    setTeams(teams.filter(t => t.id !== teamId));
    setMatches(matches.filter(m => m.team_a_id !== teamId && m.team_b_id !== teamId));
  };

  const updateTeamName = (teamId: string, newName: string) => {
    if (isLocked) return;
    setTeams(teams.map(t => t.id === teamId ? { ...t, name: newName } : t));
    setEditingTeamId(null);
  };

  const publishArena = async () => {
    setIsPublishing(true);
    const id = arenaId || Math.random().toString(36).substr(2, 8).toUpperCase();
    try {
      await backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify({ id, name: arenaName, state: { teams, matches, isStarted }, pin: arenaPin })
      });
      setArenaId(id);
      setShowShareModal(true);
    } catch (e) {
      setModalConfig({
        icon: "❌",
        title: "SYNC FAILED",
        message: "Failed to publish arena to the network. Please check your connection.",
        onConfirm: () => setModalConfig(null)
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const addManualMatch = (t1Id: string, t2Id: string) => {
    if (!t1Id || !t2Id) return;
    if (t1Id === t2Id) {
      setModalConfig({
        icon: "⚠️",
        title: "INVALID SELECTION",
        message: "You cannot create a duel between the same team. Please select two different participants.",
        onConfirm: () => setModalConfig(null)
      });
      return;
    }
    const match: Match = {
      id: `m-man-${Date.now()}-${Math.random()}`, team_a_id: t1Id, team_b_id: t2Id,
      score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
      black_potted_a: false, black_potted_b: false, status: 'CREATED',
      winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null,
      order: matches.length,
      team_a_house: 'SOLID', team_b_house: 'STRIPES',
      fouls_a: 0, fouls_b: 0
    };
    setMatches([...matches, match]);
  };

  const startTournament = () => {
    const initial = generateMatchesPass(teams, []);
    setMatches(initial);
    setIsStarted(true);
  };

  const advanceToKnockouts = () => {
    const sorted = [...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score);
    const top4 = sorted.slice(0, 4);
    
    if (top4.length < 2) {
      setModalConfig({
        icon: "⚠️",
        title: "INSUFFICIENT DATA",
        message: "You need at least 2 teams with scores to generate a knockout bracket.",
        onConfirm: () => setModalConfig(null)
      });
      return;
    }

    setModalConfig({
      icon: "🏆",
      title: "ADVANCE TO KNOCKOUTS?",
      message: `The Group Stage is complete. We will now generate Semi-Finals for the Top ${top4.length} teams: ${top4.map(t => t.name).join(', ')}.`,
      onConfirm: () => {
        const knockoutMatches: Match[] = [];
        if (top4.length === 4) {
          knockoutMatches.push({
            id: `sf-1`, team_a_id: top4[0].id, team_b_id: top4[3].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 0,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0
          });
          knockoutMatches.push({
            id: `sf-2`, team_a_id: top4[1].id, team_b_id: top4[2].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 1,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0
          });
        } else {
          knockoutMatches.push({
            id: `final`, team_a_id: top4[0].id, team_b_id: top4[1].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 0,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0
          });
        }
        setTournamentType('KNOCKOUT');
        setMatches(knockoutMatches);
        setModalConfig(null);
      }
    });
  };

  const adjustDuration = (matchId: string, deltaSeconds: number) => {
    setMatches(matches.map(m => {
      if (m.id !== matchId) return m;
      const newDur = Math.max(60, m.duration + deltaSeconds);
      return { ...m, duration: newDur };
    }));
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("matchId", id);
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    const draggedId = e.dataTransfer.getData("matchId");
    if (draggedId === targetId) return;

    const created = matches.filter(m => m.status === 'CREATED').sort((a, b) => a.order - b.order);
    const draggedIdx = created.findIndex(m => m.id === draggedId);
    const targetIdx = created.findIndex(m => m.id === targetId);

    const newCreated = [...created];
    const [draggedItem] = newCreated.splice(draggedIdx, 1);
    newCreated.splice(targetIdx, 0, draggedItem);

    const updatedMatches = matches.map(m => {
      const cIdx = newCreated.findIndex(cx => cx.id === m.id);
      if (cIdx !== -1) return { ...m, order: cIdx };
      return m;
    });
    setMatches(updatedMatches);
  };

  const updateHouse = (matchId: string, team: 'A' | 'B', house: 'SOLID' | 'STRIPES') => {
    setMatches(matches.map(m => m.id === matchId ? { ...m, [`team_${team.toLowerCase()}_house`]: house } : m));
  };

  const updateScore = (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'FOUL') => {
    setMatches(matches.map(m => {
      if (m.id !== matchId || m.status !== 'LIVE') return m;
      const nm = { ...m };
      const isA = m.team_a_id === teamId;

      if (type === 'BALL') {
        if (isA) {
          nm.balls_potted_a = Math.min(7, nm.balls_potted_a + 1);
          nm.score_team_a = Math.min(70, nm.score_team_a + 10);
        } else {
          nm.balls_potted_b = Math.min(7, nm.balls_potted_b + 1);
          nm.score_team_b = Math.min(70, nm.score_team_b + 10);
        }
      } else if (type === 'FOUL') {
        if (isA) {
          nm.fouls_a++;
          nm.score_team_a -= 5;
        } else {
          nm.fouls_b++;
          nm.score_team_b -= 5;
        }
      } else if ((type as any) === 'REMOVE_FOUL') {
        if (isA && nm.fouls_a > 0) {
          nm.fouls_a--;
          nm.score_team_a += 5;
        } else if (!isA && nm.fouls_b > 0) {
          nm.fouls_b--;
          nm.score_team_b += 5;
        }
      } else {
        const currentBalls = isA ? nm.balls_potted_a : nm.balls_potted_b;
        if (currentBalls < 7) {
          nm.status = 'COMPLETED';
          nm.winner_id = isA ? nm.team_b_id : nm.team_a_id;
          nm.score_team_a = isA ? nm.score_team_a : 100;
          nm.score_team_b = !isA ? nm.score_team_b : 100;
        } else {
          nm.status = 'COMPLETED';
          nm.winner_id = teamId;
          if (isA) nm.score_team_a += 30;
          else nm.score_team_b += 30;
        }
        setTeams(prev => prev.map(t => (t.id === nm.team_a_id || t.id === nm.team_b_id) ? { ...t, matches_played: t.matches_played + 1, total_score: t.total_score + (t.id === nm.team_a_id ? nm.score_team_a : nm.score_team_b), group_points: t.group_points + (nm.winner_id === t.id ? 1 : 0) } : t));
      }
      if (nm.status === 'COMPLETED') {
        setVictoryMatch(nm);
        setTimeout(() => setVictoryMatch(null), 10000);
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
        <div key={i} className={`ball-slot ${i < balls ? 'filled' : ''}`} style={{ '--accent-primary': color } as any}>{i + 1}</div>
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
                  <button className={`segment-btn ${tournamentType === 'GROUP' ? 'active' : ''}`} onClick={() => setTournamentType('GROUP')}>GROUP STAGE</button>
                  <button className={`segment-btn ${tournamentType === 'KNOCKOUT' ? 'active' : ''}`} onClick={() => setTournamentType('KNOCKOUT')}>KNOCKOUT</button>
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
                        <div className="roster-name">
                          {editingTeamId === t.id ? (
                            <input 
                              className="edit-team-input" 
                              value={editingTeamName} 
                              onChange={e => setEditingTeamName(e.target.value)}
                              onBlur={() => updateTeamName(t.id, editingTeamName)}
                              onKeyPress={e => e.key === 'Enter' && updateTeamName(t.id, editingTeamName)}
                              autoFocus
                            />
                          ) : (
                            <span onClick={() => { setEditingTeamId(t.id); setEditingTeamName(t.name); }}>{t.name}</span>
                          )}
                        </div>
                        <div className="roster-actions">
                          <button className="edit-btn-tiny" onClick={() => { setEditingTeamId(t.id); setEditingTeamName(t.name); }}>✎</button>
                          <button className="remove-btn" onClick={() => removeTeam(t.id)}>REMOVE</button>
                        </div>
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
            <button className={`launch-btn ${teams.length >= 2 ? 'ready' : 'disabled'}`} onClick={startTournament} disabled={teams.length < 2}>
              <span className="launch-text">{teams.length >= 2 ? 'START TOURNAMENT' : 'ADD MINIMUM 2 TEAMS'}</span>
              <div className="launch-glow"></div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const liveMatch = matches.find(m => m.status === 'LIVE');
  const createdMatches = matches.filter(m => m.status === 'CREATED').sort((a, b) => a.order - b.order);

  return (
    <div className="engine-container animate-in">
      {victoryMatch && (
        <div className="victory-overlay animate-in">
          <div className="victory-podium slide-in">
            <div className="v-crown">{victoryMatch.is_draw ? '🤝' : '👑'}</div>
            <div className="v-label">{victoryMatch.is_draw ? 'MATCH TIED' : 'CHAMPION DECLARED'}</div>
            <h1 className="v-name-xl glow-text-gold">{victoryMatch.is_draw ? 'STALEMATE DRAW' : getTeamName(victoryMatch.winner_id || "")}</h1>
            <div className="v-stats-premium">
              <span className="v-score">{victoryMatch.score_team_a}</span>
              <span className="v-vs">{victoryMatch.is_draw ? 'DRAW' : 'DEFEATED'}</span>
              <span className="v-score">{victoryMatch.score_team_b}</span>
            </div>
            <div className="v-footer">POINTS AWARDED: {victoryMatch.is_draw ? '+50 TO EACH' : '+1 WIN'}</div>
          </div>
        </div>
      )}

      {modalConfig && (
        <div className="custom-modal-overlay">
          <div className="custom-modal glass-morphism slide-in">
            <div className="modal-icon">{modalConfig.icon}</div>
            <h2>{modalConfig.title}</h2>
            <p className="muted">{modalConfig.message}</p>
            <div className="modal-actions">
              {modalConfig.showCancel !== false && <button className="button button-secondary" onClick={() => setModalConfig(null)}>CANCEL</button>}
              <button className="button button-gold" onClick={modalConfig.onConfirm}>CONFIRM</button>
            </div>
          </div>
        </div>
      )}

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
          <div className="custom-modal glass-morphism slide-in" style={{ maxWidth: '500px' }}>
            <div className="modal-icon">🚀</div>
            <h2 className="glow-text">Arena is Live!</h2>
            <p className="muted">Your battleground is now synchronized with the global spectator network. Share the link below.</p>
            <div className="share-link-premium mt-8">
              <div className="link-display"><span className="link-text">{window.location.origin}/arena/{arenaId}</span></div>
              <button className="copy-action-btn" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/arena/${arenaId}`);
                const btn = document.querySelector('.copy-action-btn') as HTMLButtonElement;
                if (btn) { btn.innerText = 'COPIED!'; setTimeout(() => btn.innerText = 'COPY LINK', 2000); }
              }}>COPY LINK</button>
            </div>
            <button className="button button-secondary mt-8" style={{ width: '100%' }} onClick={() => setShowShareModal(false)}>BACK TO CONTROL ROOM</button>
          </div>
        </div>
      )}

      {showPinModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal glass-morphism slide-in" style={{ maxWidth: '400px' }}>
            <div className="modal-icon">🔐</div>
            <h2>{showPinModal.mode === 'SET' ? 'Set Arena PIN' : 'Unlock Arena'}</h2>
            <p className="muted">{showPinModal.mode === 'SET' ? 'Enter a 6-digit PIN to prevent accidental or unauthorized edits.' : 'Enter your 6-digit PIN to enable editing.'}</p>
            <div className="pin-input-container mt-8">
              <input 
                type="password" 
                maxLength={6} 
                className="premium-input-v2 center-text" 
                placeholder="••••••"
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value;
                    if (val.length === 6) showPinModal.onConfirm(val);
                  }
                }}
                autoFocus
              />
            </div>
            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => setShowPinModal(null)}>CANCEL</button>
              <button className="button button-gold" onClick={() => {
                const input = document.querySelector('.pin-input-container input') as HTMLInputElement;
                if (input.value.length === 6) showPinModal.onConfirm(input.value);
              }}>{showPinModal.mode === 'SET' ? 'LOCK NOW' : 'UNLOCK'}</button>
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
          <button className="add-team-trigger" onClick={() => setShowAddTeamInline(!showAddTeamInline)}>+ ADD TEAM</button>
          <div className="sub-tab-switcher">
            <button className={`sub-tab ${activeSubTab === 'arena' ? 'active' : ''}`} onClick={() => setActiveSubTab('arena')}>ARENA</button>
            <button className={`sub-tab ${activeSubTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveSubTab('standings')}>STANDINGS</button>
          </div>
          <button className={`share-btn ${arenaId ? 'shared' : ''}`} onClick={publishArena} disabled={isPublishing}>
            {isPublishing ? 'SYNCING...' : arenaId ? '✓ LINK SHARED' : '🔗 SHARE ARENA'}
          </button>
          <button className={`lock-trigger ${isLocked ? 'locked' : ''}`} onClick={() => {
            if (isLocked) {
              setShowPinModal({ mode: 'VERIFY', onConfirm: (p) => {
                if (p === arenaPin) { setIsLocked(false); setShowPinModal(null); }
                else { alert("INVALID PIN"); }
              }});
            } else {
              setShowPinModal({ mode: 'SET', onConfirm: (p) => { setArenaPin(p); setIsLocked(true); setShowPinModal(null); }});
            }
          }}>
            <span className="icon">{isLocked ? '🔒' : '🔓'}</span>
          </button>
          <button className="reset-trigger" onClick={() => !isLocked && setShowResetModal(true)} disabled={isLocked}><span className="icon">↺</span></button>
        </div>
      </div>

      {showAddTeamInline && (
        <div className="add-team-popover slide-in">
          <input className="premium-input-v2" placeholder="New team name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} onKeyPress={e => e.key === 'Enter' && (addTeam(), setShowAddTeamInline(false))} autoFocus />
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
                  <button className="t-adj" onClick={() => adjustDuration(liveMatch.id, -60)}>−</button>
                  <span className="time-val">
                    {Math.max(0, Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime) / 60))}:
                    {String(Math.max(0, ((liveMatch.start_time || 0) + liveMatch.duration - currentTime) % 60)).padStart(2, '0')}
                  </span>
                  <button className="t-adj" onClick={() => adjustDuration(liveMatch.id, 60)}>+</button>
                </div>
                <button className="extra-time-btn" onClick={() => adjustDuration(liveMatch.id, 60)}>+1 MIN</button>
                {extraTimePromptId === liveMatch.id && (
                  <div className="extra-time-toast animate-in">
                    <div className="toast-content">
                      <span>CRITICAL TIME! NEED EXTRA?</span>
                      <button className="button button-gold button-sm" onClick={() => { adjustDuration(liveMatch.id, 120); setExtraTimePromptId(null); }}>+2 MINS</button>
                      <button className="s-btn" onClick={() => setExtraTimePromptId(null)}>×</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="battle-view">
                <div className={`team-pod red ${liveMatch.active_team_id === liveMatch.team_a_id ? 'active' : ''}`} onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_a_id } : m))}>
                  <div className="pod-inner">
                    <div className="pod-header">
                      <div className="team-initials">{getTeamName(liveMatch.team_a_id).substring(0, 2).toUpperCase()}</div>
                      <div className="team-title-stack">
                        <h3 className="team-name">{getTeamName(liveMatch.team_a_id)}</h3>
                        <div className="foul-group">
                          <button className="foul-chip" onClick={(e) => { e.stopPropagation(); !isLocked && updateScore(liveMatch.id, liveMatch.team_a_id, 'FOUL') }} disabled={isLocked}>FOUL: {liveMatch.fouls_a}</button>
                          {!isLocked && liveMatch.fouls_a > 0 && <button className="foul-dec" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'REMOVE_FOUL' as any) }}>−</button>}
                        </div>
                      </div>
                      <div className="house-selector" onClick={e => e.stopPropagation()}>
                        <button className={`house-opt ${liveMatch.team_a_house === 'SOLID' ? 'active' : ''}`} onClick={() => updateHouse(liveMatch.id, 'A', 'SOLID')}>●</button>
                        <button className={`house-opt ${liveMatch.team_a_house === 'STRIPES' ? 'active' : ''}`} onClick={() => updateHouse(liveMatch.id, 'A', 'STRIPES')}>◐</button>
                      </div>
                    </div>
                    <div className="pod-score-large">{liveMatch.score_team_a}</div>
                    <Ticker balls={liveMatch.balls_potted_a} black={liveMatch.black_potted_a} color="#ef4444" />
                    <div className="pod-actions">
                      <button className="pod-btn ball-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL') }}>+ BALL</button>
                      <button className="pod-btn black-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK') }}>+ BLACK</button>
                    </div>
                  </div>
                  <div className="active-glow" style={{ background: '#ef4444', opacity: 0.3 }}></div>
                </div>
                <div className="vs-core"><div className="vs-ring"></div><div className="vs-text">VS</div></div>
                <div className={`team-pod blue ${liveMatch.active_team_id === liveMatch.team_b_id ? 'active' : ''}`} onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_b_id } : m))}>
                  <div className="pod-inner">
                    <div className="pod-header">
                      <div className="team-initials">{getTeamName(liveMatch.team_b_id).substring(0, 2).toUpperCase()}</div>
                      <div className="team-title-stack">
                        <h3 className="team-name">{getTeamName(liveMatch.team_b_id)}</h3>
                        <div className="foul-group">
                          <button className="foul-chip" onClick={(e) => { e.stopPropagation(); !isLocked && updateScore(liveMatch.id, liveMatch.team_b_id, 'FOUL') }} disabled={isLocked}>FOUL: {liveMatch.fouls_b}</button>
                          {!isLocked && liveMatch.fouls_b > 0 && <button className="foul-dec" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'REMOVE_FOUL' as any) }}>−</button>}
                        </div>
                      </div>
                      <div className="house-selector" onClick={e => e.stopPropagation()}>
                        <button className={`house-opt ${liveMatch.team_b_house === 'SOLID' ? 'active' : ''}`} onClick={() => updateHouse(liveMatch.id, 'B', 'SOLID')}>●</button>
                        <button className={`house-opt ${liveMatch.team_b_house === 'STRIPES' ? 'active' : ''}`} onClick={() => updateHouse(liveMatch.id, 'B', 'STRIPES')}>◐</button>
                      </div>
                    </div>
                    <div className="pod-score-large">{liveMatch.score_team_b}</div>
                    <Ticker balls={liveMatch.balls_potted_b} black={liveMatch.black_potted_b} color="#3b82f6" />
                    <div className="pod-actions">
                      <button className="pod-btn ball-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL') }}>+ BALL</button>
                      <button className="pod-btn black-btn" onClick={(e) => { e.stopPropagation(); updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK') }}>+ BLACK</button>
                    </div>
                  </div>
                  <div className="active-glow" style={{ background: '#3b82f6', opacity: 0.3 }}></div>
                </div>
              </div>

              {createdMatches.length > 0 ? (
                <div className="queue-overlay slide-in">
                  <div className="queue-header"><div className="queue-title">UPCOMING DUELS ({createdMatches.length})</div></div>
                  <div className="queue-track">
                    {createdMatches.slice(0, 3).map((m, i) => (
                      <div key={m.id} className="queue-item"><span className="q-idx">{i + 1}</span><span className="q-names">{getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}</span></div>
                    ))}
                    {createdMatches.length > 3 && <div className="queue-more">+{createdMatches.length - 3} MORE</div>}
                  </div>
                </div>
              ) : (
                <div className="phase-transition-overlay animate-in">
                  <div className="phase-card glass-morphism">
                    <div className="p-icon">🏁</div>
                    <h3>GROUP STAGE COMPLETE</h3>
                    <p className="muted">All teams have reached their match quota. Ready to resolve the tournament?</p>
                    <button className="button button-gold button-lg" onClick={advanceToKnockouts}>ADVANCE TO KNOCKOUTS</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="tournament-schedule-view slide-in">
              <div className="schedule-header">
                <h3 className="glow-text">Arena Schedule</h3>
                <p className="muted">Manage future duels and live standings.</p>
              </div>
              <div className="schedule-grid mt-8">
                <div className="queue-column">
                  <label className="section-label-v2">MATCH QUEUE</label>
                  <div className="queue-list-premium">
                    {createdMatches.map((m, i) => (
                      <div key={m.id} className="schedule-item-card animate-in" draggable onDragStart={(e) => onDragStart(e, m.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, m.id)} style={{ animationDelay: `${i * 0.1}s`, cursor: 'grab' }}>
                        <div className="s-handle">≡</div><div className="s-rank">#{i + 1}</div>
                        <div className="s-info">
                          <div className="s-pair">{getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}</div>
                          <div className="s-meta">MATCH {m.order + 1} • {tournamentType} STAGE</div>
                        </div>
                        <div className="s-actions">
                          <button className="button button-gold button-sm" onClick={() => setMatches(matches.map(x => x.id === m.id ? { ...x, status: 'LIVE', start_time: currentTime } : x))}>LAUNCH</button>
                        </div>
                      </div>
                    ))}

                    <div className="manual-pairing-card mt-10 slide-in">
                      <div className="p-header">
                        <label className="section-label-v2">ARENA SETTINGS</label>
                        <div className="p-grid mt-4">
                          <div className="p-selectors">
                            <div className="setting-box">
                              <label className="stat-label">MATCH QUOTA</label>
                              <select className="premium-input-v2" value={matchesPerTeam} onChange={e => setMatchesPerTeam(Number(e.target.value))}>
                                {[1,2,3,4,5].map(v => <option key={v} value={v}>{v} matches/team</option>)}
                              </select>
                            </div>
                            <div className="setting-box">
                              <label className="stat-label">DEFAULT TIME (MINS)</label>
                              <div className="timer-scroller-v2" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button className="s-btn" onClick={() => setDefaultDuration(Math.max(60, defaultDuration - 60))}>-</button>
                                <span className="dur-val">{Math.floor(defaultDuration/60)}m</span>
                                <button className="s-btn" onClick={() => setDefaultDuration(defaultDuration + 60)}>+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-header mt-12">
                        <label className="section-label-v2">MANUAL DUEL CREATOR</label>
                        <p className="p-muted">Hand-pick opponents and inject custom matches into the queue.</p>
                      </div>
                      <div className="p-grid mt-4">
                        <div className="p-selectors">
                          <div className="p-select-wrapper" style={{ flex: 1 }}>
                            <select className="premium-input-v2" value={manualPair[0]} onChange={e => setManualPair([e.target.value, manualPair[1]])}>
                              <option value="">SELECT TEAM A</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                          <div className="vs-tiny">VS</div>
                          <div className="p-select-wrapper" style={{ flex: 1 }}>
                            <select className="premium-input-v2" value={manualPair[1]} onChange={e => setManualPair([manualPair[0], e.target.value])}>
                              <option value="">SELECT TEAM B</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <button className="button button-gold button-lg w-full" onClick={() => {
                          if (manualPair[0] && manualPair[1]) {
                            addManualMatch(manualPair[0], manualPair[1]);
                            if (manualPair[0] !== manualPair[1]) setManualPair(["", ""]);
                          } else {
                            setModalConfig({ icon: "❗", title: "MISSING SELECTION", message: "Please select both teams before attempting to inject a match.", onConfirm: () => setModalConfig(null) });
                          }
                        }}>INJECT MATCH INTO QUEUE</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="summary-column">
                  <label className="section-label-v2">PARTICIPANT STATUS</label>
                  <div className="team-status-grid">
                    {teams.map(t => (
                      <div key={t.id} className="team-status-chip">
                        <div className="t-main">
                          {editingTeamId === t.id ? (
                            <input className="edit-team-input-inline" value={editingTeamName} onChange={e => setEditingTeamName(e.target.value)} onBlur={() => updateTeamName(t.id, editingTeamName)} onKeyPress={e => e.key === 'Enter' && updateTeamName(t.id, editingTeamName)} autoFocus />
                          ) : (
                            <span className="t-name" onClick={() => !isLocked && (setEditingTeamId(t.id), setEditingTeamName(t.name))}>{t.name}</span>
                          )}
                          <span className="t-matches">{t.matches_played}/{matchesPerTeam}</span>
                        </div>
                        {!isLocked && (
                          <div className="t-actions">
                            <button className="t-edit" onClick={() => { setEditingTeamId(t.id); setEditingTeamName(t.name); }}>✎</button>
                            <button className="t-remove" onClick={() => removeTeam(t.id)}>×</button>
                          </div>
                        )}
                        {matches.filter(m => m.team_a_id === t.id || m.team_b_id === t.id).length < matchesPerTeam && <div className="bye-badge animate-pulse">SEEKING OPPONENT</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="premium-standings slide-in">
          <div className="standings-grid-v2">
            {[...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => {
              const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
              return (
                <div key={t.id} className={`standing-card-v2 ${rankClass}`}>
                  <div className="rank-indicator">{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                  <div className="team-info"><div className="team-name">{t.name}</div><div className="team-status">{t.matches_played} MATCHES PLAYED</div></div>
                  <div className="stats-row">
                    <div className="stat"><div className="stat-label">WINS</div><div className="stat-val win">{t.group_points}</div></div>
                    <div className="stat"><div className="stat-label">SCORE</div><div className="stat-val">{t.total_score}</div></div>
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
