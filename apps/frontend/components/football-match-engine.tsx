"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  FootballTeamPod, 
  FootballPossessionPitch, 
  FootballScoreboard 
} from "./match-components";

// Event & Match Types
export type Player = {
  id: string;
  name: string;
  total_balls_potted: number;
  total_fouls: number;
  role: 'CAPTAIN' | 'PLAYER' | 'SUB' | 'GOALKEEPER';
};

export type Team = {
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

export type GoalEvent = {
  id: string;
  scorerId: string;
  scorerName: string;
  minute: number;
  teamId: string;
};

export type SubEvent = {
  id: string;
  playerInId: string;
  playerInName: string;
  playerOutId: string;
  playerOutName: string;
  minute: number;
  teamId: string;
};

export type CardEvent = {
  id: string;
  playerId: string;
  playerName: string;
  minute: number;
  type: 'YELLOW' | 'RED';
  teamId: string;
};

export type AttemptEvent = {
  id: string;
  teamId: string;
  playerId: string;
  playerName: string;
  minute: number;
  outcome: 'SCORED' | 'SAVED' | 'MISSED';
  goalkeeperId?: string;
  goalkeeperName?: string;
};

export type FootballMatchData = {
  goals: GoalEvent[];
  attempts?: AttemptEvent[];
  cards: CardEvent[];
  possession_a: number;
  possession_b: number;
  passing_a: number;
  passing_b: number;
  extra_time?: number;
  timerSeconds: number;
  half: 1 | 2;
  lineup_a?: string[];
  lineup_b?: string[];
  captain_a?: string;
  captain_b?: string;
  subs?: SubEvent[];
};

export type Match = {
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
  sport: '8BALL' | 'FOOTBALL';
  footballData?: FootballMatchData;
};

interface FootballMatchEngineProps {
  match: Match;
  teams: Team[];
  isLocked: boolean;
  currentTime: number;
  onUpdateFootballStat: (matchId: string, type: 'possession' | 'passing', team: 'A' | 'B', value: number) => void;
  onUpdateFootballData: (matchId: string, data: FootballMatchData) => void;
  onRecordCard: (matchId: string, teamId: string, playerId: string, type: 'YELLOW' | 'RED') => void;
  onPerformSubstitution: (matchId: string, teamId: string, playerOutId: string, playerInId: string) => void;
  onStartSecondHalf: (matchId: string) => void;
  onScoreSync: (matchId: string, scoreA: number, scoreB: number) => void;
}

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

export function FootballMatchEngine({
  match,
  teams,
  isLocked,
  currentTime,
  onUpdateFootballStat,
  onUpdateFootballData,
  onRecordCard,
  onPerformSubstitution,
  onStartSecondHalf,
  onScoreSync
}: FootballMatchEngineProps) {
  const fd = match.footballData || {
    goals: [],
    attempts: [],
    cards: [],
    possession_a: 50,
    possession_b: 50,
    passing_a: 80,
    passing_b: 80,
    timerSeconds: 0,
    half: 1,
    lineup_a: [],
    lineup_b: [],
    subs: []
  };

  const attempts = fd.attempts || [];
  const cards = fd.cards || [];
  const subs = fd.subs || [];

  const teamA = teams.find(t => t.id === match.team_a_id);
  const teamB = teams.find(t => t.id === match.team_b_id);

  // Modal states
  const [attemptModal, setAttemptModal] = useState<{ teamId: string; teamName: string; presetGoal?: boolean } | null>(null);
  const [subModal, setSubModal] = useState<{ teamId: string; playerOutId: string } | null>(null);
  const [editEventModal, setEditEventModal] = useState<{ event: any; type: 'ATTEMPT' | 'CARD' | 'SUB' } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Recording form inputs
  const [selectedAttempter, setSelectedAttempter] = useState("");
  const [shotOutcome, setShotOutcome] = useState<'SCORED' | 'SAVED' | 'MISSED'>('SCORED');
  const [selectedGk, setSelectedGk] = useState("");
  const [attemptMinute, setAttemptMinute] = useState<number | null>(null);

  // Edit form inputs
  const [editPlayerId, setEditPlayerId] = useState("");
  const [editOutcome, setEditOutcome] = useState<'SCORED' | 'SAVED' | 'MISSED'>('SCORED');
  const [editGkId, setEditGkId] = useState("");
  const [editMinute, setEditMinute] = useState(0);
  const [editCardType, setEditCardType] = useState<'YELLOW' | 'RED'>('YELLOW');
  const [editSubInId, setEditSubInId] = useState("");

  const getTeamName = (tid: string) => teams.find(t => t.id === tid)?.name || "Unknown Team";

  const getOpponentGoalkeeper = (attributingTeamId: string) => {
    const isTeamA = attributingTeamId === match.team_a_id;
    const opponentTeam = isTeamA ? teamB : teamA;
    const opponentLineup = isTeamA ? fd.lineup_b : fd.lineup_a;
    const activeOpponents = opponentTeam?.players.filter(p => opponentLineup?.includes(p.id)) || [];
    return activeOpponents.find(p => p.role === 'GOALKEEPER');
  };

  useEffect(() => {
    if (attemptModal && shotOutcome === 'SAVED') {
      const gk = getOpponentGoalkeeper(attemptModal.teamId);
      if (gk) setSelectedGk(gk.id);
    }
  }, [shotOutcome, attemptModal]);

  useEffect(() => {
    if (editEventModal && editOutcome === 'SAVED' && !editGkId) {
      const gk = getOpponentGoalkeeper(editEventModal.event.teamId);
      if (gk) setEditGkId(gk.id);
    }
  }, [editOutcome, editEventModal]);

  const getMatchMinute = () => {
    const halfDuration = Math.floor(match.duration / 2);
    if (fd.half === 1) {
      return Math.min(Math.floor(fd.timerSeconds / 60) + 1, Math.floor(halfDuration / 60));
    } else {
      const totalSecs = halfDuration + fd.timerSeconds;
      return Math.min(Math.floor(totalSecs / 60) + 1, Math.floor(match.duration / 60));
    }
  };

  // 💥 Record Attempt (Shot / Goal)
  const recordAttempt = () => {
    if (!selectedAttempter || !attemptModal) return;
    const attempter = teams.find(t => t.id === attemptModal.teamId)?.players.find(p => p.id === selectedAttempter);
    if (!attempter) return;

    const min = attemptMinute !== null ? attemptMinute : getMatchMinute();
    const opponentTeamId = attemptModal.teamId === match.team_a_id ? match.team_b_id : match.team_a_id;
    const gk = selectedGk ? teams.find(t => t.id === opponentTeamId)?.players.find(p => p.id === selectedGk) : undefined;

    const newAttempt: AttemptEvent = {
      id: `att_${Date.now()}`,
      teamId: attemptModal.teamId,
      playerId: attempter.id,
      playerName: attempter.name,
      minute: min,
      outcome: shotOutcome,
      goalkeeperId: gk?.id,
      goalkeeperName: gk?.name
    };

    const nextAttempts = [...attempts, newAttempt];
    let nextGoals = [...fd.goals];

    // If Scored, add to Goals
    if (shotOutcome === 'SCORED') {
      const newGoal: GoalEvent = {
        id: `goal_${Date.now()}`,
        scorerId: attempter.id,
        scorerName: attempter.name,
        minute: min,
        teamId: attemptModal.teamId
      };
      nextGoals.push(newGoal);
    }

    const updatedData: FootballMatchData = {
      ...fd,
      attempts: nextAttempts,
      goals: nextGoals
    };

    onUpdateFootballData(match.id, updatedData);

    // Sync score directly
    const scoreA = nextAttempts.filter(a => a.teamId === match.team_a_id && a.outcome === 'SCORED').length;
    const scoreB = nextAttempts.filter(a => a.teamId === match.team_b_id && a.outcome === 'SCORED').length;
    onScoreSync(match.id, scoreA, scoreB);

    // Reset Form
    setAttemptModal(null);
    setSelectedAttempter("");
    setShotOutcome('SCORED');
    setSelectedGk("");
    setAttemptMinute(null);
  };

  // ✏️ Edit Recorded Event
  const saveEditedEvent = () => {
    if (!editEventModal) return;

    const { event, type } = editEventModal;

    if (type === 'ATTEMPT') {
      const teamPlayers = teams.find(t => t.id === event.teamId)?.players || [];
      const attempter = teamPlayers.find(p => p.id === editPlayerId);
      const opponentTeamId = event.teamId === match.team_a_id ? match.team_b_id : match.team_a_id;
      const opponentPlayers = teams.find(t => t.id === opponentTeamId)?.players || [];
      const gk = opponentPlayers.find(p => p.id === editGkId);

      const nextAttempts = attempts.map(a => {
        if (a.id === event.id) {
          return {
            ...a,
            playerId: editPlayerId,
            playerName: attempter?.name || a.playerName,
            minute: editMinute,
            outcome: editOutcome,
            goalkeeperId: editOutcome === 'SAVED' ? editGkId : undefined,
            goalkeeperName: editOutcome === 'SAVED' ? gk?.name : undefined
          };
        }
        return a;
      });

      // Recalculate Goals
      const nextGoals: GoalEvent[] = [];
      nextAttempts.forEach(a => {
        if (a.outcome === 'SCORED') {
          nextGoals.push({
            id: `goal_${a.id}`,
            scorerId: a.playerId,
            scorerName: a.playerName,
            minute: a.minute,
            teamId: a.teamId
          });
        }
      });

      onUpdateFootballData(match.id, {
        ...fd,
        attempts: nextAttempts,
        goals: nextGoals
      });

      // Recalculate and sync score
      const scoreA = nextAttempts.filter(a => a.teamId === match.team_a_id && a.outcome === 'SCORED').length;
      const scoreB = nextAttempts.filter(a => a.teamId === match.team_b_id && a.outcome === 'SCORED').length;
      onScoreSync(match.id, scoreA, scoreB);

    } else if (type === 'CARD') {
      const teamPlayers = teams.find(t => t.id === event.teamId)?.players || [];
      const carded = teamPlayers.find(p => p.id === editPlayerId);

      const nextCards = cards.map(c => {
        if (c.id === event.id) {
          return {
            ...c,
            playerId: editPlayerId,
            playerName: carded?.name || c.playerName,
            minute: editMinute,
            type: editCardType
          };
        }
        return c;
      });

      onUpdateFootballData(match.id, {
        ...fd,
        cards: nextCards
      });

    } else if (type === 'SUB') {
      const teamPlayers = teams.find(t => t.id === event.teamId)?.players || [];
      const subIn = teamPlayers.find(p => p.id === editSubInId);
      const subOut = teamPlayers.find(p => p.id === editPlayerId);

      const nextSubs = subs.map(s => {
        if (s.id === event.id) {
          return {
            ...s,
            playerInId: editSubInId,
            playerInName: subIn?.name || s.playerInName,
            playerOutId: editPlayerId,
            playerOutName: subOut?.name || s.playerOutName,
            minute: editMinute
          };
        }
        return s;
      });

      onUpdateFootballData(match.id, {
        ...fd,
        subs: nextSubs
      });
    }

    setEditEventModal(null);
  };

  // ❌ Delete Event
  const deleteEvent = (eventId: string, type: 'ATTEMPT' | 'CARD' | 'SUB') => {
    if (type === 'ATTEMPT') {
      const nextAttempts = attempts.filter(a => a.id !== eventId);
      const nextGoals = nextAttempts.filter(a => a.outcome === 'SCORED').map(a => ({
        id: `goal_${a.id}`,
        scorerId: a.playerId,
        scorerName: a.playerName,
        minute: a.minute,
        teamId: a.teamId
      }));

      onUpdateFootballData(match.id, {
        ...fd,
        attempts: nextAttempts,
        goals: nextGoals
      });

      // Recalculate score
      const scoreA = nextAttempts.filter(a => a.teamId === match.team_a_id && a.outcome === 'SCORED').length;
      const scoreB = nextAttempts.filter(a => a.teamId === match.team_b_id && a.outcome === 'SCORED').length;
      onScoreSync(match.id, scoreA, scoreB);

    } else if (type === 'CARD') {
      const card = cards.find(c => c.id === eventId);
      const nextCards = cards.filter(c => c.id !== eventId);

      // Restore lineups if deleted card was red
      let nextLineupA = fd.lineup_a || [];
      let nextLineupB = fd.lineup_b || [];
      if (card && card.type === 'RED') {
        if (card.teamId === match.team_a_id) {
          if (!nextLineupA.includes(card.playerId)) nextLineupA.push(card.playerId);
        } else {
          if (!nextLineupB.includes(card.playerId)) nextLineupB.push(card.playerId);
        }
      }

      onUpdateFootballData(match.id, {
        ...fd,
        cards: nextCards,
        lineup_a: nextLineupA,
        lineup_b: nextLineupB
      });

    } else if (type === 'SUB') {
      const sub = subs.find(s => s.id === eventId);
      const nextSubs = subs.filter(s => s.id !== eventId);

      // Revert lineups
      let nextLineupA = fd.lineup_a || [];
      let nextLineupB = fd.lineup_b || [];
      if (sub) {
        if (sub.teamId === match.team_a_id) {
          nextLineupA = nextLineupA.map(id => id === sub.playerInId ? sub.playerOutId : id);
        } else {
          nextLineupB = nextLineupB.map(id => id === sub.playerInId ? sub.playerOutId : id);
        }
      }

      onUpdateFootballData(match.id, {
        ...fd,
        subs: nextSubs,
        lineup_a: nextLineupA,
        lineup_b: nextLineupB
      });
    }
  };

  const openEditModal = (event: any, type: 'ATTEMPT' | 'CARD' | 'SUB') => {
    setEditEventModal({ event, type });
    setEditMinute(event.minute);
    if (type === 'ATTEMPT') {
      setEditPlayerId(event.playerId);
      setEditOutcome(event.outcome);
      setEditGkId(event.goalkeeperId || "");
    } else if (type === 'CARD') {
      setEditPlayerId(event.playerId);
      setEditCardType(event.type);
    } else if (type === 'SUB') {
      setEditPlayerId(event.playerOutId);
      setEditSubInId(event.playerInId);
    }
  };

  const getSavesCount = (gkId: string) => {
    return attempts.filter(a => a.goalkeeperId === gkId && a.outcome === 'SAVED').length;
  };

  const getAttemptsCount = (teamId: string) => {
    return attempts.filter(a => a.teamId === teamId).length;
  };

  const getGoalsCount = (teamId: string) => {
    return attempts.filter(a => a.teamId === teamId && a.outcome === 'SCORED').length;
  };

  return (
    <div className="football-match-panel" style={{ width: '100%' }}>
      {/* 🔴 Match Summary Scoreboard */}
      <FootballScoreboard 
        teamAName={getTeamName(match.team_a_id)}
        teamBName={getTeamName(match.team_b_id)}
        scoreA={match.score_team_a}
        scoreB={match.score_team_b}
        time={fd.half === 1 && fd.timerSeconds >= Math.floor(match.duration / 2) ? "HALF TIME" : getFootballTimeDisplay(match)}
        status={match.status === 'LIVE' ? 'LIVE' : match.status}
      />

      {/* ⏸️ Halftime Action Button */}
      {fd.half === 1 && fd.timerSeconds >= Math.floor(match.duration / 2) && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <button className="button button-gold animate-pulse" onClick={() => onStartSecondHalf(match.id)}>
            ⚽ START SECOND HALF
          </button>
        </div>
      )}

      {/* 📊 Teams Pods (Rosters, Cards, & Controls) */}
      <div className="battle-view mt-8" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="pod-wrapper red">
          <FootballTeamPod 
            teamName={getTeamName(match.team_a_id)}
            score={match.score_team_a}
            color="red"
            isActive={match.active_team_id === match.team_a_id}
            possession={fd.possession_a || 50}
            passing={fd.passing_a || 80}
            goals={attempts.filter(a => a.teamId === match.team_a_id && a.outcome === 'SCORED')}
            subs={subs.filter(s => s.teamId === match.team_a_id)}
            cards={cards.filter(c => c.teamId === match.team_a_id)}
            teamId={match.team_a_id}
            players={teamA?.players.filter(p => fd.lineup_a?.includes(p.id)) || []}
            captainId={fd.captain_a || teamA?.players[0]?.id}
            onSubClick={(playerId) => setSubModal({ teamId: match.team_a_id, playerOutId: playerId })}
            onCardClick={(playerId, type) => onRecordCard(match.id, match.team_a_id, playerId, type)}
            isLocked={isLocked}
          />
          <div className="form-group mt-4 text-center">
            <button 
              className="button button-gold w-full" 
              onClick={() => { setShotOutcome('SCORED'); setAttemptModal({ teamId: match.team_a_id, teamName: getTeamName(match.team_a_id) }); }}
              disabled={isLocked}
              style={{ fontWeight: 900, letterSpacing: '1px' }}
            >
              ⚽ RECORD MATCH ACTION
            </button>
          </div>
        </div>

        <div className="pod-wrapper blue">
          <FootballTeamPod 
            teamName={getTeamName(match.team_b_id)}
            score={match.score_team_b}
            color="blue"
            isActive={match.active_team_id === match.team_b_id}
            possession={fd.possession_b || 50}
            passing={fd.passing_b || 80}
            goals={attempts.filter(a => a.teamId === match.team_b_id && a.outcome === 'SCORED')}
            subs={subs.filter(s => s.teamId === match.team_b_id)}
            cards={cards.filter(c => c.teamId === match.team_b_id)}
            teamId={match.team_b_id}
            players={teamB?.players.filter(p => fd.lineup_b?.includes(p.id)) || []}
            captainId={fd.captain_b || teamB?.players[0]?.id}
            onSubClick={(playerId) => setSubModal({ teamId: match.team_b_id, playerOutId: playerId })}
            onCardClick={(playerId, type) => onRecordCard(match.id, match.team_b_id, playerId, type)}
            isLocked={isLocked}
          />
          <div className="form-group mt-4 text-center">
            <button 
              className="button button-gold w-full" 
              onClick={() => { setShotOutcome('SCORED'); setAttemptModal({ teamId: match.team_b_id, teamName: getTeamName(match.team_b_id) }); }}
              disabled={isLocked}
              style={{ fontWeight: 900, letterSpacing: '1px' }}
            >
              ⚽ RECORD MATCH ACTION
            </button>
          </div>
        </div>
      </div>



      {/* 📝 Host Match Event Timeline Editor */}
      <div className="event-timeline-panel glass-morphism mt-8" style={{ padding: '20px', borderRadius: '12px', background: 'rgba(9, 9, 22, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 className="section-label-v2 glow-text mb-4">📝 MATCH EVENT TIMELINE LOG</h3>
        <div className="events-timeline-list" style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            ...attempts.map(a => ({ ...a, type: 'ATTEMPT' as const })),
            ...cards.map(c => ({ ...c, type: 'CARD' as const })),
            ...subs.map(s => ({ ...s, type: 'SUB' as const }))
          ].sort((a, b) => a.minute - b.minute).map((ev: any, index) => {
            let label = "";
            let icon = "";
            if (ev.type === 'ATTEMPT') {
              if (ev.outcome === 'SCORED') { icon = "⚽"; label = `Goal scored by ${ev.playerName} (${ev.minute}')`; }
              else if (ev.outcome === 'SAVED') { icon = "🧤"; label = `Shot by ${ev.playerName} SAVED by goalkeeper ${ev.goalkeeperName || "GK"} (${ev.minute}')`; }
              else { icon = "❌"; label = `Shot by ${ev.playerName} MISSED (${ev.minute}')`; }
            } else if (ev.type === 'CARD') {
              icon = ev.type === 'YELLOW' ? "🟨" : "🟥";
              label = `${ev.type === 'YELLOW' ? 'Yellow' : 'Red'} Card given to ${ev.playerName} (${ev.minute}')`;
            } else if (ev.type === 'SUB') {
              icon = "🔄";
              label = `Substitution: ${ev.playerInName} ON, ${ev.playerOutName} OFF (${ev.minute}')`;
            }

            return (
              <div key={ev.id || index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                  <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{label}</span>
                </div>
                {!isLocked && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="button button-gold button-sm" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => openEditModal(ev, ev.type)}>✏️ EDIT</button>
                    <button className="button button-danger button-sm" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => deleteEvent(ev.id, ev.type)}>❌ DELETE</button>
                  </div>
                )}
              </div>
            );
          })}
          {attempts.length === 0 && cards.length === 0 && subs.length === 0 && (
            <div className="muted text-center py-6" style={{ fontSize: '0.85rem' }}>No events recorded yet. Record attempts or card bookings to start timeline.</div>
          )}
        </div>
      </div>

      {/* 💥 Revamped Attempt Modal */}
      {attemptModal && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">⚽</div>
            <h2>⚽ RECORD MATCH ACTION</h2>
            <p className="muted">Record match performance for {attemptModal.teamName}</p>

            <div className="form-group mt-6 text-left">
              <label className="section-label-v2">SELECT ATTEMPTER</label>
              <select className="premium-input-v2" value={selectedAttempter} onChange={e => setSelectedAttempter(e.target.value)}>
                <option value="">-- Choose Player --</option>
                {(attemptModal.teamId === match.team_a_id ? teamA : teamB)?.players.filter(p => (attemptModal.teamId === match.team_a_id ? fd.lineup_a : fd.lineup_b)?.includes(p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group mt-4 text-left">
              <label className="section-label-v2">SHOT OUTCOME</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <button 
                  className={`button w-full ${shotOutcome === 'SCORED' ? 'button-gold' : 'button-secondary'}`}
                  onClick={() => setShotOutcome('SCORED')}
                >
                  ⚽ GOAL!
                </button>
                <button 
                  className={`button w-full ${shotOutcome === 'SAVED' ? 'button-gold' : 'button-secondary'}`}
                  onClick={() => setShotOutcome('SAVED')}
                >
                  🧤 GK SAVE
                </button>
                <button 
                  className={`button w-full ${shotOutcome === 'MISSED' ? 'button-gold' : 'button-secondary'}`}
                  onClick={() => setShotOutcome('MISSED')}
                >
                  ❌ MISSED
                </button>
              </div>
            </div>

            {/* Goalkeeper selector (only if SAVED) */}
            {shotOutcome === 'SAVED' && (
              <div className="form-group mt-4 text-left animate-in">
                <label className="section-label-v2">OPPONENT GOALKEEPER (SAVED BY)</label>
                <select className="premium-input-v2" value={selectedGk} onChange={e => setSelectedGk(e.target.value)}>
                  <option value="">-- Choose Goalkeeper --</option>
                  {(() => {
                    const opponent = attemptModal.teamId === match.team_a_id ? teamB : teamA;
                    const opponentLineup = attemptModal.teamId === match.team_a_id ? fd.lineup_b : fd.lineup_a;
                    const activePlayers = opponent?.players.filter(p => opponentLineup?.includes(p.id)) || [];
                    const gks = activePlayers.filter(p => p.role === 'GOALKEEPER');
                    const outfield = activePlayers.filter(p => p.role !== 'GOALKEEPER');
                    return [...gks, ...outfield].map(p => (
                      <option key={p.id} value={p.id}>
                        {p.role === 'GOALKEEPER' ? `⭐ Goalkeeper: ${p.name}` : p.name}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            )}

            <div className="form-group mt-4 text-left">
              <label className="section-label-v2">MINUTE (OPTIONAL)</label>
              <input 
                type="number" 
                className="premium-input-v2" 
                placeholder={`Auto: ${getMatchMinute()}'`} 
                value={attemptMinute || ""} 
                onChange={e => setAttemptMinute(Number(e.target.value))}
              />
            </div>

            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => setAttemptModal(null)}>CANCEL</button>
              <button className="button button-gold" onClick={recordAttempt} disabled={!selectedAttempter}>RECORD SHOT</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🔄 Substitution Modal */}
      {subModal && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">🔄</div>
            <h2>SUBSTITUTION</h2>
            <p className="muted">Select bench player to come ON</p>
            
            <div className="form-group mt-6 text-left">
              <label className="section-label-v2">SELECT BENCH PLAYER</label>
              <select 
                className="premium-input-v2" 
                value={selectedAttempter}
                onChange={e => setSelectedAttempter(e.target.value)}
              >
                <option value="">-- Choose Player --</option>
                {(subModal.teamId === match.team_a_id ? teamA : teamB)?.players
                  .filter(p => {
                    const lineup = subModal.teamId === match.team_a_id ? fd.lineup_a : fd.lineup_b;
                    if (p.id === subModal.playerOutId) return false;
                    if (lineup?.includes(p.id)) return false;
                    const wasSubbedOut = subs.some(s => s.playerOutId === p.id);
                    if (wasSubbedOut) return false;
                    return true;
                  })
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>

            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => { setSubModal(null); setSelectedAttempter(""); }}>CANCEL</button>
              <button 
                className="button button-gold" 
                onClick={() => {
                  if (selectedAttempter) {
                    onPerformSubstitution(match.id, subModal.teamId, subModal.playerOutId, selectedAttempter);
                    setSubModal(null);
                    setSelectedAttempter("");
                  }
                }} 
                disabled={!selectedAttempter}
              >
                SUBSTITUTE IN
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✏️ Event Edit Modal */}
      {editEventModal && isMounted && createPortal(
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon">✏️</div>
            <h2>CORRECT EVENT LOG</h2>
            <p className="muted">Edit details of the recorded match event</p>

            {editEventModal.type === 'ATTEMPT' && (
              <>
                <div className="form-group mt-6 text-left">
                  <label className="section-label-v2">SELECT SCORER / ATTEMPTER</label>
                  <select className="premium-input-v2" value={editPlayerId} onChange={e => setEditPlayerId(e.target.value)}>
                    {(editEventModal.event.teamId === match.team_a_id ? teamA : teamB)?.players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group mt-4 text-left">
                  <label className="section-label-v2">OUTCOME</label>
                  <select className="premium-input-v2" value={editOutcome} onChange={e => setEditOutcome(e.target.value as any)}>
                    <option value="SCORED">SCORED (GOAL)</option>
                    <option value="SAVED">SAVED (GK SAVE)</option>
                    <option value="MISSED">MISSED</option>
                  </select>
                </div>

                {editOutcome === 'SAVED' && (
                  <div className="form-group mt-4 text-left">
                    <label className="section-label-v2">OPPONENT GOALKEEPER (SAVED BY)</label>
                    <select className="premium-input-v2" value={editGkId} onChange={e => setEditGkId(e.target.value)}>
                      <option value="">-- Choose Goalkeeper --</option>
                      {(() => {
                        const opponent = editEventModal.event.teamId === match.team_a_id ? teamB : teamA;
                        const opponentLineup = editEventModal.event.teamId === match.team_a_id ? fd.lineup_b : fd.lineup_a;
                        const activePlayers = opponent?.players.filter(p => opponentLineup?.includes(p.id)) || [];
                        const gks = activePlayers.filter(p => p.role === 'GOALKEEPER');
                        const outfield = activePlayers.filter(p => p.role !== 'GOALKEEPER');
                        return [...gks, ...outfield].map(p => (
                          <option key={p.id} value={p.id}>
                            {p.role === 'GOALKEEPER' ? `⭐ Goalkeeper: ${p.name}` : p.name}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                )}
              </>
            )}

            {editEventModal.type === 'CARD' && (
              <>
                <div className="form-group mt-6 text-left">
                  <label className="section-label-v2">PLAYER CARDED</label>
                  <select className="premium-input-v2" value={editPlayerId} onChange={e => setEditPlayerId(e.target.value)}>
                    {(editEventModal.event.teamId === match.team_a_id ? teamA : teamB)?.players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group mt-4 text-left">
                  <label className="section-label-v2">CARD TYPE</label>
                  <select className="premium-input-v2" value={editCardType} onChange={e => setEditCardType(e.target.value as any)}>
                    <option value="YELLOW">🟨 YELLOW CARD</option>
                    <option value="RED">🟥 RED CARD</option>
                  </select>
                </div>
              </>
            )}

            {editEventModal.type === 'SUB' && (
              <>
                <div className="form-group mt-6 text-left">
                  <label className="section-label-v2">PLAYER OFF</label>
                  <select className="premium-input-v2" value={editPlayerId} onChange={e => setEditPlayerId(e.target.value)}>
                    {(editEventModal.event.teamId === match.team_a_id ? teamA : teamB)?.players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group mt-4 text-left">
                  <label className="section-label-v2">PLAYER ON</label>
                  <select className="premium-input-v2" value={editSubInId} onChange={e => setEditSubInId(e.target.value)}>
                    {(editEventModal.event.teamId === match.team_a_id ? teamA : teamB)?.players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="form-group mt-4 text-left">
              <label className="section-label-v2">MINUTE</label>
              <input type="number" className="premium-input-v2" value={editMinute} onChange={e => setEditMinute(Number(e.target.value))} />
            </div>

            <div className="modal-actions mt-8">
              <button className="button button-secondary" onClick={() => setEditEventModal(null)}>CANCEL</button>
              <button className="button button-gold" onClick={saveEditedEvent}>SAVE CORRECTIONS</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
