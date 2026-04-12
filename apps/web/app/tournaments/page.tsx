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
          <div className="app-header slide-in">
            <div className="header-info">
              <h1>Tournaments</h1>
              <p className="muted">Join active lobbies and claim the prize pool.</p>
            </div>
            <div className="header-actions">
              <Link href="/tournaments/create" className="button button-gold floating-action-mobile">
                + Host Tournament
              </Link>
            </div>
          </div>

          <div className="tournament-grid mt-6">
            {tournaments.map(t => {
              const statusClass = `tournament-status status-${t.status}`;
              const isFree = parseFloat(t.entryFee.amount) === 0;

              return (
                <Link key={t.id} href={`/tournaments/${t.id}`} className="tournament-app-card slide-in">
                  <div className="card-top">
                    <span className={statusClass}>{t.status.replace("_", " ")}</span>
                    <span className="card-players">
                      <span className="icon">👥</span> {t.joinedPlayers}/{t.maxPlayers}
                    </span>
                  </div>
                  <h3 className="card-title glow-text">{t.name}</h3>
                  <div className="card-bottom">
                    <div className="card-fee">
                      <span className="muted text-xs">ENTRY FEE</span>
                      <strong className={isFree ? "text-green" : "text-accent"}>
                        {isFree ? "FREE" : `₹${t.entryFee.amount}`}
                      </strong>
                    </div>
                    <div className="card-action">
                      <span className="join-arrow">→</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {tournaments.length === 0 && (
            <div className="empty-state slide-in">
              <div className="empty-icon">🎮</div>
              <h3>No tournaments found</h3>
              <p className="muted" style={{ maxWidth: 400, margin: "auto" }}>No active tournaments are running right now. Why not host your own and invite friends?</p>
              <Link href="/tournaments/create" className="button button-secondary" style={{ marginTop: "1.5rem" }}>
                Host First Tournament
              </Link>
            </div>
          )}
        </div>
      </main>
    );
  } catch (err: any) {
    return (
      <main className="page">
        <div className="shell">
          <div className="app-header">
            <div className="header-info">
              <h1>Tournaments</h1>
            </div>
          </div>
          <div className="panel p-6 mt-6" style={{ borderColor: "var(--red-subtle)", background: "rgba(239, 68, 68, 0.05)" }}>
            <h3 className="text-red">Connection Error</h3>
            <p className="muted mt-2">Could not load tournaments. The API might be offline. Error: {err.message || 'Unknown'}</p>
          </div>
        </div>
      </main>
    );
  }
}
