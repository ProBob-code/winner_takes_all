import Link from "next/link";
import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";
import { BracketView } from "@/components/bracket-view";

type TournamentDetailResponse = {
  ok: boolean;
  tournament?: {
    id: string;
    name: string;
    entryFee: { amount: string; currency: string };
    prizePool: { amount: string; currency: string };
    maxPlayers: number;
    joinedPlayers: number;
    status: string;
    bracketType: string;
    platformFeePercent: number;
    winnerId?: string | null;
  };
};

type BracketResponse = {
  ok: boolean;
  tournamentId: string;
  tournamentName: string;
  status: string;
  rounds: Array<{
    name: string;
    roundNumber: number;
    scoreThreshold: number;
    matches: Array<{
      id: string;
      player1: { id: string; name: string; score: number; submittedScore?: number | null } | null;
      player2: { id: string; name: string; score: number; submittedScore?: number | null } | null;
      winnerId: string | null;
      status: string;
      scoreThreshold: number;
      scheduledAt?: string | null;
    }>;
  }>;
};

type ParticipantsResponse = {
  ok: boolean;
  participants: Array<{
    userId: string;
    displayName: string;
    status: string;
    totalScore: number;
    wins: number;
    losses: number;
    eliminatedInRound?: number | null;
  }>;
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [{ payload: tournamentData }, { payload: bracketData }, { payload: participantData }] =
      await Promise.all([
        readBackendJson<TournamentDetailResponse>(`/tournaments/${id}`),
        readBackendJson<BracketResponse>(`/tournaments/${id}/bracket`),
        readBackendJson<ParticipantsResponse>(`/tournaments/${id}/participants`),
      ]);

    const tournament = tournamentData.tournament;
    if (!tournament) {
      return (
        <main className="page">
          <div className="shell">
            <div className="panel page-card"><h2>Tournament not found</h2></div>
          </div>
        </main>
      );
    }

    const statusClass = `tournament-status status-${tournament.status}`;
    const isCompleted = tournament.status === "completed";
    const isOpen = tournament.status === "open";
    const participants = participantData.participants || [];
    const rounds = bracketData.rounds || [];
    const winnerParticipant = participants.find(p => p.status === "winner");

    // Calculate prize info
    const prizePool = parseFloat(tournament.prizePool.amount);
    const winnerPayout = prizePool * (1 - tournament.platformFeePercent / 100);

    return (
      <main className="page">
        <div className="shell">
          {/* Tournament Header */}
          <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.5rem" }}>{tournament.name}</h2>
                <span className={statusClass}>{tournament.status.replace("_", " ")}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="tournament-meta">
                  <div className="tournament-meta-item">
                    💰 Entry: <span className="meta-value">₹{tournament.entryFee.amount}</span>
                  </div>
                  <div className="tournament-meta-item">
                    🏆 Prize: <span className="meta-value">₹{tournament.prizePool.amount}</span>
                  </div>
                  <div className="tournament-meta-item">
                    👥 <span className="meta-value">{tournament.joinedPlayers}/{tournament.maxPlayers}</span>
                  </div>
                </div>
              </div>
            </div>

            {isOpen && (
              <div className="cta-row">
                <form action={`/api/tournaments/${id}/join`} method="POST">
                  <button type="submit" className="button">Join Tournament</button>
                </form>
              </div>
            )}
          </div>

          {/* Winner Banner */}
          {isCompleted && winnerParticipant && (
            <div className="tournament-complete slide-in" style={{ marginBottom: "1.5rem" }}>
              <h2>🏆 Tournament Complete!</h2>
              <div className="tournament-winner-name">{winnerParticipant.displayName}</div>
              <div className="tournament-payout">
                Won ₹{winnerPayout.toFixed(2)} ({tournament.platformFeePercent}% platform fee applied)
              </div>
            </div>
          )}

          {/* Bracket */}
          <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
            <h2>🏗️ Bracket</h2>
            <BracketView rounds={rounds} tournamentStatus={tournament.status} />
          </div>

          {/* Match Schedule */}
          {rounds.length > 0 && (
            <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
              <h2>📅 Match Schedule</h2>
              <div className="match-schedule">
                {rounds.flatMap(round =>
                  round.matches
                    .filter(m => m.status !== "completed" && m.status !== "bye")
                    .map(match => (
                      <Link
                        key={match.id}
                        href={`/match/${match.id}`}
                        className="match-schedule-item"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div className="match-time">
                          {match.scheduledAt ? new Date(match.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                        </div>
                        <div className="match-players">
                          {match.player1?.name || "TBD"} vs {match.player2?.name || "TBD"}
                        </div>
                        <span className="match-round-badge">{round.name}</span>
                      </Link>
                    ))
                )}
                {rounds.every(r => r.matches.every(m => m.status === "completed" || m.status === "bye")) && (
                  <p className="muted">All matches completed!</p>
                )}
              </div>
            </div>
          )}

          {/* Participants / Leaderboard */}
          <div className="panel page-card slide-in">
            <h2>📊 Standings</h2>
            {participants.length > 0 ? (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Score</th>
                    <th>W/L</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {participants
                    .sort((a, b) => {
                      const order: Record<string, number> = { winner: 0, active: 1, registered: 2, eliminated: 3 };
                      return (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.totalScore - a.totalScore;
                    })
                    .map((p, i) => (
                    <tr key={p.userId}>
                      <td className={`leaderboard-rank ${i < 3 ? `rank-${i + 1}` : ""}`}>{i + 1}</td>
                      <td className="leaderboard-name">
                        {p.displayName}
                        {p.status === "winner" && <span className="leaderboard-badge badge-winner">👑 Champion</span>}
                        {p.status === "eliminated" && <span className="leaderboard-badge badge-eliminated">Eliminated R{p.eliminatedInRound}</span>}
                        {p.status === "active" && <span className="leaderboard-badge badge-active">Active</span>}
                      </td>
                      <td>{p.totalScore} pts</td>
                      <td>{p.wins}W / {p.losses}L</td>
                      <td><span className={`tournament-status status-${p.status === "winner" ? "completed" : p.status === "eliminated" ? "cancelled" : "open"}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No participants yet. Be the first to join!</p>
            )}
          </div>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Tournament</h2>
            <p className="muted">Could not load tournament details. Make sure the API is running on port 4000.</p>
          </div>
        </div>
      </main>
    );
  }
}
