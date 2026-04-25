"use client";
import { useEffect, useState } from "react";
import { readBackendJson } from "@/lib/backend";
import { GameRoom } from "@/components/game-room";
import { OfflineTracker } from "@/components/offline-tracker";

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

type TournamentResponse = {
  ok: boolean;
  tournament?: {
    id: string;
    name: string;
    tournamentType: string;
  };
};

type ProfileResponse = {
  ok: boolean;
  user?: { name: string; email: string };
};

export default function MatchPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Extract ID from pathname (e.g., /match/123 -> 123)
        const pathParts = window.location.pathname.split("/");
        const id = pathParts[pathParts.length - 1];

        if (!id || id === "match") {
          setError("No match ID provided");
          setLoading(false);
          return;
        }

        const [{ payload: matchData }, { payload: profileData }] = await Promise.all([
          readBackendJson<MatchResponse>(`/matches/${id}`),
          readBackendJson<ProfileResponse>("/user/profile"),
        ]);
        setData({ matchData, profileData, id });
      } catch (err) {
        setError("Could not load match data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error || !data) return <div>{error || "Not found"}</div>;

  const { matchData, profileData, id } = data;
  const accessToken = ""; // Handled by browser cookies in same-origin

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

  // Use a state for the tournament type check since it's another fetch
  const [isOffline, setIsOffline] = useState<boolean | null>(null);

  useEffect(() => {
    async function fetchTournament() {
      if (match.tournamentId) {
        const { payload: tournamentData } = await readBackendJson<TournamentResponse>(`/tournaments/${match.tournamentId}`);
        setIsOffline(tournamentData.tournament?.tournamentType === "offline");
      }
    }
    fetchTournament();
  }, [match.tournamentId]);

  if (isOffline === null) return <div>Loading tournament details...</div>;

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
              {isOffline ? "📊 Offline Match Tracking" : "🎱 Match — Round " + match.round}
            </h1>
            <p className="muted" style={{ fontSize: ".85rem" }}>
              {isOffline ? "Tracking physical game score" : "Score threshold: " + match.scoreThreshold + " pts"}
            </p>
          </div>
          <a href={`/tournaments/${match.tournamentId}`} className="button-secondary button-sm">
            ← Tournament
          </a>
        </div>
        
        {isOffline ? (
          <OfflineTracker 
            isTournamentMatch={true}
            matchId={id}
            player1Name={match.player1?.name || "Player 1"}
            player2Name={match.player2?.name || "Player 2"}
            player1Id={match.player1?.id}
            player2Id={match.player2?.id}
          />
        ) : (
          <GameRoom
            matchId={id}
            accessToken={accessToken}
            userName={user.name}
            player1Name={match.player1?.name}
            player2Name={match.player2?.name}
            player1Id={match.player1?.id}
            player2Id={match.player2?.id}
          />
        )}
      </div>
    </main>
  );
}
