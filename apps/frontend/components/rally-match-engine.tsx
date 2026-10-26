"use client";

/**
 * The quick arena's scoreboard for the racket sports: tennis, badminton,
 * pickleball and table tennis (lib/local-score.ts holds the rules). A point
 * button and an undo for each side, the rule in words, and the call: deuce,
 * advantage, game point, match point. For tennis the big number is games,
 * with the game in progress as it is said underneath: 15, 30, 40, AD.
 */

import { racketRuleText } from "@/lib/local-score";
import { sportInfo } from "@/lib/sports";
import { RacketCallBanner, tennisGameScore } from "@/components/racket-call";

interface RallyMatch {
  team_a_id: string;
  team_b_id: string;
  score_team_a: number;
  score_team_b: number;
  balls_potted_a: number;
  balls_potted_b: number;
  black_potted_a: boolean;
  black_potted_b: boolean;
  sudden_death: boolean;
  winner_id: string | null;
  status: string;
  sport: string;
}

export function RallyMatchEngine({
  match,
  teamAName,
  teamBName,
  isLocked,
  onPoint,
}: {
  match: RallyMatch;
  teamAName: string;
  teamBName: string;
  isLocked: boolean;
  onPoint: (teamId: string, undo: boolean) => void;
}) {
  const info = sportInfo(match.sport);
  const tennis = match.sport === "TENNIS";

  const side = (which: "A" | "B", teamId: string, name: string, mine: number, pointsInGame: number) => (
    <div className="rally-side">
      <div className="rally-name">{name}</div>
      <div className="rally-score">{mine}</div>
      {tennis && (
        <div className="rally-game" title="This game">
          {tennisGameScore(match, which)}
        </div>
      )}
      {!isLocked && match.status === "LIVE" && (
        <div className="rally-actions">
          <button type="button" className="button button-gold button-lg" onClick={() => onPoint(teamId, false)}>
            + POINT
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onPoint(teamId, true)}
            disabled={(tennis ? pointsInGame : mine) <= 0}
            title={tennis ? "Take back the last point of this game" : "Take back the last point"}
          >
            −
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="rally-engine glass-morphism">
      <div className="rally-kicker">
        {info.icon} {info.label.toUpperCase()} · {racketRuleText(match.sport).toUpperCase()}
      </div>
      <RacketCallBanner match={match} sport={match.sport} nameA={teamAName} nameB={teamBName} />
      <div className="rally-board">
        {side("A", match.team_a_id, teamAName, match.score_team_a, match.balls_potted_a)}
        <div className="rally-vs">{tennis ? "GAMES" : "VS"}</div>
        {side("B", match.team_b_id, teamBName, match.score_team_b, match.balls_potted_b)}
      </div>
    </div>
  );
}
