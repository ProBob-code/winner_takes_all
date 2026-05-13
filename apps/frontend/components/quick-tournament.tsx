"use client";

import React, { useState, useEffect } from "react";
import { backendFetch } from "@/lib/backend";
import { TeamPod, VSCore, FootballTeamPod, ScorersList, FootballScoreboard, FootballPossessionPitch } from "@/components/match-components";
import "@/components/tournament-engine.css";

type Player = {
  id: string;
  name: string;
  total_balls_potted: number;
  total_fouls: number;
};

type Team = { 
  id: string; 
  name: string; 
  matches_played: number; 
  group_points: number; 
  total_score: number; 
  total_balls_potted: number; 
  total_fouls: number; 
  is_team: boolean;
  players: Player[];
};
type GoalEvent = {
  id: string;
  scorerId: string;
  scorerName: string;
  minute: number;
  teamId: string;
};

type FootballMatchData = {
  goals: GoalEvent[];
  possession_a: number;
  possession_b: number;
  passing_a: number;
  passing_b: number;
};

type SportType = '8BALL' | 'FOOTBALL';

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
  active_player_a_id?: string | null;
  active_player_b_id?: string | null;
  sport: SportType;
  footballData?: FootballMatchData;
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
  const [confirmRestartMatchId, setConfirmRestartMatchId] = useState<string | null>(null);

  const [matches, setMatches] = useState<Match[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'arena' | 'standings'>('arena');
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [arenaId, setArenaId] = useState<string>("");
  const [matchesPerTeam, setMatchesPerTeam] = useState(3);
  const [defaultDuration, setDefaultDuration] = useState(600);
  const [tournamentType, setTournamentType] = useState<'GROUP' | 'KNOCKOUT' | 'FINALS'>('GROUP');
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
  const [participantType, setParticipantType] = useState<'SINGLE' | 'TEAM'>('SINGLE');
  const [teamPlayersInput, setTeamPlayersInput] = useState<string[]>(["", ""]);
  const [selectedSport, setSelectedSport] = useState<SportType>('8BALL');
  const [goalModal, setGoalModal] = useState<{ matchId: string, teamId: string, teamName: string } | null>(null);
  const [selectedScorer, setSelectedScorer] = useState<string>("");
  const [goalMinute, setGoalMinute] = useState<number>(0);

  // Sync with LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("wta_arena_quick_v11");
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
      setSelectedSport(parsed.selectedSport || '8BALL');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wta_arena_quick_v11", JSON.stringify({ 
      teams, matches, isStarted, arenaId, matchesPerTeam, defaultDuration, 
      tournamentType, arenaName, arenaPin, isLocked, selectedSport 
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
  }, [teams, matches, isStarted, arenaId, matchesPerTeam, defaultDuration, tournamentType, arenaName, arenaPin, isLocked, selectedSport]);

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
              
              setTeams(tPrev => tPrev.map(t => {
                if (t.id !== nm.team_a_id && t.id !== nm.team_b_id) return t;

                const updatedPlayers = t.players.map(p => {
                  const isActive = (t.id === nm.team_a_id && p.id === nm.active_player_a_id) || 
                                   (t.id === nm.team_b_id && p.id === nm.active_player_b_id);
                  if (!isActive) return p;
                  return p; 
                });

                const isFootball = nm.sport === 'FOOTBALL';
                const winPoints = isFootball ? 3 : 1;
                const drawPoints = isFootball ? 1 : 0;
                const pointsGained = nm.winner_id === t.id ? winPoints : (nm.is_draw ? drawPoints : 0);

                return { 
                  ...t, 
                  matches_played: t.matches_played + 1, 
                  total_score: t.total_score + (t.id === nm.team_a_id ? nm.score_team_a : nm.score_team_b) + (!isFootball && isDraw ? 50 : 0), 
                  group_points: t.group_points + pointsGained,
                  total_balls_potted: t.total_balls_potted + (t.id === nm.team_a_id ? nm.balls_potted_a : nm.balls_potted_b),
                  total_fouls: t.total_fouls + (t.id === nm.team_a_id ? nm.fouls_a : nm.fouls_b),
                  players: updatedPlayers
                };
              }));
              
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
              fouls_a: 0, fouls_b: 0,
              sport: selectedSport,
              footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
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
              fouls_a: 0, fouls_b: 0,
              sport: selectedSport,
              footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
            });
          }
        }
      }
    }
    return newMatches;
  };

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    
    let players: Player[] = [];
    if (participantType === 'SINGLE') {
      players = [{
        id: Math.random().toString(36).substr(2, 9),
        name: newTeamName.trim(),
        total_balls_potted: 0,
        total_fouls: 0
      }];
    } else {
      players = teamPlayersInput
        .filter(name => name.trim())
        .map(name => ({
          id: Math.random().toString(36).substr(2, 9),
          name: name.trim(),
          total_balls_potted: 0,
          total_fouls: 0
        }));
      if (players.length < 2) {
        setModalConfig({
          icon: "⚠️",
          title: "INVALID TEAM",
          message: "A team must have at least 2 players.",
          onConfirm: () => setModalConfig(null)
        });
        return;
      }
    }

    const newTeam: Team = { 
      id: Math.random().toString(36).substr(2, 9), 
      name: newTeamName.trim(), 
      matches_played: 0, 
      group_points: 0, 
      total_score: 0, 
      total_balls_potted: 0, 
      total_fouls: 0,
      is_team: participantType === 'TEAM',
      players
    };
    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    setNewTeamName("");
    setTeamPlayersInput(["", ""]);

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
      fouls_a: 0, fouls_b: 0,
      active_player_a_id: teams.find(t => t.id === t1Id)?.players[0]?.id || null,
      active_player_b_id: teams.find(t => t.id === t2Id)?.players[0]?.id || null,
      sport: selectedSport,
      footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
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
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0,
            sport: selectedSport,
            footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
          });
          knockoutMatches.push({
            id: `sf-2`, team_a_id: top4[1].id, team_b_id: top4[2].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 1,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0,
            sport: selectedSport,
            footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
          });
        } else {
          knockoutMatches.push({
            id: `final`, team_a_id: top4[0].id, team_b_id: top4[1].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 0,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0,
            sport: selectedSport,
            footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
          });
        }
        setTournamentType('KNOCKOUT');
        setMatches(knockoutMatches);
        setModalConfig(null);
      }
    });
  };

  const advanceToFinals = () => {
    const sf1 = matches.find(m => m.id === 'sf-1');
    const sf2 = matches.find(m => m.id === 'sf-2');
    
    if (!sf1 || !sf2 || !sf1.winner_id || !sf2.winner_id) {
      setModalConfig({
        icon: "⚠️",
        title: "INCOMPLETE SEMI-FINALS",
        message: "You must complete both Semi-Final matches before advancing to the Finals.",
        onConfirm: () => setModalConfig(null)
      });
      return;
    }

    setModalConfig({
      icon: "👑",
      title: "ADVANCE TO FINALS?",
      message: `The Semi-Finals are complete! We will now generate the Grand Final between ${getTeamName(sf1.winner_id)} and ${getTeamName(sf2.winner_id)}.`,
      onConfirm: () => {
        const finalMatch: Match = {
          id: `final`, team_a_id: sf1.winner_id!, team_b_id: sf2.winner_id!,
          score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
          black_potted_a: false, black_potted_b: false, status: 'CREATED',
          winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 0,
          team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0,
          sport: selectedSport,
          footballData: selectedSport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
        };
        setMatches([...matches, finalMatch]);
        setTournamentType('FINALS');
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
    setMatches(matches.map(m => {
      if (m.id === matchId) {
        const otherTeam = team === 'A' ? 'B' : 'A';
        const otherHouse = house === 'SOLID' ? 'STRIPES' : 'SOLID';
        return { 
          ...m, 
          [`team_${team.toLowerCase()}_house`]: house,
          [`team_${otherTeam.toLowerCase()}_house`]: otherHouse 
        };
      }
      return m;
    }));
  };

  const updateScore = (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'FOUL' | 'REMOVE_BALL' | 'REMOVE_FOUL') => {
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
      } else if (type === 'REMOVE_BALL') {
        if (isA && nm.balls_potted_a > 0) {
          nm.balls_potted_a--;
          nm.score_team_a -= 10;
        } else if (!isA && nm.balls_potted_b > 0) {
          nm.balls_potted_b--;
          nm.score_team_b -= 10;
        }
      } else if (type === 'FOUL') {
        if (isA) {
          nm.fouls_a++;
          nm.score_team_a -= 5;
        } else {
          nm.fouls_b++;
          nm.score_team_b -= 5;
        }
      } else if (type === 'REMOVE_FOUL') {
        if (isA && nm.fouls_a > 0) {
          nm.fouls_a--;
          nm.score_team_a += 5;
        } else if (!isA && nm.fouls_b > 0) {
          nm.fouls_b--;
          nm.score_team_b += 5;
        }
      } else if (type === 'BLACK') {
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
      }

      // Update team and player stats for ANY change
      setTeams(prev => prev.map(t => {
        if (t.id !== nm.team_a_id && t.id !== nm.team_b_id) return t;

        const isCurrentTeam = t.id === teamId;
        const updatedPlayers = t.players.map(p => {
          const isActive = (t.id === nm.team_a_id && p.id === nm.active_player_a_id) || 
                           (t.id === nm.team_b_id && p.id === nm.active_player_b_id);
          if (!isActive || !isCurrentTeam) return p;
          
          if (type === 'BALL') return { ...p, total_balls_potted: p.total_balls_potted + 1 };
          if (type === 'REMOVE_BALL') return { ...p, total_balls_potted: Math.max(0, p.total_balls_potted - 1) };
          if (type === 'FOUL') return { ...p, total_fouls: p.total_fouls + 1 };
          if (type === 'REMOVE_FOUL') return { ...p, total_fouls: Math.max(0, p.total_fouls - 1) };
          return p;
        });

        const isMatchComplete = nm.status === 'COMPLETED';
        const isFootball = nm.sport === 'FOOTBALL';
        const winPoints = isFootball ? 3 : 1;
        const drawPoints = isFootball ? 1 : 0;
        
        let pointsGained = 0;
        if (isMatchComplete) {
          pointsGained = nm.winner_id === t.id ? winPoints : (nm.score_team_a === nm.score_team_b ? drawPoints : 0);
        }

        return { 
          ...t, 
          matches_played: isMatchComplete ? t.matches_played + 1 : t.matches_played, 
          total_score: isMatchComplete ? t.total_score + (t.id === nm.team_a_id ? nm.score_team_a : nm.score_team_b) + (!isFootball && nm.score_team_a === nm.score_team_b ? 50 : 0) : t.total_score, 
          group_points: isMatchComplete ? t.group_points + pointsGained : t.group_points,
          total_balls_potted: t.total_balls_potted + (type === 'BALL' && isCurrentTeam ? 1 : (type === 'REMOVE_BALL' && isCurrentTeam ? -1 : 0)),
          total_fouls: t.total_fouls + (type === 'FOUL' && isCurrentTeam ? 1 : (type === 'REMOVE_FOUL' && isCurrentTeam ? -1 : 0)),
          players: updatedPlayers
        };
      }));

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

  const restartMatch = (matchId: string) => {
    setMatches(matches.map(m => m.id === matchId ? { 
      ...m, 
      score_team_a: 0, score_team_b: 0, 
      balls_potted_a: 0, balls_potted_b: 0,
      fouls_a: 0, fouls_b: 0,
      black_potted_a: false, black_potted_b: false,
      start_time: currentTime,
      footballData: m.sport === 'FOOTBALL' ? { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 } : undefined
    } : m));
  };

  const addGoal = () => {
    if (!goalModal || !selectedScorer) return;
    const { matchId, teamId } = goalModal;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const player = teams.find(t => t.id === teamId)?.players.find(p => p.id === selectedScorer);
    if (!player) return;

    const elapsedSeconds = currentTime - (match.start_time || currentTime);
    const minute = Math.floor(elapsedSeconds / 60) + 1;

    const newGoal: GoalEvent = {
      id: `g-${Date.now()}`,
      scorerId: selectedScorer,
      scorerName: player.name,
      minute: goalMinute || minute,
      teamId
    };

    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      const isA = m.team_a_id === teamId;
      const fd = m.footballData || { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 };
      return {
        ...m,
        score_team_a: isA ? m.score_team_a + 1 : m.score_team_a,
        score_team_b: !isA ? m.score_team_b + 1 : m.score_team_b,
        footballData: {
          ...fd,
          goals: [...fd.goals, newGoal]
        }
      };
    }));

    setGoalModal(null);
    setSelectedScorer("");
    setGoalMinute(0);
    playBuzzer(); // Goal celebration buzzer
  };

  const undoGoal = (matchId: string, teamId: string) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      const fd = m.footballData;
      if (!fd || fd.goals.length === 0) return m;

      const teamGoals = fd.goals.filter(g => g.teamId === teamId);
      if (teamGoals.length === 0) return m;

      const lastGoal = teamGoals[teamGoals.length - 1];
      const isA = m.team_a_id === teamId;

      return {
        ...m,
        score_team_a: isA ? Math.max(0, m.score_team_a - 1) : m.score_team_a,
        score_team_b: !isA ? Math.max(0, m.score_team_b - 1) : m.score_team_b,
        footballData: {
          ...fd,
          goals: fd.goals.filter(g => g.id !== lastGoal.id)
        }
      };
    }));
  };

  const updateFootballStat = (matchId: string, type: 'possession' | 'passing', team: 'A' | 'B', value: number) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      const fd = m.footballData || { goals: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80 };
      const next = { ...fd };
      if (type === 'possession') {
        if (team === 'A') {
          next.possession_a = value;
          next.possession_b = 100 - value;
        } else {
          next.possession_b = value;
          next.possession_a = 100 - value;
        }
      } else {
        if (team === 'A') next.passing_a = value;
        else next.passing_b = value;
      }
      return { ...m, footballData: next };
    }));
  };

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || "Unknown";


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
                <label className="section-label-v2">SELECT SPORT</label>
                <div className="segmented-control-v2">
                  <button className={`segment-btn ${selectedSport === '8BALL' ? 'active' : ''}`} onClick={() => setSelectedSport('8BALL')}>8-BALL POOL</button>
                  <button className={`segment-btn ${selectedSport === 'FOOTBALL' ? 'active' : ''}`} onClick={() => setSelectedSport('FOOTBALL')}>FOOTBALL</button>
                </div>
              </div>

              <div className="form-group mt-10">
                <label className="section-label-v2">TOURNAMENT FORMAT</label>
                <div className="segmented-control-v2">
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
              <label className="section-label-v2">PARTICIPANT TYPE</label>
              <div className="segmented-control-v2 mb-10">
                <button className={`segment-btn ${participantType === 'SINGLE' ? 'active' : ''}`} onClick={() => setParticipantType('SINGLE')}>SINGLE PLAYER</button>
                <button className={`segment-btn ${participantType === 'TEAM' ? 'active' : ''}`} onClick={() => setParticipantType('TEAM')}>TEAM</button>
              </div>

              <label className="section-label-v2">{participantType === 'SINGLE' ? 'PLAYER IDENTITY' : 'TEAM IDENTITY'}</label>
              <div className="roster-input-wrapper">
                <input
                  className="premium-input-v2"
                  placeholder={participantType === 'SINGLE' ? "Enter Player name..." : "Enter Team name..."}
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                />
              </div>

              {participantType === 'TEAM' && (
                <div className="team-members-setup mt-10 animate-in">
                  <label className="section-label-v2">TEAM MEMBERS <span className="dim">({teamPlayersInput.length})</span></label>
                  <div className="members-grid">
                    {teamPlayersInput.map((name, i) => (
                      <div key={i} className="member-input-row">
                        <input
                          className="premium-input-v2-sm"
                          placeholder={`Player ${i + 1} Name`}
                          value={name}
                          onChange={e => {
                            const next = [...teamPlayersInput];
                            next[i] = e.target.value;
                            setTeamPlayersInput(next);
                          }}
                        />
                        {teamPlayersInput.length > 2 && (
                          <button className="remove-member-btn" onClick={() => setTeamPlayersInput(teamPlayersInput.filter((_, idx) => idx !== i))}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="add-member-trigger mt-4" onClick={() => setTeamPlayersInput([...teamPlayersInput, ""])}>+ ADD MEMBER</button>
                </div>
              )}

              <button className="launch-btn ready mt-10" onClick={addTeam}>
                {participantType === 'SINGLE' ? 'ADD PLAYER' : 'ADD TEAM'}
              </button>

              <label className="section-label-v2 mt-12">ACTIVE ROSTER</label>

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
                            <div className="roster-info-stack">
                              <span className="roster-main-name" onClick={() => { setEditingTeamId(t.id); setEditingTeamName(t.name); }}>{t.name}</span>
                              {t.is_team && <span className="roster-sub-members">{t.players.map(p => p.name).join(', ')}</span>}
                            </div>
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
    <div className="engine-container">
      {victoryMatch && (
        <div className="victory-overlay">
          <div className="victory-podium">
            <div className="v-match-status">{victoryMatch.is_draw ? 'DRAW' : 'MATCH COMPLETE'}</div>
            
            {!victoryMatch.is_draw ? (
              <>
                <div className="v-crown">👑</div>
                <h1 className="v-name-xl glow-text-gold">{getTeamName(victoryMatch.winner_id || "")}</h1>
                <div className="v-label" style={{ letterSpacing: '8px', color: 'var(--gold)', marginBottom: '3rem', fontWeight: 950 }}>VICTORIOUS</div>
              </>
            ) : (
              <>
                <div className="v-crown">🤝</div>
                <h1 className="v-name-xl glow-text">STALEMATE</h1>
                <div className="v-label" style={{ letterSpacing: '8px', color: 'rgba(255,255,255,0.4)', marginBottom: '3rem', fontWeight: 950 }}>DRAW DECLARED</div>
              </>
            )}

            <div className="v-stats-comparison">
              <div className="v-team-result">
                <span className="v-team-name">{getTeamName(liveMatch?.team_a_id || victoryMatch.team_a_id)}</span>
                <span className="v-team-score">{victoryMatch.score_team_a}</span>
              </div>
              <div className="v-vs-divider">VS</div>
              <div className="v-team-result">
                <span className="v-team-name">{getTeamName(liveMatch?.team_b_id || victoryMatch.team_b_id)}</span>
                <span className="v-team-score">{victoryMatch.score_team_b}</span>
              </div>
            </div>

            {victoryMatch.sport === 'FOOTBALL' && (
              <div className="v-football-summary mt-8" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', width: '100%', textAlign: 'left' }}>
                <div className="v-scorers-col">
                  <ScorersList goals={victoryMatch.footballData?.goals || []} teamId={victoryMatch.team_a_id} />
                </div>
                <div className="v-scorers-col">
                  <ScorersList goals={victoryMatch.footballData?.goals || []} teamId={victoryMatch.team_b_id} />
                </div>
              </div>
            )}

            <div className="v-actions-row">
              <button className="v-action-btn" onClick={() => setVictoryMatch(null)}>CONTINUE TO ARENA</button>
            </div>
          </div>

        </div>
      )}

      {modalConfig && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
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
          <div className="custom-modal">
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

      {confirmRestartMatchId && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🔄</div>
            <h2>Restart Match?</h2>
            <p className="muted">This will reset the current scores, fouls, and ball counts for this match. Are you sure?</p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setConfirmRestartMatchId(null)}>CANCEL</button>
              <button className="button button-danger" onClick={() => { restartMatch(confirmRestartMatchId); setConfirmRestartMatchId(null); }}>RESTART MATCH</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🚀</div>
            <h2 className="glow-text">Arena is Live!</h2>
            <p className="muted">Your battleground is now synchronized with the global spectator network. Share the link below.</p>
            <div className="share-link-premium mt-8">
              <div className="link-display"><span className="link-text">{window.location.origin}/arena/{arenaId}</span></div>
              <div className="share-actions-group-v2 mt-6">
                <button className="button button-gold w-full" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/arena/${arenaId}`);
                  const btn = document.querySelector('.share-actions-group-v2 .button-gold') as HTMLButtonElement;
                  if (btn) { const old = btn.innerText; btn.innerText = 'COPIED! ✅'; setTimeout(() => btn.innerText = old, 2000); }
                }}>📋 COPY LINK</button>
                
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button className="button button-secondary w-full" onClick={() => {
                    navigator.share({
                      title: `🏆 ARENA IS LIVE: ${arenaName}`,
                      text: `🔥 WITNESS THE SHOWDOWN! Step into the world-class stadium arena for the ${arenaName} tournament. Watch real-time multi-game duels live on Stadium Arena!`,
                      url: `${window.location.origin}/arena/${arenaId}`,
                    }).catch(console.error);
                  }}>🔗 SYSTEM SHARE</button>
                )}
              </div>
            </div>
            <button className="button button-secondary mt-8 w-full" onClick={() => setShowShareModal(false)}>BACK TO CONTROL ROOM</button>
          </div>
        </div>
      )}

      {showPinModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
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

      {goalModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">⚽</div>
            <h2>RECORD GOAL</h2>
            <p className="muted">Recording goal for {goalModal.teamName}</p>
            
            <div className="form-group mt-6">
              <label className="section-label-v2">SELECT SCORER</label>
              <select className="premium-input-v2" value={selectedScorer} onChange={e => setSelectedScorer(e.target.value)}>
                <option value="">-- Choose Player --</option>
                {teams.find(t => t.id === goalModal.teamId)?.players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group mt-4">
              <label className="section-label-v2">MINUTE (OPTIONAL)</label>
              <input 
                type="number" 
                className="premium-input-v2" 
                placeholder="Auto-calculating..." 
                value={goalMinute || ""} 
                onChange={e => setGoalMinute(Number(e.target.value))}
              />
            </div>

            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => setGoalModal(null)}>CANCEL</button>
              <button className="button button-gold" onClick={addGoal} disabled={!selectedScorer}>CONFIRM GOAL</button>
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
          <button className="t-remove" onClick={() => setShowAddTeamInline(false)} style={{ height: 'fit-content', padding: '0.8rem 1rem' }}>×</button>
        </div>
      )}

      {activeSubTab === 'arena' ? (
        <div className="live-arena-v2">
          {liveMatch ? (
            <div className="match-engine-v2">
              {liveMatch.sport === 'FOOTBALL' ? (
                <FootballScoreboard 
                  teamAName={getTeamName(liveMatch.team_a_id)}
                  teamBName={getTeamName(liveMatch.team_b_id)}
                  scoreA={liveMatch.score_team_a}
                  scoreB={liveMatch.score_team_b}
                  time={`${Math.max(0, Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime) / 60))}:${String(Math.max(0, ((liveMatch.start_time || 0) + liveMatch.duration - currentTime) % 60)).padStart(2, '0')}`}
                  status={liveMatch.status === 'LIVE' ? 'LIVE' : liveMatch.status}
                />
              ) : (
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
                  <button className="extra-time-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => setConfirmRestartMatchId(liveMatch.id)}>RESTART</button>
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
              )}

              <div className={`battle-view ${liveMatch.sport === 'FOOTBALL' ? 'football-arena' : ''}`}>
                {liveMatch.sport === '8BALL' ? (
                  <>
                    <div className="pod-wrapper red">
                      {liveMatch.team_a_id && teams.find(t => t.id === liveMatch.team_a_id)?.is_team && (
                        <div className="player-select-overlay">
                          <span className="section-label-v2" style={{ textAlign: 'center', marginBottom: '4px' }}>ACTIVE SHOOTER</span>
                          <div className="player-chips">
                            {teams.find(t => t.id === liveMatch.team_a_id)?.players.map(p => (
                              <div 
                                key={p.id} 
                                className={`player-chip ${liveMatch.active_player_a_id === p.id ? 'active' : ''}`}
                                onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_player_a_id: p.id } : m))}
                              >
                                {p.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <TeamPod 
                        teamName={getTeamName(liveMatch.team_a_id)}
                        score={liveMatch.score_team_a}
                        color="red"
                        isActive={liveMatch.active_team_id === liveMatch.team_a_id}
                        fouls={liveMatch.fouls_a}
                        house={liveMatch.team_a_house}
                        ballsPotted={liveMatch.balls_potted_a}
                        blackPotted={liveMatch.black_potted_a}
                        onFoulClick={() => updateScore(liveMatch.id, liveMatch.team_a_id, 'FOUL')}
                        onFoulRemove={() => updateScore(liveMatch.id, liveMatch.team_a_id, 'REMOVE_FOUL')}
                        onBallClick={() => updateScore(liveMatch.id, liveMatch.team_a_id, 'BALL')}
                        onBallRemove={() => updateScore(liveMatch.id, liveMatch.team_a_id, 'REMOVE_BALL')}
                        onBlackClick={() => updateScore(liveMatch.id, liveMatch.team_a_id, 'BLACK')}
                        onHouseToggle={(h) => updateHouse(liveMatch.id, 'A', h)}
                        isLocked={isLocked}
                        onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_a_id } : m))}
                      />
                    </div>

                    <VSCore />

                    <div className="pod-wrapper blue">
                      {liveMatch.team_b_id && teams.find(t => t.id === liveMatch.team_b_id)?.is_team && (
                        <div className="player-select-overlay">
                          <span className="section-label-v2" style={{ textAlign: 'center', marginBottom: '4px' }}>ACTIVE SHOOTER</span>
                          <div className="player-chips">
                            {teams.find(t => t.id === liveMatch.team_b_id)?.players.map(p => (
                              <div 
                                key={p.id} 
                                className={`player-chip ${liveMatch.active_player_b_id === p.id ? 'active' : ''}`}
                                onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_player_b_id: p.id } : m))}
                              >
                                {p.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <TeamPod 
                        teamName={getTeamName(liveMatch.team_b_id)}
                        score={liveMatch.score_team_b}
                        color="blue"
                        isActive={liveMatch.active_team_id === liveMatch.team_b_id}
                        fouls={liveMatch.fouls_b}
                        house={liveMatch.team_b_house}
                        ballsPotted={liveMatch.balls_potted_b}
                        blackPotted={liveMatch.black_potted_b}
                        onFoulClick={() => updateScore(liveMatch.id, liveMatch.team_b_id, 'FOUL')}
                        onFoulRemove={() => updateScore(liveMatch.id, liveMatch.team_b_id, 'REMOVE_FOUL')}
                        onBallClick={() => updateScore(liveMatch.id, liveMatch.team_b_id, 'BALL')}
                        onBallRemove={() => updateScore(liveMatch.id, liveMatch.team_b_id, 'REMOVE_BALL')}
                        onBlackClick={() => updateScore(liveMatch.id, liveMatch.team_b_id, 'BLACK')}
                        onHouseToggle={(h) => updateHouse(liveMatch.id, 'B', h)}
                        isLocked={isLocked}
                        onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_b_id } : m))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pod-wrapper red">
                      <FootballTeamPod 
                        teamName={getTeamName(liveMatch.team_a_id)}
                        score={liveMatch.score_team_a}
                        color="red"
                        isActive={liveMatch.active_team_id === liveMatch.team_a_id}
                        possession={liveMatch.footballData?.possession_a || 50}
                        passing={liveMatch.footballData?.passing_a || 80}
                        goals={liveMatch.footballData?.goals || []}
                        teamId={liveMatch.team_a_id}
                        onGoalClick={() => setGoalModal({ matchId: liveMatch.id, teamId: liveMatch.team_a_id, teamName: getTeamName(liveMatch.team_a_id) })}
                        onUndoGoal={() => undoGoal(liveMatch.id, liveMatch.team_a_id)}
                        isLocked={isLocked}
                        onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_a_id } : m))}
                      />
                    </div>
                    {liveMatch.sport !== 'FOOTBALL' && <VSCore />}
                    <div className="pod-wrapper blue">
                      <FootballTeamPod 
                        teamName={getTeamName(liveMatch.team_b_id)}
                        score={liveMatch.score_team_b}
                        color="blue"
                        isActive={liveMatch.active_team_id === liveMatch.team_b_id}
                        possession={liveMatch.footballData?.possession_b || 50}
                        passing={liveMatch.footballData?.passing_b || 80}
                        goals={liveMatch.footballData?.goals || []}
                        teamId={liveMatch.team_b_id}
                        onGoalClick={() => setGoalModal({ matchId: liveMatch.id, teamId: liveMatch.team_b_id, teamName: getTeamName(liveMatch.team_b_id) })}
                        onUndoGoal={() => undoGoal(liveMatch.id, liveMatch.team_b_id)}
                        isLocked={isLocked}
                        onClick={() => setMatches(matches.map(m => m.id === liveMatch.id ? { ...m, active_team_id: liveMatch.team_b_id } : m))}
                      />
                    </div>
                  </>
                )}
              </div>

              {liveMatch.sport === 'FOOTBALL' && (
                <div className="football-controls-panel-v3 slide-in mt-8">
                  <FootballPossessionPitch 
                    posA={liveMatch.footballData?.possession_a || 50}
                    posB={liveMatch.footballData?.possession_b || 50}
                    teamAName={getTeamName(liveMatch.team_a_id)}
                    teamBName={getTeamName(liveMatch.team_b_id)}
                  />
                  
                  <div className="stat-control-grid mt-8">
                    <div className="stat-control-group">
                      <label className="section-label-v2">POSSESSION BALANCE</label>
                      <div className="possession-slider-wrapper">
                        <input 
                          type="range" min="0" max="100" 
                          value={liveMatch.footballData?.possession_a || 50} 
                          onChange={(e) => updateFootballStat(liveMatch.id, 'possession', 'A', Number(e.target.value))}
                          className="premium-slider"
                        />
                      </div>
                    </div>
                    <div className="stat-control-grid">
                      <div className="stat-control-item">
                        <label className="section-label-v2">{getTeamName(liveMatch.team_a_id)} PASSING %</label>
                        <div className="stepper-v3">
                          <button className="s-btn" onClick={() => updateFootballStat(liveMatch.id, 'passing', 'A', Math.max(0, (liveMatch.footballData?.passing_a || 80) - 1))}>−</button>
                          <span className="s-val">{liveMatch.footballData?.passing_a}%</span>
                          <button className="s-btn" onClick={() => updateFootballStat(liveMatch.id, 'passing', 'A', Math.min(100, (liveMatch.footballData?.passing_a || 80) + 1))}>+</button>
                        </div>
                      </div>
                      <div className="stat-control-item">
                        <label className="section-label-v2">{getTeamName(liveMatch.team_b_id)} PASSING %</label>
                        <div className="stepper-v3">
                          <button className="s-btn" onClick={() => updateFootballStat(liveMatch.id, 'passing', 'B', Math.max(0, (liveMatch.footballData?.passing_b || 80) - 1))}>−</button>
                          <span className="s-val">{liveMatch.footballData?.passing_b}%</span>
                          <button className="s-btn" onClick={() => updateFootballStat(liveMatch.id, 'passing', 'B', Math.min(100, (liveMatch.footballData?.passing_b || 80) + 1))}>+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {createdMatches.length > 0 ? (
                <div className="queue-overlay">
                  <div className="queue-header"><div className="queue-title">UPCOMING DUELS ({createdMatches.length})</div></div>
                  <div className="queue-track">
                    {createdMatches.slice(0, 3).map((m, i) => (
                      <div key={m.id} className="queue-item"><span className="q-idx">{i + 1}</span><span className="q-names">{getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}</span></div>
                    ))}
                    {createdMatches.length > 3 && <div className="queue-more">+{createdMatches.length - 3} MORE</div>}
                  </div>
                </div>
              ) : (
                <div className="phase-transition-overlay">
                  <div className="phase-card glass-morphism">
                    {tournamentType === 'GROUP' ? (
                      <>
                        <div className="p-icon">🏁</div>
                        <h3>GROUP STAGE COMPLETE</h3>
                        <p className="muted">All teams have reached their match quota. Ready to resolve the tournament?</p>
                        <button className="button button-gold button-lg" onClick={advanceToKnockouts}>ADVANCE TO KNOCKOUTS</button>
                      </>
                    ) : tournamentType === 'KNOCKOUT' ? (
                      <>
                        <div className="p-icon">⚔️</div>
                        <h3>SEMI-FINALS COMPLETE</h3>
                        <p className="muted">The finalists have been decided! Ready for the Grand Finale?</p>
                        <button className="button button-gold button-lg" onClick={advanceToFinals}>ADVANCE TO FINALS</button>
                      </>
                    ) : (
                      <div className="tournament-completion-card animate-in">
                        <div className="p-icon" style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🏆</div>
                        <h2 className="glow-text-gold" style={{ fontSize: '2.5rem', fontWeight: 950, marginBottom: '0.5rem' }}>TOURNAMENT CONCLUDED</h2>
                        <p className="muted" style={{ letterSpacing: '2px', marginBottom: '3rem' }}>THE BATTLE HAS SETTLED • CHAMPIONS REMAIN</p>
                        
                        <div className="final-results-summary">
                          <div className="summary-item gold-border">
                            <div className="item-label">TOURNAMENT CHAMPION</div>
                            <div className="item-value">{[...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score)[0]?.name || "TBD"}</div>
                          </div>
                          <div className="summary-item">
                            <div className="item-label">MAN OF THE TOURNAMENT</div>
                            <div className="item-value">
                              {(() => {
                                const p = teams.flatMap(t => t.players).sort((a, b) => ((b.total_balls_potted * 10) - (b.total_fouls * 5)) - ((a.total_balls_potted * 10) - (a.total_fouls * 5)))[0];
                                return p ? `${p.name} (${(p.total_balls_potted * 10) - (p.total_fouls * 5)})` : "TBD";
                              })()}
                            </div>
                          </div>
                        </div>

                        <button className="button button-gold button-lg mt-12 w-full" onClick={() => setActiveSubTab('standings')}>VIEW FULL HALL OF FAME</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="tournament-schedule-view">
              <div className="schedule-header">
                <h3 className="glow-text">Arena Schedule</h3>
                <p className="muted">Manage future duels and live standings.</p>
              </div>
              <div className="schedule-grid mt-8">
                <div className="queue-column">
                  <label className="section-label-v2">MATCH QUEUE</label>
                  <div className="queue-list-premium">
                    {createdMatches.length > 0 ? createdMatches.map((m, i) => (
                      <div key={m.id} className="schedule-item-card animate-in" draggable onDragStart={(e) => onDragStart(e, m.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, m.id)} style={{ animationDelay: `${i * 0.1}s`, cursor: 'grab' }}>
                        <div className="s-handle">≡</div><div className="s-rank">#{i + 1}</div>
                        <div className="s-info">
                          <div className="s-pair">{getTeamName(m.team_a_id)} <span className="dim">vs</span> {getTeamName(m.team_b_id)}</div>
                          <div className="s-meta">MATCH {m.order + 1} • {tournamentType} STAGE</div>
                        </div>
                        <div className="s-actions">
                          <button className="button button-gold button-sm launch-btn-small" onClick={() => setMatches(matches.map(x => x.id === m.id ? { ...x, status: 'LIVE', start_time: currentTime } : x))}>LAUNCH</button>
                        </div>
                      </div>
                    )) : (
                      <div className="phase-card glass-morphism text-center mt-6">
                        {tournamentType === 'GROUP' ? (
                          <>
                            <div className="p-icon">🏁</div>
                            <h3>GROUP STAGE COMPLETE</h3>
                            <p className="muted mb-4">No matches left in the queue. Ready for knockouts?</p>
                            <button className="button button-gold button-lg" onClick={advanceToKnockouts}>ADVANCE TO KNOCKOUTS</button>
                          </>
                        ) : tournamentType === 'KNOCKOUT' ? (
                          <>
                            <div className="p-icon">⚔️</div>
                            <h3>SEMI-FINALS COMPLETE</h3>
                            <p className="muted mb-4">The finalists have been decided! Ready for the Grand Finale?</p>
                            <button className="button button-gold button-lg" onClick={advanceToFinals}>ADVANCE TO FINALS</button>
                          </>
                        ) : (
                          <>
                            <div className="p-icon">🏆</div>
                            <h3>TOURNAMENT COMPLETE</h3>
                            <p className="muted">The grand finals have concluded.</p>
                          </>
                        )}
                      </div>
                    )}

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
        <div className="premium-standings">
          {teams.length > 0 && (() => {
            const allPlayers = teams.flatMap(t => t.players.map(p => ({ 
              ...p, 
              teamName: t.name,
              rating: (p.total_balls_potted * 10) - (p.total_fouls * 5)
            })));
            const topPlayer = [...allPlayers].sort((a, b) => b.rating - a.rating || b.total_balls_potted - a.total_balls_potted)[0];
            const tournamentWinner = [...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score)[0];

            return (
              <div className="tournament-awards-row">
                <div className="award-card glass-morphism gold-glow">
                  <div className="award-icon">🏆</div>
                  <div className="award-content">
                    <div className="award-label">MAN OF THE TOURNAMENT</div>
                    <div className="award-winner glow-text-gold">
                      {topPlayer?.name || "TBD"}
                    </div>
                    <div className="award-meta">
                      {topPlayer?.rating || 0} RATING • {topPlayer?.teamName || ""}
                    </div>
                  </div>
                </div>
                <div className="award-card glass-morphism blue-glow">
                  <div className="award-icon">👑</div>
                  <div className="award-content">
                    <div className="award-label">TOURNAMENT CHAMPION</div>
                    <div className="award-winner glow-text">
                      {tournamentWinner?.name || "TBD"}
                    </div>
                    <div className="award-meta">
                      {tournamentWinner?.group_points || 0} WINS • {tournamentWinner?.total_score || 0} PTS
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="standings-grid-v2">
            {[...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score).map((t, i) => {
              const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
              return (
                <div key={t.id} className={`standing-card-v2 ${rankClass}`}>
                  <div className="rank-indicator">{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                  <div className="team-info">
                    <div className="team-name">{t.name}</div>
                    <div className="team-status">{t.matches_played} MATCHES PLAYED</div>
                  </div>
                  <div className="stats-row">
                    <div className="stat"><div className="stat-label">PTS</div><div className="stat-val win">{t.group_points}</div></div>
                    {selectedSport === '8BALL' ? (
                      <>
                        <div className="stat"><div className="stat-label">BALLS</div><div className="stat-val">{t.total_balls_potted}</div></div>
                        <div className="stat"><div className="stat-label">FOULS</div><div className="stat-val danger">{t.total_fouls}</div></div>
                        <div className="stat"><div className="stat-label">SCORE</div><div className="stat-val">{t.total_score}</div></div>
                      </>
                    ) : (
                      <>
                        {(() => {
                          const matchesPlayed = matches.filter(m => m.status === 'COMPLETED' && (m.team_a_id === t.id || m.team_b_id === t.id));
                          const gf = matchesPlayed.reduce((acc, m) => acc + (m.team_a_id === t.id ? m.score_team_a : m.score_team_b), 0);
                          const ga = matchesPlayed.reduce((acc, m) => acc + (m.team_a_id === t.id ? m.score_team_b : m.score_team_a), 0);
                          return (
                            <>
                              <div className="stat"><div className="stat-label">GF</div><div className="stat-val">{gf}</div></div>
                              <div className="stat"><div className="stat-label">GA</div><div className="stat-val">{ga}</div></div>
                              <div className="stat"><div className="stat-label">GD</div><div className="stat-val">{gf - ga >= 0 ? `+${gf - ga}` : gf - ga}</div></div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  
                  {t.is_team && (
                    <div className="player-breakdown-v2">
                      <div className="breakdown-header">SQUAD PERFORMANCE</div>
                      <div className="breakdown-grid">
                        {t.players.map(p => {
                          const isFootball = selectedSport === 'FOOTBALL';
                          const rating = isFootball 
                            ? (p.total_balls_potted * 5) // Use total_balls_potted for goals in football if we want, but actually we should use real goals
                            : (p.total_balls_potted * 10) - (p.total_fouls * 5);
                          
                          // In football, we should ideally use the actual goals recorded in footballData
                          const actualGoals = isFootball ? matches.reduce((acc, m) => {
                            if (m.sport !== 'FOOTBALL' || !m.footballData) return acc;
                            return acc + m.footballData.goals.filter(g => g.scorerId === p.id).length;
                          }, 0) : 0;

                          const footballRating = actualGoals * 10;

                          return (
                            <div key={p.id} className="p-breakdown-row">
                              <span className="p-b-name">{p.name}</span>
                              <div className="p-b-stats">
                                {isFootball ? (
                                  <>
                                    <div className="p-b-stat-item">
                                      <span className="p-b-label">GOALS</span>
                                      <span className="p-b-val">⚽ {actualGoals}</span>
                                    </div>
                                    <div className="p-b-stat-item" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                      <span className="p-b-label" style={{ color: 'var(--gold)' }}>RATING</span>
                                      <span className="p-b-val" style={{ color: 'var(--gold)' }}>{footballRating}</span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="p-b-stat-item">
                                      <span className="p-b-label">BALLS</span>
                                      <span className="p-b-val">🏀 {p.total_balls_potted}</span>
                                    </div>
                                    <div className="p-b-stat-item">
                                      <span className="p-b-label">FOULS</span>
                                      <span className="p-b-val" style={{ color: '#ef4444' }}>⚠️ {p.total_fouls}</span>
                                    </div>
                                    <div className="p-b-stat-item" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                      <span className="p-b-label" style={{ color: 'var(--gold)' }}>RATING</span>
                                      <span className="p-b-val" style={{ color: 'var(--gold)' }}>{rating}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
