"use client";

/**
 * The quick arena's scoreboard for the racket sports: tennis, badminton,
 * pickleball and table tennis. One game to the sport's target, clear by two
 * (lib/local-score.ts RALLY_RULES): a point button and an undo for each side,
 * and the rule in words, so nobody has to ask what the target is.
 */

import { RALLY_RULES, rallyWinner } from "@/lib/local-score";
import { sportInfo } from "@/lib/sports";

interface RallyMatch {
  team_a_id: string;
  team_b_id: string;
  score_team_a: number;
  score_team_b: number;
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
  const rules = RALLY_RULES[match.sport];
  const a = match.score_team_a;
  const b = match.score_team_b;
  const target = rules?.target ?? 11;
  // Game point: one more rally would win it.
  const gamePoint = (mine: number, theirs: number) =>
    rallyWinner(mine + 1, theirs, match.sport) === "A";

  const side = (teamId: string, name: string, mine: number, theirs: number) => (
    <div className="rally-side">
      <div className="rally-name">{name}</div>
      <div className="rally-score">{mine}</div>
      {match.status === "LIVE" && gamePoint(mine, theirs) && <div className="rally-flag">GAME POINT</div>}
      {!isLocked && match.status === "LIVE" && (
        <div className="rally-actions">
          <button type="button" className="button button-gold button-lg" onClick={() => onPoint(teamId, false)}>
            + POINT
          </button>
          <button type="button" className="button button-secondary" onClick={() => onPoint(teamId, true)} disabled={mine <= 0} title="Take back the last point">
            −
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="rally-engine glass-morphism">
      <div className="rally-kicker">
        {info.icon} {info.label.toUpperCase()} · FIRST TO {target}, WIN BY {rules?.winBy ?? 2}
        {rules?.cap ? ` · CAPPED AT ${rules.cap}` : ""}
      </div>
      <div className="rally-board">
        {side(match.team_a_id, teamAName, a, b)}
        <div className="rally-vs">VS</div>
        {side(match.team_b_id, teamBName, b, a)}
      </div>
    </div>
  );
}
