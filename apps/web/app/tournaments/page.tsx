import Link from "next/link";
import { readBackendJson } from "@/lib/backend";

type TournamentsResponse = {
  ok: boolean;
  tournaments: Array<{
    id: string;
    name: string;
    entryFee: { amount: string; currency: string };
    maxPlayers: number;
    joinedPlayers: number;
    status: string;
  }>;
};

export default async function TournamentsPage() {
  try {
    const { payload } = await readBackendJson<TournamentsResponse>("/tournaments");
    const tournaments = payload.tournaments || [];

    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
            <h2>🎮 Tournaments</h2>
            <p className="muted">Join a tournament, compete against other players, and win the prize pool!</p>
          </div>

          <div className="tournament-grid">
            {tournaments.map(t => {
              const statusClass = `tournament-status status-${t.status}`;
              const isFree = parseFloat(t.entryFee.amount) === 0;

              return (
                <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="tournament-card slide-in">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div className="tournament-name">{t.name}</div>
                      <span className={statusClass}>{t.status.replace("_", " ")}</span>
                    </div>

                    <div className="tournament-meta">
                      <div className="tournament-meta-item">
                        💰 Entry: <span className="meta-value">{isFree ? "FREE" : `₹${t.entryFee.amount}`}</span>
                      </div>
                      <div className="tournament-meta-item">
                        👥 Players: <span className="meta-value">{t.joinedPlayers}/{t.maxPlayers}</span>
                      </div>
                    </div>

                    <div className="player-count">
                      <div className="player-dots">
                        {Array.from({ length: t.maxPlayers }).map((_, i) => (
                          <div key={i} className={`player-dot ${i < t.joinedPlayers ? "filled" : ""}`} />
                        ))}
                      </div>
                      <span className="muted" style={{ fontSize: ".75rem" }}>
                        {t.maxPlayers - t.joinedPlayers} spots left
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {tournaments.length === 0 && (
            <div className="panel page-card" style={{ textAlign: "center", padding: "3rem" }}>
              <p className="muted">No tournaments available right now. Check back soon!</p>
            </div>
          )}
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Tournaments</h2>
            <p className="muted">Could not load tournaments. Make sure the API is running on port 4000.</p>
          </div>
        </div>
      </main>
    );
  }
}
