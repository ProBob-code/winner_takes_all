"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { backendFetch } from "@/lib/backend";
import { FootballTeamPod, ScorersList, FootballScoreboard, FootballPossessionPitch } from "@/components/match-components";
import { FootballMatchEngine } from "./football-match-engine";
import { PoolMatchEngine } from "./pool-match-engine";
import { BroadcastCode } from "@/components/broadcast-code";
import "@/components/tournament-engine.css";

type Player = {
  id: string;
  name: string;
  total_balls_potted: number;
  total_fouls: number;
  role: 'CAPTAIN' | 'PLAYER' | 'SUB' | 'GOALKEEPER'; // Added role for lineup management
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

type SubEvent = {
  id: string;
  playerInId: string;
  playerInName: string;
  playerOutId: string;
  playerOutName: string;
  minute: number;
  teamId: string;
};

type CardEvent = {
  id: string;
  playerId: string;
  playerName: string;
  minute: number;
  type: 'YELLOW' | 'RED';
  teamId: string;
};

type AttemptEvent = {
  id: string;
  teamId: string;
  playerId: string;
  playerName: string;
  minute: number;
  outcome: 'SCORED' | 'SAVED' | 'MISSED';
  goalkeeperId?: string;
  goalkeeperName?: string;
};

type FootballMatchData = {
  goals: GoalEvent[];
  attempts?: AttemptEvent[];
  cards: CardEvent[]; // Record yellow/red cards
  possession_a: number;
  possession_b: number;
  passing_a: number;
  passing_b: number;
  extra_time?: number;
  timerSeconds: number; // elapsed seconds from start of current half
  half: 1 | 2; // Current half of the match
  lineup_a?: string[];
  lineup_b?: string[];
  captain_a?: string;
  captain_b?: string;
  subs?: SubEvent[];
};

const createDefaultFootballData = (teamA?: Team, teamB?: Team): FootballMatchData => ({
  goals: [],
  attempts: [],
  cards: [],
  possession_a: 50,
  possession_b: 50,
  passing_a: 80,
  passing_b: 80,
  timerSeconds: 0,
  half: 1,
  lineup_a: teamA?.players.map(p => p.id) || [],
  lineup_b: teamB?.players.map(p => p.id) || [],
  captain_a: teamA?.players[0]?.id,
  captain_b: teamB?.players[0]?.id,
  subs: []
});

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

const getElapsedSeconds = (match: Match) => {
  if (!match.footballData) return 0;
  const fd = match.footballData;
  if (fd.half === 1) {
    return fd.timerSeconds;
  } else {
    return Math.floor(match.duration / 2) + fd.timerSeconds;
  }
};

const getFootballTimeDisplay = (match: Match) => {
  if (!match.footballData) return "0:00";
  const fd = match.footballData;
  const halfDuration = Math.floor(match.duration / 2);
  
  if (fd.half === 1) {
    if (fd.timerSeconds >= halfDuration) {
      return "HALF TIME";
    }
    const mins = Math.floor(fd.timerSeconds / 60);
    const secs = fd.timerSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  } else {
    const totalSeconds = halfDuration + fd.timerSeconds;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
};

export function QuickTournament() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [confirmRestartMatchId, setConfirmRestartMatchId] = useState<string | null>(null);

  const [matches, setMatches] = useState<Match[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'arena' | 'screening' | 'standings'>('arena');
  const [activeLiveMatchId, setActiveLiveMatchId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [arenaId, setArenaId] = useState<string>("");
  const [matchesPerTeam, setMatchesPerTeam] = useState(3);
  const [defaultDuration, setDefaultDuration] = useState(600);
  const [tournamentType, setTournamentType] = useState<'GROUP' | 'KNOCKOUT' | 'FINALS'>('GROUP');
  const [arenaName, setArenaName] = useState("Stadium Arena Showdown");
  const [isPublishing, setIsPublishing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [victoryMatch, setVictoryMatch] = useState<Match | null>(null);
  const [extraTimePromptId, setExtraTimePromptId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showBroadcastCode, setShowBroadcastCode] = useState(false);
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
  const [teamPlayersInput, setTeamPlayersInput] = useState<{ name: string; role: 'CAPTAIN' | 'PLAYER' | 'SUB' | 'GOALKEEPER' }[]>([
    { name: "", role: "CAPTAIN" },
    { name: "", role: "GOALKEEPER" }
  ]);
  const [selectedSport, setSelectedSport] = useState<SportType>('8BALL');
  const [goalModal, setGoalModal] = useState<{ matchId: string, teamId: string, teamName: string } | null>(null);
  const [subModal, setSubModal] = useState<{ matchId: string, teamId: string, playerOutId: string } | null>(null);
  const [selectedScorer, setSelectedScorer] = useState<string>("");
  const [goalMinute, setGoalMinute] = useState<number>(0);
  const [lineupModalConfig, setLineupModalConfig] = useState<{
    matchId: string;
    teamAId: string;
    teamBId: string;
    lineupA: string[];
    lineupB: string[];
    captainA: string;
    captainB: string;
  } | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  /** Draft storage key, scoped to the signed-in account; null until resolved. */
  const [storageKey, setStorageKey] = useState<string | null>(null);

  /** Fastest cadence at which arena state is published to spectators. */
  const SYNC_INTERVAL_MS = 5000;
  const pendingSyncRef = useRef<any>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncAtRef = useRef(0);

  const flushSync = useCallback(async () => {
    const payload = pendingSyncRef.current;
    if (!payload) return;
    pendingSyncRef.current = null;
    lastSyncAtRef.current = Date.now();

    try {
      const res = await backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Silently dropping these left the arena live locally but absent from
      // Live Screening, with nothing on screen to explain the difference.
      if (!res.ok) {
        setSyncError(
          res.status === 401
            ? "Not synced: log in to publish this arena to the spectator network."
            : `Not synced: the server returned HTTP ${res.status}.`
        );
      } else {
        setSyncError(null);
      }
    } catch {
      setSyncError("Not synced: the spectator network is unreachable.");
    }
  }, []);

  /**
   * Drop anything queued for publication.
   *
   * The throttle holds the most recent state and sends it a moment later. When
   * a tournament closes, that pending payload still says the match is live, so
   * letting it fire would reopen the arena seconds after it was shut — which
   * is exactly what kept cameras running after a close.
   */
  const cancelPendingSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    pendingSyncRef.current = null;
  }, []);

  /** Trailing throttle: the newest state always lands, at most one call per interval. */
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) return;
    const wait = Math.max(0, SYNC_INTERVAL_MS - (Date.now() - lastSyncAtRef.current));
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void flushSync();
    }, wait);
  }, [flushSync]);


  /**
   * Restore the draft belonging to whoever is signed in.
   *
   * The draft used to live under one fixed key, which made it a property of
   * the browser rather than the account: sign out, sign in as someone else,
   * and their Quick Tournament was already populated with the previous
   * person's teams, arena id and PIN. Resolving the account first and keying
   * the draft by it keeps them separate, and a signed-out visitor gets their
   * own scratch space rather than sharing anyone's.
   */
  useEffect(() => {
    setIsMounted(true);
    let cancelled = false;

    (async () => {
      let owner = "guest";
      try {
        const res = await backendFetch("/user/profile");
        if (res.ok) {
          const data: any = await res.json();
          if (data?.user?.id) owner = String(data.user.id);
        }
      } catch {
        /* treated as a signed-out visitor */
      }
      if (cancelled) return;

      // The old shared draft cannot be attributed to an account, so it is
      // discarded rather than shown to whoever opens the page next.
      try {
        localStorage.removeItem("wta_arena_quick_v11");
      } catch {
        /* storage unavailable */
      }

      const key = `wta_arena_quick_v12:${owner}`;
      try {
        const saved = localStorage.getItem(key);
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
      } catch {
        /* a corrupt draft should not block the page */
      }

      setStorageKey(key);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Nothing is persisted until the owning account is known, or the first
    // render would write an empty draft over the stored one.
    if (!storageKey) return;

    localStorage.setItem(storageKey, JSON.stringify({ 
      teams, matches, isStarted, arenaId, matchesPerTeam, defaultDuration, 
      tournamentType, arenaName, arenaPin, isLocked, selectedSport 
    }));
    if (!(arenaId && isStarted)) {
      cancelPendingSync();
    }

    if (arenaId && isStarted) {
      // A football match ticks its clock into `matches` once a second, so this
      // effect fires every second. Publishing that directly meant a request
      // per second for the whole match. Keep only the latest state and send it
      // at a fixed cadence instead; spectators are watching a scoreboard, not
      // trading on it.
      pendingSyncRef.current = {
        id: arenaId,
        name: arenaName,
        state: { teams, matches, isStarted, selectedSport },
        pin: arenaPin ?? undefined,
      };
      scheduleSync();
    }
  }, [storageKey, teams, matches, isStarted, arenaId, matchesPerTeam, defaultDuration, tournamentType, arenaName, arenaPin, isLocked, selectedSport, cancelPendingSync]);

  useEffect(() => {
    if (teams.length >= 2) {
      const maxPossibleQuota = teams.length - 1;
      if (matchesPerTeam > maxPossibleQuota) {
        setMatchesPerTeam(maxPossibleQuota);
      } else if (matchesPerTeam === 3 && maxPossibleQuota < 3) {
        setMatchesPerTeam(maxPossibleQuota);
      } else if (teams.length === 4) {
        setMatchesPerTeam(3);
      }
    }
  }, [teams.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setCurrentTime(now);
      
      setMatches(prev => {
        let changed = false;
        const next = prev.map(m => {
          if (m.status === 'LIVE' && m.start_time) {
            const extraTime = m.footballData?.extra_time || 0;
            let remaining = (m.start_time + m.duration + extraTime) - now;
            if (m.sport === 'FOOTBALL' && m.footballData) {
              const fd = m.footballData;
              if (fd.half === 1) {
                remaining = 999;
              } else {
                remaining = Math.floor(m.duration / 2) - fd.timerSeconds;
              }
            }
            
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
              footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(t1, t2) : undefined
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
              footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(allTeams[i], allTeams[i + 1]) : undefined
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
        total_fouls: 0,
        role: 'CAPTAIN'
      }];
    } else {
      players = teamPlayersInput
        .filter(p => p.name.trim())
        .map((p, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: p.name.trim(),
          total_balls_potted: 0,
          total_fouls: 0,
          // 8-ball has no positional roles; keep a captain so lineup logic still resolves one.
          role: selectedSport === 'FOOTBALL' ? p.role : (i === 0 ? 'CAPTAIN' as const : 'PLAYER' as const)
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
    setTeamPlayersInput([
      { name: "", role: "CAPTAIN" },
      { name: "", role: "PLAYER" }
    ]);

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
      const res = await backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify({ id, name: arenaName, state: { teams, matches, isStarted }, pin: arenaPin ?? undefined })
      });

      // fetch only rejects on network failure, so a 401 or 403 arrives here as
      // a perfectly ordinary Response. Without this check the arena was never
      // stored and the share modal still claimed success.
      let payload: any = {};
      try {
        payload = await res.json();
      } catch {
        /* non-JSON error body */
      }

      if (!res.ok || payload.ok === false) {
        const reason =
          res.status === 401
            ? "You need to be logged in to publish an arena to the spectator network."
            : payload.message || `The server rejected the arena (HTTP ${res.status}).`;
        setSyncError(reason);
        setModalConfig({
          icon: "❌",
          title: "SYNC FAILED",
          message: reason,
          onConfirm: () => setModalConfig(null)
        });
        return;
      }

      setSyncError(null);
      setArenaId(id);
      setShowShareModal(true);
    } catch (e) {
      const reason = "Failed to publish arena to the network. Please check your connection.";
      setSyncError(reason);
      setModalConfig({
        icon: "❌",
        title: "SYNC FAILED",
        message: reason,
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
      footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(teams.find(t => t.id === t1Id), teams.find(t => t.id === t2Id)) : undefined
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
            footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(top4[0], top4[3]) : undefined
          });
          knockoutMatches.push({
            id: `sf-2`, team_a_id: top4[1].id, team_b_id: top4[2].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 1,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0,
            sport: selectedSport,
            footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(top4[1], top4[2]) : undefined
          });
        } else {
          knockoutMatches.push({
            id: `final`, team_a_id: top4[0].id, team_b_id: top4[1].id,
            score_team_a: 0, score_team_b: 0, balls_potted_a: 0, balls_potted_b: 0,
            black_potted_a: false, black_potted_b: false, status: 'CREATED',
            winner_id: null, active_team_id: null, duration: defaultDuration, start_time: null, order: 0,
            team_a_house: 'SOLID', team_b_house: 'STRIPES', fouls_a: 0, fouls_b: 0,
            sport: selectedSport,
            footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(top4[0], top4[1]) : undefined
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
          footballData: selectedSport === 'FOOTBALL' ? createDefaultFootballData(teams.find(t => t.id === sf1.winner_id), teams.find(t => t.id === sf2.winner_id)) : undefined
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
    cancelPendingSync();

    // Erasing locally is not enough: without telling the server, the arena
    // stays live to spectators, and its cameras with it, until the entry goes
    // stale. Close it on the way out.
    const abandonedArenaId = arenaId;
    if (abandonedArenaId) {
      const closedMatches = matches.map((m) =>
        m.status === 'COMPLETED' ? m : { ...m, status: 'COMPLETED' as const, active_team_id: null }
      );
      backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify({
          id: abandonedArenaId,
          name: arenaName,
          state: { teams, matches: closedMatches, isStarted: false, selectedSport },
          pin: arenaPin ?? undefined,
        }),
      }).catch(() => {
        /* the arena will fall out on its own once it stops being updated */
      });
    }

    setTeams([]);
    setMatches([]);
    setIsStarted(false);
    setArenaId("");
    setShowResetModal(false);
  };

  /**
   * End the tournament without erasing it: results stay on screen for the
   * host, but the arena stops broadcasting. Every unfinished match is marked
   * COMPLETED so Live Screening drops the arena and any phone streaming it
   * tears down on its next status poll.
   */
  const closeTournament = async () => {
    // Before anything else: a publish queued while the match was live would
    // otherwise fire after this and put the arena straight back on air.
    cancelPendingSync();

    const closedMatches = matches.map((m) =>
      m.status === 'COMPLETED'
        ? m
        : { ...m, status: 'COMPLETED' as const, active_team_id: null }
    );

    setMatches(closedMatches);
    setIsStarted(false);
    setShowCloseModal(false);

    // The background sync only runs while isStarted is true, so the closing
    // state has to be pushed explicitly or the arena would linger on the
    // spectator network until its entry went stale.
    if (!arenaId) return;
    try {
      const res = await backendFetch("/public-arenas", {
        method: "POST",
        body: JSON.stringify({
          id: arenaId,
          name: arenaName,
          state: { teams, matches: closedMatches, isStarted: false, selectedSport },
          pin: arenaPin ?? undefined,
        }),
      });
      setSyncError(res.ok ? null : `Closed locally, but the server returned HTTP ${res.status}.`);
    } catch {
      setSyncError("Closed locally, but the spectator network could not be reached.");
    }
  };

  const restartMatch = (matchId: string) => {
    setMatches(matches.map(m => m.id === matchId ? { 
      ...m, 
      score_team_a: 0, score_team_b: 0, 
      balls_potted_a: 0, balls_potted_b: 0,
      fouls_a: 0, fouls_b: 0,
      black_potted_a: false, black_potted_b: false,
      start_time: currentTime,
      footballData: m.sport === 'FOOTBALL' ? { 
        goals: [], 
        cards: [], 
        possession_a: 50, 
        possession_b: 50, 
        passing_a: 80, 
        passing_b: 80,
        timerSeconds: 0,
        half: 1,
        lineup_a: teams.find(t => t.id === m.team_a_id)?.players.map(p => p.id) || [],
        lineup_b: teams.find(t => t.id === m.team_b_id)?.players.map(p => p.id) || [],
        captain_a: teams.find(t => t.id === m.team_a_id)?.players[0]?.id,
        captain_b: teams.find(t => t.id === m.team_b_id)?.players[0]?.id,
        subs: []
      } : undefined
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
      const fd = m.footballData || { goals: [], cards: [], possession_a: 50, possession_b: 50, passing_a: 80, passing_b: 80, timerSeconds: 0, half: 1 };
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

  const recordCard = (matchId: string, teamId: string, playerId: string, cardType: 'YELLOW' | 'RED') => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      const fd = m.footballData;
      if (!fd) return m;
      const elapsed = getElapsedSeconds(m);
      const minute = Math.floor(elapsed / 60) + 1;
      const player = teams.find(t => t.id === teamId)?.players.find(p => p.id === playerId);
      if (!player) return m;

      // Count existing yellow cards for this player
      const existingYellows = fd.cards.filter(c => c.playerId === playerId && c.type === 'YELLOW').length;

      // If adding a second yellow, promote to red automatically
      let newCards: CardEvent[] = [];
      if (cardType === 'YELLOW' && existingYellows === 1) {
        // Second yellow becomes red and player is out
        newCards = [
          {
            id: `c-${Date.now()}-y`,
            playerId,
            playerName: player.name,
            minute,
            type: 'YELLOW',
            teamId
          },
          {
            id: `c-${Date.now()}-r`,
            playerId,
            playerName: player.name,
            minute,
            type: 'RED',
            teamId
          }
        ];
        // Mark player as substituted out (prevent re‑entry)
        const subEvent: SubEvent = {
          id: Math.random().toString(36).substr(2, 9),
          playerInId: '', // no replacement
          playerInName: '',
          playerOutId: playerId,
          playerOutName: player.name,
          minute,
          teamId
        };
        const nextLineupA = (fd.lineup_a || []).filter(id => id !== playerId);
        const nextLineupB = (fd.lineup_b || []).filter(id => id !== playerId);
        return {
          ...m,
          footballData: {
            ...fd,
            cards: [...fd.cards, ...newCards],
            subs: [...(fd.subs || []), subEvent],
            lineup_a: nextLineupA,
            lineup_b: nextLineupB
          }
        };
      }

      // Straight red or first yellow
      const card: CardEvent = {
        id: `c-${Date.now()}`,
        playerId,
        playerName: player.name,
        minute,
        type: cardType,
        teamId
      };
      const updatedCards = [...fd.cards, card];

      // If red card, also create substitution event to remove player
      let updatedSubs = fd.subs || [];
      let nextLineupA = fd.lineup_a || [];
      let nextLineupB = fd.lineup_b || [];
      if (cardType === 'RED') {
        const subEvent: SubEvent = {
          id: Math.random().toString(36).substr(2, 9),
          playerInId: '',
          playerInName: '',
          playerOutId: playerId,
          playerOutName: player.name,
          minute,
          teamId
        };
        updatedSubs = [...updatedSubs, subEvent];
        nextLineupA = nextLineupA.filter(id => id !== playerId);
        nextLineupB = nextLineupB.filter(id => id !== playerId);
      }

      return {
        ...m,
        footballData: {
          ...fd,
          cards: updatedCards,
          subs: updatedSubs,
          lineup_a: nextLineupA,
          lineup_b: nextLineupB
        }
      };
    }));
  };

  // Increment football timer each second while match is live and first half not completed
  useEffect(() => {
    const timer = setInterval(() => {
      setMatches(prev => prev.map(m => {
        if (m.status !== 'LIVE' || !m.footballData) return m;
        const fd = m.footballData;
        // If first half completed, pause timer
        if (fd.half === 1 && fd.timerSeconds >= Math.floor(m.duration / 2)) {
          return m; // paused, wait for user to start second half
        }
        // Increment timer
        const newTimer = fd.timerSeconds + 1;
        return {
          ...m,
          footballData: {
            ...fd,
            timerSeconds: newTimer
          }
        };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper to start second half manually
  const startSecondHalf = (matchId: string) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId || !m.footballData) return m;
      const fd = m.footballData;
      if (fd.half === 1 && fd.timerSeconds >= Math.floor(m.duration / 2)) {
        return {
          ...m,
          footballData: {
            ...fd,
            half: 2,
            timerSeconds: 0 // reset timer for second half
          }
        };
      }
      return m;
    }));
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

  const openLineupSetup = (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    const tA = teams.find(t => t.id === match.team_a_id);
    const tB = teams.find(t => t.id === match.team_b_id);
    
    const lA = tA?.players.filter(p => p.role !== 'SUB').map(p => p.id) || [];
    const lB = tB?.players.filter(p => p.role !== 'SUB').map(p => p.id) || [];
    const cA = tA?.players.find(p => p.role === 'CAPTAIN')?.id || tA?.players[0]?.id || "";
    const cB = tB?.players.find(p => p.role === 'CAPTAIN')?.id || tB?.players[0]?.id || "";

    setLineupModalConfig({
      matchId,
      teamAId: match.team_a_id,
      teamBId: match.team_b_id,
      lineupA: lA,
      lineupB: lB,
      captainA: cA,
      captainB: cB
    });
  };

  const launchMatchWithLineups = () => {
    if (!lineupModalConfig) return;
    const { matchId, lineupA, lineupB, captainA, captainB } = lineupModalConfig;
    
    setMatches(matches.map(m => {
      if (m.id === matchId) {
        return {
          ...m,
          status: 'LIVE',
          start_time: currentTime,
          footballData: {
            ...m.footballData,
            lineup_a: lineupA,
            lineup_b: lineupB,
            captain_a: captainA,
            captain_b: captainB,
            possession_a: 50,
            possession_b: 50,
            passing_a: 80,
            passing_b: 80,
            timerSeconds: 0,
            half: 1,
            goals: [],
            subs: [],
            cards: []
          }
        };
      }
      return m;
    }));
    setLineupModalConfig(null);
  };

  const handleScoreSync = (matchId: string, scoreA: number, scoreB: number) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, score_team_a: scoreA, score_team_b: scoreB } : m));
  };

  const performSubstitution = (matchId: string, teamId: string, playerOutId: string, playerInId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    
    const playerOut = team.players.find(p => p.id === playerOutId);
    const playerIn = team.players.find(p => p.id === playerInId);
    
    if (!playerOut || !playerIn) return;
    
    const subEvent: SubEvent = {
      id: Math.random().toString(36).substr(2, 9),
      playerInId,
      playerInName: playerIn.name,
      playerOutId,
      playerOutName: playerOut.name,
      minute: Math.floor((currentTime - (match.start_time || 0)) / 60),
      teamId
    };
    // Ensure substituted out player cannot re-enter this match (handled by UI selection logic elsewhere)
    
    setMatches(matches.map(m => m.id === matchId ? {
      ...m,
      footballData: {
        ...m.footballData!,
        subs: [...(m.footballData?.subs || []), subEvent],
        lineup_a: teamId === m.team_a_id 
          ? (m.footballData?.lineup_a || team.players.map(p => p.id)).map(id => id === playerOutId ? playerInId : id)
          : m.footballData?.lineup_a,
        lineup_b: teamId === m.team_b_id 
          ? (m.footballData?.lineup_b || team.players.map(p => p.id)).map(id => id === playerOutId ? playerInId : id)
          : m.footballData?.lineup_b
      }
    } : m));
    
    setSubModal(null);
  };

  const updateFootballStat = (matchId: string, type: 'possession' | 'passing', team: 'A' | 'B', value: number) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      const fd = m.footballData || { 
        goals: [], 
        cards: [], 
        possession_a: 50, 
        possession_b: 50, 
        passing_a: 80, 
        passing_b: 80,
        timerSeconds: 0,
        half: 1,
        subs: []
      };
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
                  <button className={`segment-btn sport-card pool ${selectedSport === '8BALL' ? 'active' : ''}`} onClick={() => setSelectedSport('8BALL')}>
                    <span className="s-icon">🎱</span> 8-BALL POOL
                  </button>
                  <button className={`segment-btn sport-card football ${selectedSport === 'FOOTBALL' ? 'active' : ''}`} onClick={() => setSelectedSport('FOOTBALL')}>
                    <span className="s-icon">⚽</span> FOOTBALL
                  </button>
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
                    <button className="step-btn" onClick={() => {
                      const maxPossible = teams.length >= 2 ? teams.length - 1 : 10;
                      if (matchesPerTeam < maxPossible) {
                        setMatchesPerTeam(matchesPerTeam + 1);
                      } else {
                        setModalConfig({
                          icon: "❗",
                          title: "QUOTA EXCEEDED",
                          message: `With ${teams.length} teams, each team can play a maximum of ${maxPossible} matches in a single round-robin group stage.`,
                          onConfirm: () => setModalConfig(null),
                          showCancel: false
                        });
                      }
                    }}>+</button>
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
                    {teamPlayersInput.map((p, i) => (
                      <div key={i} className="member-input-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          className="premium-input-v2-sm"
                          placeholder={`Player ${i + 1} Name`}
                          value={p.name}
                          onChange={e => {
                            const next = [...teamPlayersInput];
                            next[i] = { ...next[i], name: e.target.value };
                            setTeamPlayersInput(next);
                          }}
                        />
                        {selectedSport === 'FOOTBALL' && (
                          <select
                            className="premium-input-v2-sm"
                            style={{ maxWidth: '120px', background: '#070714', border: '1px solid #1e293b', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
                            value={p.role}
                            onChange={e => {
                              const next = [...teamPlayersInput];
                              next[i] = { ...next[i], role: e.target.value as any };
                              setTeamPlayersInput(next);
                            }}
                          >
                            <option value="CAPTAIN">Captain</option>
                            <option value="GOALKEEPER">Goalkeeper</option>
                            <option value="PLAYER">Playing</option>
                            <option value="SUB">Sub</option>
                          </select>
                        )}
                        {teamPlayersInput.length > 2 && (
                          <button className="remove-member-btn" onClick={() => setTeamPlayersInput(teamPlayersInput.filter((_, idx) => idx !== i))}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="add-member-trigger mt-4" onClick={() => setTeamPlayersInput([...teamPlayersInput, { name: "", role: "PLAYER" }])}>+ ADD MEMBER</button>
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
  const teamA = liveMatch ? teams.find(t => t.id === liveMatch.team_a_id) : null;
  const teamB = liveMatch ? teams.find(t => t.id === liveMatch.team_b_id) : null;
  const createdMatches = matches.filter(m => m.status === 'CREATED').sort((a, b) => a.order - b.order);

  return (
    <div className={`engine-container sport-theme-${selectedSport.toLowerCase()}`}>
      <div className="arena-vibe-overlay" />
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

      {modalConfig && isMounted && createPortal(
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
        </div>,
        document.body
      )}

      {showResetModal && isMounted && createPortal(
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
        </div>,
        document.body
      )}

      {showCloseModal && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🏁</div>
            <h2>Close Tournament?</h2>
            <p className="muted">
              Any match still in progress will be marked complete, the arena will stop appearing in
              Live Screening, and any live camera feeds will end. Teams and results stay on screen.
            </p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setShowCloseModal(false)}>CANCEL</button>
              <button className="button button-danger" onClick={closeTournament}>CLOSE TOURNAMENT</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmRestartMatchId && isMounted && createPortal(
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
        </div>,
        document.body
      )}

      {showShareModal && isMounted && createPortal(
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
        </div>,
        document.body
      )}

      {showPinModal && isMounted && createPortal(
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
        </div>,
        document.body
      )}

      {lineupModalConfig && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal" style={{ maxWidth: '750px', width: '95%', background: '#090916', border: '1px solid #1e1e38' }}>
            <div className="modal-icon">📋</div>
            <h2 className="glow-text">PRE-MATCH LINEUP SETUP</h2>
            <p className="muted">Select playing starters and designate captains before kickoff.</p>
            
            <div className="lineup-pitch mt-6" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '24px', 
              textAlign: 'left',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '16px',
              padding: '24px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Pitch Texture Overlay */}
              <div style={{ position: 'absolute', top: 0, left: '50%', bottom: 0, width: '2px', background: 'rgba(255,255,255,0.1)', transform: 'translateX(-50%)' }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', width: '80px', height: '80px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', transform: 'translate(-50%, -50%)' }} />

              {/* Team A Lineup Selector */}
              <div className="lineup-column" style={{ position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px #ef4444' }} />
                  <h4 style={{ color: '#fff', fontWeight: '900', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                    {getTeamName(lineupModalConfig.teamAId)}
                  </h4>
                </div>

                <div className="player-cards-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '10px' }}>
                  <label className="section-label-v2" style={{ fontSize: '0.7rem', color: '#10b981' }}>SELECT STARTING XI</label>
                  {teams.find(t => t.id === lineupModalConfig.teamAId)?.players.map(p => {
                    const isSelected = lineupModalConfig.lineupA.includes(p.id);
                    return (
                      <label key={p.id} className={`player-select-card ${isSelected ? 'selected' : ''}`} style={{ 
                        display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', 
                        background: isSelected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.3)', 
                        border: `1px solid ${isSelected ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.05)'}`,
                        padding: '10px 12px', borderRadius: '8px', transition: 'all 0.2s ease'
                      }}>
                        <div style={{ 
                          width: '20px', height: '20px', borderRadius: '4px', 
                          border: `2px solid ${isSelected ? '#ef4444' : '#555'}`,
                          background: isSelected ? '#ef4444' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: isSelected ? '#fff' : '#aaa', fontSize: '0.95rem', fontWeight: isSelected ? 'bold' : 'normal' }}>{p.name}</div>
                          <div style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.6)' : '#666', textTransform: 'uppercase' }}>{p.role}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                
                <div className="form-group mt-5">
                  <label className="section-label-v2" style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>👑 DESIGNATE CAPTAIN</label>
                  <select 
                    className="premium-input-v2" 
                    value={lineupModalConfig.captainA}
                    onChange={(e) => setLineupModalConfig({ ...lineupModalConfig, captainA: e.target.value })}
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 215, 0, 0.3)', color: 'var(--gold)' }}
                  >
                    <option value="">-- Choose Captain --</option>
                    {teams.find(t => t.id === lineupModalConfig.teamAId)?.players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Team B Lineup Selector */}
              <div className="lineup-column" style={{ position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }} />
                  <h4 style={{ color: '#fff', fontWeight: '900', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                    {getTeamName(lineupModalConfig.teamBId)}
                  </h4>
                </div>

                <div className="player-cards-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '10px' }}>
                  <label className="section-label-v2" style={{ fontSize: '0.7rem', color: '#10b981' }}>SELECT STARTING XI</label>
                  {teams.find(t => t.id === lineupModalConfig.teamBId)?.players.map(p => {
                    const isSelected = lineupModalConfig.lineupB.includes(p.id);
                    return (
                      <label key={p.id} className={`player-select-card ${isSelected ? 'selected' : ''}`} style={{ 
                        display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', 
                        background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0,0,0,0.3)', 
                        border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.05)'}`,
                        padding: '10px 12px', borderRadius: '8px', transition: 'all 0.2s ease'
                      }}>
                        <div style={{ 
                          width: '20px', height: '20px', borderRadius: '4px', 
                          border: `2px solid ${isSelected ? '#3b82f6' : '#555'}`,
                          background: isSelected ? '#3b82f6' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: isSelected ? '#fff' : '#aaa', fontSize: '0.95rem', fontWeight: isSelected ? 'bold' : 'normal' }}>{p.name}</div>
                          <div style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.6)' : '#666', textTransform: 'uppercase' }}>{p.role}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="form-group mt-5">
                  <label className="section-label-v2" style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>👑 DESIGNATE CAPTAIN</label>
                  <select 
                    className="premium-input-v2" 
                    value={lineupModalConfig.captainB}
                    onChange={(e) => setLineupModalConfig({ ...lineupModalConfig, captainB: e.target.value })}
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 215, 0, 0.3)', color: 'var(--gold)' }}
                  >
                    <option value="">-- Choose Captain --</option>
                    {teams.find(t => t.id === lineupModalConfig.teamBId)?.players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => setLineupModalConfig(null)}>CANCEL</button>
              <button 
                className="button button-gold" 
                onClick={launchMatchWithLineups}
                disabled={lineupModalConfig.lineupA.length === 0 || lineupModalConfig.lineupB.length === 0}
              >
                CONFIRM & LAUNCH MATCH
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {goalModal && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">⚽</div>
            <h2>RECORD GOAL</h2>
            <p className="muted">Recording goal for {goalModal.teamName}</p>
            
            <div className="form-group mt-6">
              <label className="section-label-v2">SELECT SCORER</label>
              <select className="premium-input-v2" value={selectedScorer} onChange={e => setSelectedScorer(e.target.value)}>
                <option value="">-- Choose Player --</option>
                {teams.find(t => t.id === goalModal.teamId)?.players.filter(p => {
                  const m = matches.find(x => x.id === goalModal.matchId);
                  if (!m || !m.footballData) return true;
                  const lineup = m.team_a_id === goalModal.teamId ? m.footballData.lineup_a : m.footballData.lineup_b;
                  return lineup?.includes(p.id);
                }).map(p => (
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
        </div>,
        document.body
      )}

      {subModal && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🔄</div>
            <h2>SUBSTITUTION</h2>
            <p className="muted">Select player to come ON</p>
            
            <div className="form-group mt-6">
              <label className="section-label-v2">SELECT PLAYER IN</label>
              <select 
                className="premium-input-v2" 
                onChange={e => {
                  if (e.target.value) {
                    performSubstitution(subModal.matchId, subModal.teamId, subModal.playerOutId, e.target.value);
                  }
                }}
              >
                <option value="">-- Choose Player --</option>
                {teams.find(t => t.id === subModal.teamId)?.players
                  .filter(p => {
                    const m = matches.find(x => x.id === subModal.matchId);
                    if (!m || !m.footballData) return p.id !== subModal.playerOutId;
                    
                    const fd = m.footballData;
                    const lineup = m.team_a_id === subModal.teamId ? fd.lineup_a : fd.lineup_b;
                    
                    if (p.id === subModal.playerOutId) return false;
                    if (lineup?.includes(p.id)) return false;
                    
                    const wasSubbedOut = fd.subs?.some(s => s.playerOutId === p.id);
                    if (wasSubbedOut) return false;
                    
                    return true;
                  })
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>

            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => setSubModal(null)}>CANCEL</button>
            </div>
          </div>
        </div>,
        document.body
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
          <button
            className={`share-btn ${arenaId && !syncError ? 'shared' : ''}`}
            onClick={publishArena}
            disabled={isPublishing}
            title={syncError || undefined}
          >
            {isPublishing
              ? 'SYNCING...'
              : syncError
                ? '⚠ NOT SYNCED'
                : arenaId
                  ? '✓ LINK SHARED'
                  : '🔗 SHARE ARENA'}
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
          {isStarted && (
            <button
              className="close-tournament-trigger"
              onClick={() => !isLocked && setShowCloseModal(true)}
              disabled={isLocked}
              title={isLocked ? "Unlock the arena to close it" : "End this tournament and stop broadcasting"}
            >
              CLOSE TOURNAMENT
            </button>
          )}
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
              {matches.filter(m => m.status === 'LIVE').length > 1 && (
                <div className="active-matches-selector glass-morphism mb-6 animate-in" style={{ padding: '15px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', width: '100%' }}>
                  <span className="section-label-v2 glow-text" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>🎮 MULTIPLE LIVE MATCHES DETECTED - SELECT ACTIVE CONTROL ROOM</span>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {matches.filter(m => m.status === 'LIVE').map(m => {
                      const isActive = m.id === liveMatch.id;
                      return (
                        <button 
                          key={m.id} 
                          className={`button ${isActive ? 'button-gold' : 'button-secondary'}`} 
                          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                          onClick={() => setActiveLiveMatchId(m.id)}
                        >
                          {m.sport === 'FOOTBALL' ? '⚽' : '🎱'} {getTeamName(m.team_a_id)} vs {getTeamName(m.team_b_id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Match Header Info (Timer, controls) */}
              <div className="match-timer-v3">
                <div className="live-pill"><span className="live-pulse"></span> LIVE</div>
                <div className="timer-interactive">
                  <button className="t-adj" onClick={() => adjustDuration(liveMatch.id, -60)}>−</button>
                  <span className="time-val">
                    {liveMatch.sport === 'FOOTBALL' ? getFootballTimeDisplay(liveMatch) : (
                      <>
                        {Math.max(0, Math.floor(((liveMatch.start_time || 0) + liveMatch.duration - currentTime) / 60))}:
                        {String(Math.max(0, ((liveMatch.start_time || 0) + liveMatch.duration - currentTime) % 60)).padStart(2, '0')}
                      </>
                    )}
                  </span>
                  <button className="t-adj" onClick={() => adjustDuration(liveMatch.id, 60)}>+</button>
                </div>
                {liveMatch.sport === 'FOOTBALL' && liveMatch.footballData && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Half {liveMatch.footballData.half} • {Math.floor(liveMatch.duration / 120)}m half ({Math.floor(liveMatch.duration / 60)}m whole match)
                  </span>
                )}
                <button className="extra-time-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => setConfirmRestartMatchId(liveMatch.id)}>RESTART</button>
                <button className="extra-time-btn" onClick={() => adjustDuration(liveMatch.id, 60)}>+1 MIN</button>
                {arenaId && (
                  <button
                    className="extra-time-btn"
                    style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)' }}
                    onClick={() => setShowBroadcastCode(!showBroadcastCode)}
                    title={syncError ? "Share the arena first so it exists on the spectator network" : undefined}
                  >
                    {showBroadcastCode ? 'HIDE CODE' : 'STREAM'}
                  </button>
                )}
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

              {/* The host runs the match from here, so this is where the code to
                  hand a camera operator belongs. The arena must be shared first,
                  since a broadcast is authorised against the stored arena. */}
              {showBroadcastCode && arenaId && (
                <div
                  className="animate-in"
                  style={{
                    margin: '16px 0',
                    padding: '20px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <BroadcastCode
                    arenaId={arenaId}
                    matchId={liveMatch.id}
                    pin={arenaPin}
                    onClose={() => setShowBroadcastCode(false)}
                  />
                </div>
              )}

              {/* Modular Engines */}
              {liveMatch.sport === 'FOOTBALL' ? (
                <FootballMatchEngine 
                  match={liveMatch}
                  teams={teams}
                  isLocked={isLocked}
                  currentTime={currentTime}
                  onUpdateFootballStat={updateFootballStat}
                  onUpdateFootballData={(matchId, data) => {
                    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, footballData: data } : m));
                  }}
                  onRecordCard={recordCard}
                  onPerformSubstitution={performSubstitution}
                  onStartSecondHalf={startSecondHalf}
                  onScoreSync={handleScoreSync}
                />
              ) : (
                <PoolMatchEngine 
                  match={liveMatch}
                  teams={teams}
                  isLocked={isLocked}
                  onUpdateScore={updateScore}
                  onUpdateHouse={updateHouse}
                  onSetActiveTeam={(matchId, teamId) => {
                    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, active_team_id: teamId } : m));
                  }}
                />
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
                        <div className="s-actions" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {m.sport === 'FOOTBALL' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <input 
                                type="number" 
                                className="premium-input-v2-sm" 
                                placeholder="Mins" 
                                style={{ width: '60px', textAlign: 'center' }}
                                value={m.duration / 60}
                                onChange={(e) => {
                                  const mins = parseInt(e.target.value) || 0;
                                  setMatches(matches.map(x => x.id === m.id ? { ...x, duration: mins * 60 } : x));
                                }}
                              />
                              <span style={{ fontSize: '0.45rem', fontWeight: 900, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Whole Mins</span>
                            </div>
                          )}
                          <button 
                            className="button button-gold button-sm launch-btn-small" 
                            onClick={() => {
                              if (m.sport === 'FOOTBALL') {
                                openLineupSetup(m.id);
                              } else {
                                setMatches(matches.map(x => x.id === m.id ? { ...x, status: 'LIVE', start_time: currentTime } : x));
                              }
                            }}
                          >
                            LAUNCH
                          </button>
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
                              <select className="premium-input-v2" value={matchesPerTeam} onChange={e => {
                                const val = Number(e.target.value);
                                const maxPossible = teams.length >= 2 ? teams.length - 1 : 10;
                                if (val > maxPossible) {
                                  setModalConfig({
                                    icon: "❗",
                                    title: "QUOTA EXCEEDED",
                                    message: `With ${teams.length} teams, each team can play a maximum of ${maxPossible} matches in a single round-robin group stage.`,
                                    onConfirm: () => setModalConfig(null),
                                    showCancel: false
                                  });
                                } else {
                                  setMatchesPerTeam(val);
                                }
                              }}>
                                {[1,2,3,4,5].filter(v => teams.length < 2 || v < teams.length).map(v => <option key={v} value={v}>{v} matches/team</option>)}
                              </select>
                            </div>
                            <div className="setting-box">
                              <label className="stat-label">DEFAULT TIME (MINS)</label>
                              <div className="timer-scroller-v2" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button className="s-btn" onClick={() => setDefaultDuration(Math.max(60, defaultDuration - 60))}>-</button>
                                <span className="dur-val">{Math.floor(defaultDuration/60)}m</span>
                                <button className="s-btn" onClick={() => setDefaultDuration(defaultDuration + 60)}>+</button>
                              </div>
                              <span style={{ fontSize: '0.55rem', opacity: 0.4, marginTop: '4px', display: 'block', fontWeight: 900 }}>WHOLE MATCH (AUTOMATICALLY SPLIT INTO 2 HALVES)</span>
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
      ) : activeSubTab === 'screening' ? (
        <div className="live-screening-tab animate-in" style={{ padding: '1rem 0', width: '100%' }}>
          <h2 className="glow-text mb-2">📺 MULTIPLEX LIVE SCREENING PANEL</h2>
          <p className="muted mb-8" style={{ fontSize: '0.9rem' }}>Real-time spectator multiplex. Click on any game card to expand full tactical statistics, pitch configurations, and live timeline events.</p>
          
          {matches.filter(m => m.status === 'LIVE').length > 0 ? (
            <div className="screening-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px', width: '100%' }}>
              {matches.filter(m => m.status === 'LIVE').map(m => {
                const isFootball = m.sport === 'FOOTBALL';
                const timeStr = isFootball ? getFootballTimeDisplay(m) : `${Math.max(0, Math.floor(((m.start_time || 0) + m.duration - currentTime) / 60))}:${String(Math.max(0, ((m.start_time || 0) + m.duration - currentTime) % 60)).padStart(2, '0')}`;
                
                return (
                  <div key={m.id} className="glass-morphism screening-card hover-glow animate-in" style={{ padding: '24px', borderRadius: '12px', background: 'rgba(9, 9, 22, 0.45)', border: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <span className="live-pill" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        <span className="live-pulse"></span> LIVE
                      </span>
                      <span className="sport-badge" style={{ background: isFootball ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: isFootball ? '#10b981' : '#3b82f6', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold' }}>
                        {isFootball ? '⚽ FOOTBALL' : '🎱 8-BALL'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '20px 0' }}>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTeamName(m.team_a_id)}</div>
                        <div style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--red)', marginTop: '8px' }}>{m.score_team_a}</div>
                      </div>
                      <div style={{ fontSize: '1.2rem', color: '#555', fontWeight: 'bold', margin: '0 15px' }}>VS</div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTeamName(m.team_b_id)}</div>
                        <div style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--blue)', marginTop: '8px' }}>{m.score_team_b}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '15px' }}>
                      <span className="time-val" style={{ fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 'bold', fontSize: '1.1rem' }}>⏱️ {timeStr}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="button button-gold button-sm" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => {
                            const specLink = `${window.location.origin}/arena/${arenaId}?matchId=${m.id}`;
                            navigator.clipboard.writeText(specLink);
                            alert("Copied specific live match spectator link to clipboard!");
                          }}
                        >
                          🔗 SHARE
                        </button>
                        <button 
                          className="button button-secondary button-sm" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => {
                            setActiveLiveMatchId(m.id);
                            setActiveSubTab('arena');
                          }}
                        >
                          🔍 CONTROL
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="phase-transition-overlay animate-in" style={{ padding: '4rem 0', width: '100%' }}>
              <div className="phase-card glass-morphism text-center" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}>
                <div className="p-icon" style={{ fontSize: '3rem' }}>📺</div>
                <h3>NO ONGOING MATCHES</h3>
                <p className="muted">Launch a tournament match from the Arena tab to start live multiplex screening!</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="premium-standings">
          {teams.length > 0 && (() => {
            let topPlayerName = "TBD";
            let topPlayerRating = 0;
            let topPlayerTeam = "";
            
            let bestGkName = "TBD";
            let bestGkSaves = 0;
            let bestGkTeam = "";

            if (selectedSport === 'FOOTBALL') {
              // Aggregate football stats
              const playerMap: Record<string, {
                id: string;
                name: string;
                teamName: string;
                goals: number;
                saves: number;
                attempts: number;
                yellows: number;
                reds: number;
              }> = {};

              teams.forEach(t => {
                t.players.forEach(p => {
                  playerMap[p.id] = {
                    id: p.id,
                    name: p.name,
                    teamName: t.name,
                    goals: 0,
                    saves: 0,
                    attempts: 0,
                    yellows: 0,
                    reds: 0
                  };
                });
              });

              matches.forEach(m => {
                if (m.footballData) {
                  const fd = m.footballData;
                  const atts = fd.attempts || [];
                  atts.forEach(a => {
                    if (playerMap[a.playerId]) {
                      playerMap[a.playerId].attempts++;
                      if (a.outcome === 'SCORED') playerMap[a.playerId].goals++;
                    }
                    if (a.outcome === 'SAVED' && a.goalkeeperId && playerMap[a.goalkeeperId]) {
                      playerMap[a.goalkeeperId].saves++;
                    }
                  });
                  const crds = fd.cards || [];
                  crds.forEach(c => {
                    if (playerMap[c.playerId]) {
                      if (c.type === 'YELLOW') playerMap[c.playerId].yellows++;
                      else playerMap[c.playerId].reds++;
                    }
                  });
                }
              });

              const allFbPlayers = Object.values(playerMap).map(p => ({
                ...p,
                rating: (p.goals * 10) + (p.saves * 3) - (p.yellows * 2) - (p.reds * 5)
              }));

              const sortedFbPlayers = [...allFbPlayers].sort((a, b) => b.rating - a.rating || b.goals - a.goals);
              if (sortedFbPlayers.length > 0) {
                topPlayerName = sortedFbPlayers[0].name;
                topPlayerRating = sortedFbPlayers[0].rating;
                topPlayerTeam = sortedFbPlayers[0].teamName;
              }

              const sortedGks = [...allFbPlayers].sort((a, b) => b.saves - a.saves);
              if (sortedGks.length > 0 && sortedGks[0].saves > 0) {
                bestGkName = sortedGks[0].name;
                bestGkSaves = sortedGks[0].saves;
                bestGkTeam = sortedGks[0].teamName;
              }
            } else {
              const allPlayers = teams.flatMap(t => t.players.map(p => ({ 
                ...p, 
                teamName: t.name,
                rating: (p.total_balls_potted * 10) - (p.total_fouls * 5)
              })));
              const topPlayer = [...allPlayers].sort((a, b) => b.rating - a.rating || b.total_balls_potted - a.total_balls_potted)[0];
              if (topPlayer) {
                topPlayerName = topPlayer.name;
                topPlayerRating = topPlayer.rating;
                topPlayerTeam = topPlayer.teamName;
              }
            }

            const tournamentWinner = [...teams].sort((a, b) => b.group_points - a.group_points || b.total_score - a.total_score)[0];

            return (
              <div className="tournament-awards-row" style={{ display: 'grid', gridTemplateColumns: selectedSport === 'FOOTBALL' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                <div className="award-card glass-morphism gold-glow">
                  <div className="award-icon">🏆</div>
                  <div className="award-content">
                    <div className="award-label">MAN OF THE TOURNAMENT</div>
                    <div className="award-winner glow-text-gold">
                      {topPlayerName}
                    </div>
                    <div className="award-meta">
                      {topPlayerRating} RATING • {topPlayerTeam || "N/A"}
                    </div>
                  </div>
                </div>
                
                {selectedSport === 'FOOTBALL' && (
                  <div className="award-card glass-morphism green-glow">
                    <div className="award-icon">🧤</div>
                    <div className="award-content">
                      <div className="award-label">GOLDEN GLOVE (BEST GK)</div>
                      <div className="award-winner glow-text" style={{ color: '#10b981' }}>
                        {bestGkName}
                      </div>
                      <div className="award-meta">
                        {bestGkSaves} SAVES • {bestGkTeam || "N/A"}
                      </div>
                    </div>
                  </div>
                )}

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
                          
                          let totalAttempts = 0;
                          let totalSaves = 0;
                          let totalYellows = 0;
                          let totalReds = 0;
                          
                          matches.forEach(m => {
                            if (m.footballData) {
                              const fd = m.footballData;
                              const atts = fd.attempts || [];
                              atts.forEach(a => {
                                const isScorerFromThisTeam = t.players.some(p => p.id === a.playerId);
                                if (isScorerFromThisTeam) {
                                  totalAttempts++;
                                }
                                if (a.outcome === 'SAVED' && a.goalkeeperId && t.players.some(p => p.id === a.goalkeeperId)) {
                                  totalSaves++;
                                }
                              });
                              
                              const crds = fd.cards || [];
                              crds.forEach(c => {
                                if (t.players.some(p => p.id === c.playerId)) {
                                  if (c.type === 'YELLOW') totalYellows++;
                                  else totalReds++;
                                }
                              });
                            }
                          });
                          
                          const teamRating = (gf * 12) + (totalSaves * 6) + (totalAttempts * 2) - (ga * 6) - (totalYellows * 3) - (totalReds * 7);
                          
                          return (
                            <>
                              <div className="stat"><div className="stat-label">GF</div><div className="stat-val">{gf}</div></div>
                              <div className="stat"><div className="stat-label">GA</div><div className="stat-val">{ga}</div></div>
                              <div className="stat"><div className="stat-label">GD</div><div className="stat-val">{gf - ga >= 0 ? `+${gf - ga}` : gf - ga}</div></div>
                              <div className="stat"><div className="stat-label">ATT</div><div className="stat-val">{totalAttempts}</div></div>
                              <div className="stat"><div className="stat-label">SV</div><div className="stat-val" style={{ color: '#10b981' }}>{totalSaves}</div></div>
                              <div className="stat" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '8px' }}>
                                <div className="stat-label" style={{ color: 'var(--gold)' }}>RATING</div>
                                <div className="stat-val" style={{ color: 'var(--gold)', fontWeight: 900 }}>{teamRating}</div>
                              </div>
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
                          let actualGoals = 0;
                          let actualSaves = 0;
                          let actualAttempts = 0;
                          let actualYellows = 0;
                          let actualReds = 0;
                          
                          if (isFootball) {
                            matches.forEach(m => {
                              if (m.footballData) {
                                const fd = m.footballData;
                                const atts = fd.attempts || [];
                                atts.forEach(a => {
                                  if (a.playerId === p.id) {
                                    actualAttempts++;
                                    if (a.outcome === 'SCORED') actualGoals++;
                                  }
                                  if (a.outcome === 'SAVED' && a.goalkeeperId === p.id) {
                                    actualSaves++;
                                  }
                                });
                                const crds = fd.cards || [];
                                crds.forEach(c => {
                                  if (c.playerId === p.id) {
                                    if (c.type === 'YELLOW') actualYellows++;
                                    else actualReds++;
                                  }
                                });
                              }
                            });
                          }

                          const rating = isFootball 
                            ? (actualGoals * 10) + (actualSaves * 3) - (actualYellows * 2) - (actualReds * 5)
                            : (p.total_balls_potted * 10) - (p.total_fouls * 5);

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
                                    <div className="p-b-stat-item">
                                      <span className="p-b-label">SAVES</span>
                                      <span className="p-b-val">🧤 {actualSaves}</span>
                                    </div>
                                    <div className="p-b-stat-item" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                      <span className="p-b-label" style={{ color: 'var(--gold)' }}>RATING</span>
                                      <span className="p-b-val" style={{ color: 'var(--gold)' }}>{rating}</span>
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
