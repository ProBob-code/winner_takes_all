import { cookies } from "next/headers";
import { readBackendJson } from "@/lib/backend";
import { GameRoom } from "@/components/game-room";

type MatchResponse = {
  ok: boolean;
  match?: {
    id: string;
    tournamentId: string;
    round: number;
    matchOrder: number;
    player1: { id: string; name: string; score: number } | null;
    player2: { id: string; name: string; score: number } | null;
    winnerId: string | null;
    roomCode: string | null;
    status: string;
    scoreThreshold: number;
    scoresApproved: boolean;
  };
};

type ProfileResponse = {
  ok: boolean;
  user?: { name: string; email: string };
};

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("wta_access_token")?.value || "";

    const [{ payload: matchData }, { payload: profileData }] = await Promise.all([
      readBackendJson<MatchResponse>(`/matches/${id}`),
      readBackendJson<ProfileResponse>("/user/profile"),
    ]);

    const match = matchData.match;
    const user = profileData.user;

    if (!match) {
      return (
        <main className="page">
          <div className="shell">
            <div className="panel page-card">
              <h2>Match not found</h2>
              <p className="muted">This match does not exist or has been removed.</p>
            </div>
          </div>
        </main>
      );
    }

    if (!user) {
      return (
        <main className="page">
          <div className="shell">
            <div className="panel page-card">
              <h2>Authentication Required</h2>
              <p className="muted">Please log in to access the match room.</p>
            </div>
          </div>
        </main>
      );
    }

    // Completed match view
    if (match.status === "completed" || match.scoresApproved) {
      return (
        <main className="page">
          <div className="shell">
            <div className="panel page-card slide-in">
              <h2>Match Complete ✅</h2>
              <div className="score-display" style={{ margin: "2rem 0" }}>
                <div className="score-player">
                  <div className="score-player-name">{match.player1?.name || "Player 1"}</div>
                  <div className="score-player-value" style={{ color: match.winnerId === match.player1?.id ? "var(--green-light)" : "var(--red-light)" }}>
                    {match.player1?.score || 0}
                  </div>
                </div>
                <div className="score-vs">VS</div>
                <div className="score-player">
                  <div className="score-player-name">{match.player2?.name || "Player 2"}</div>
                  <div className="score-player-value" style={{ color: match.winnerId === match.player2?.id ? "var(--green-light)" : "var(--red-light)" }}>
                    {match.player2?.score || 0}
                  </div>
                </div>
              </div>
              {match.winnerId && (
                <p style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: 700 }}>
                  👑 Winner: {match.winnerId === match.player1?.id ? match.player1?.name : match.player2?.name}
                </p>
              )}
              <div className="cta-row" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
                <a href={`/tournaments/${match.tournamentId}`} className="button-secondary">
                  ← Back to Tournament
                </a>
              </div>
            </div>
          </div>
        </main>
      );
    }

    // Live game room
    return (
      <main className="page">
        <div className="shell">
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                🎱 Match — Round {match.round}
              </h1>
              <p className="muted" style={{ fontSize: ".85rem" }}>
                Score threshold: {match.scoreThreshold} pts
              </p>
            </div>
            <a href={`/tournaments/${match.tournamentId}`} className="button-secondary button-sm">
              ← Tournament
            </a>
          </div>
          <GameRoom
            matchId={id}
            accessToken={accessToken}
            userName={user.name}
          />
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Match Room</h2>
            <p className="muted">Could not load match. Make sure the API is running on port 4000.</p>
          </div>
        </div>
      </main>
    );
  }
}
