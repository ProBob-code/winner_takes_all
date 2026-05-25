"use client";

import React from "react";
import { TeamPod, VSCore } from "./match-components";
import { Match, Team } from "./football-match-engine";

interface PoolMatchEngineProps {
  match: Match;
  teams: Team[];
  isLocked: boolean;
  onUpdateScore: (matchId: string, teamId: string, type: 'BALL' | 'BLACK' | 'FOUL' | 'REMOVE_BALL' | 'REMOVE_FOUL') => void;
  onUpdateHouse: (matchId: string, teamLetter: 'A' | 'B', house: 'SOLID' | 'STRIPES') => void;
  onSetActiveTeam: (matchId: string, teamId: string) => void;
}

export function PoolMatchEngine({
  match,
  teams,
  isLocked,
  onUpdateScore,
  onUpdateHouse,
  onSetActiveTeam
}: PoolMatchEngineProps) {
  const getTeamName = (tid: string) => teams.find(t => t.id === tid)?.name || "Unknown Team";

  return (
    <div className="pool-match-panel" style={{ width: '100%' }}>
      <div className="battle-view" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '24px', alignItems: 'center' }}>
        <div className="pod-wrapper red">
          <TeamPod 
            teamName={getTeamName(match.team_a_id)}
            score={match.score_team_a}
            color="red"
            isActive={match.active_team_id === match.team_a_id}
            fouls={match.fouls_a}
            house={match.team_a_house}
            ballsPotted={match.balls_potted_a}
            blackPotted={match.black_potted_a}
            onFoulClick={() => onUpdateScore(match.id, match.team_a_id, 'FOUL')}
            onFoulRemove={() => onUpdateScore(match.id, match.team_a_id, 'REMOVE_FOUL')}
            onBallClick={() => onUpdateScore(match.id, match.team_a_id, 'BALL')}
            onBallRemove={() => onUpdateScore(match.id, match.team_a_id, 'REMOVE_BALL')}
            onBlackClick={() => onUpdateScore(match.id, match.team_a_id, 'BLACK')}
            onHouseToggle={(h) => onUpdateHouse(match.id, 'A', h)}
            isLocked={isLocked}
            onClick={() => onSetActiveTeam(match.id, match.team_a_id)}
          />
        </div>

        <VSCore />

        <div className="pod-wrapper blue">
          <TeamPod 
            teamName={getTeamName(match.team_b_id)}
            score={match.score_team_b}
            color="blue"
            isActive={match.active_team_id === match.team_b_id}
            fouls={match.fouls_b}
            house={match.team_b_house}
            ballsPotted={match.balls_potted_b}
            blackPotted={match.black_potted_b}
            onFoulClick={() => onUpdateScore(match.id, match.team_b_id, 'FOUL')}
            onFoulRemove={() => onUpdateScore(match.id, match.team_b_id, 'REMOVE_FOUL')}
            onBallClick={() => onUpdateScore(match.id, match.team_b_id, 'BALL')}
            onBallRemove={() => onUpdateScore(match.id, match.team_b_id, 'REMOVE_BALL')}
            onBlackClick={() => onUpdateScore(match.id, match.team_b_id, 'BLACK')}
            onHouseToggle={(h) => onUpdateHouse(match.id, 'B', h)}
            isLocked={isLocked}
            onClick={() => onSetActiveTeam(match.id, match.team_b_id)}
          />
        </div>
      </div>
    </div>
  );
}
