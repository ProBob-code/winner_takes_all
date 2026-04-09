"use client";

type MatchPlayer = {
  id: string;
  name: string;
  score: number;
  submittedScore?: number | null;
};

type Match = {
  id: string;
  player1: MatchPlayer | null;
  player2: MatchPlayer | null;
  winnerId: string | null;
  status: string;
  scoreThreshold: number;
  scheduledAt?: string | null;
};

type Round = {
  name: string;
  roundNumber: number;
  scoreThreshold: number;
  matches: Match[];
};

type BracketViewProps = {
  rounds: Round[];
  tournamentStatus: string;
};

export function BracketView({ rounds, tournamentStatus }: BracketViewProps) {
  if (!rounds || rounds.length === 0) {
    return (
      <div className="waiting-room">
        <div className="waiting-spinner" />
        <div className="waiting-text">
          Bracket will be generated when all players join
          <span className="waiting-dots" />
        </div>
      </div>
    );
  }

  return (
    <div className="bracket-container">
      <div className="bracket-tree">
        {rounds.map((round, ri) => (
          <div key={ri} className="bracket-round">
            <div className="bracket-round-title">
              {round.name}
              <div style={{ fontSize: ".65rem", color: "var(--text-muted)", marginTop: ".25rem", textTransform: "none", letterSpacing: "normal" }}>
                Threshold: {round.scoreThreshold} pts
              </div>
            </div>
            {round.matches.map((match, mi) => {
              const isActive = match.status === "in_progress";
              const isCompleted = match.status === "completed" || match.status === "bye";
              const isPending = match.status === "pending";
              const isScoreSubmitted = match.status === "score_submitted";

              return (
                <div
                  key={match.id || mi}
                  className={`bracket-match ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                >
                  <PlayerSlot
                    player={match.player1}
                    isWinner={match.winnerId === match.player1?.id}
                    isEliminated={isCompleted && match.winnerId !== match.player1?.id && match.player1 !== null}
                  />
                  <PlayerSlot
                    player={match.player2}
                    isWinner={match.winnerId === match.player2?.id}
                    isEliminated={isCompleted && match.winnerId !== match.player2?.id && match.player2 !== null}
                  />
                  <div className="bracket-match-info">
                    <span>
                      {isActive ? "🔴 LIVE" :
                       isScoreSubmitted ? "📋 Awaiting Approval" :
                       isPending ? "⏳ Upcoming" :
                       isCompleted ? "✅ Done" : "⏸ Waiting"}
                    </span>
                    {match.scheduledAt && (
                      <span>{new Date(match.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerSlot({
  player,
  isWinner,
  isEliminated,
}: {
  player: MatchPlayer | null;
  isWinner: boolean;
  isEliminated: boolean;
}) {
  if (!player) {
    return (
      <div className="bracket-player tbd">
        <span className="bracket-player-name">TBD</span>
        <span className="bracket-player-score">-</span>
      </div>
    );
  }

  return (
    <div className={`bracket-player ${isWinner ? "winner" : ""} ${isEliminated ? "eliminated" : ""}`}>
      <span className="bracket-player-name">
        {isWinner && "👑 "}{player.name}
      </span>
      <span className="bracket-player-score">{player.score} pts</span>
    </div>
  );
}
