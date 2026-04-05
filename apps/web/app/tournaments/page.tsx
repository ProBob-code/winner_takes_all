import Link from "next/link";
import { JoinTournamentButton } from "@/components/join-tournament-button";
import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

type TournamentsResponse = {
  ok: boolean;
  tournaments: Array<{
    id: string;
    name: string;
    entryFee: {
      amount: string;
      currency: string;
    };
    maxPlayers: number;
    joinedPlayers: number;
    status: string;
  }>;
};

export default async function TournamentsPage() {
  try {
    const { payload } = await readBackendJson<TournamentsResponse>("/tournaments");
    const tournaments = (payload.tournaments ?? []).map((tournament) => ({
      ...tournament,
      format: "Single elimination",
      fee: formatMoney(tournament.entryFee)
    }));

    return (
      <main className="page">
        <div className="shell page-grid">
          <section className="panel page-card">
            <h2>Tournaments</h2>
            <p className="muted">
              Tournament joins now hit the FastAPI service through the Next.js BFF layer,
              so the browser stays same-origin while the backend remains authoritative.
            </p>
          <div className="list">
            {tournaments.map((tournament) => (
              <article className="list-item" key={tournament.id}>
                <div className="label">{tournament.status}</div>
                <div className="value">
                  <Link href={`/tournaments/${tournament.id}`}>{tournament.name}</Link>
                </div>
                <p className="muted">
                  {tournament.format} · Entry fee {tournament.fee}
                </p>
                <p className="muted">
                  {tournament.joinedPlayers} of {tournament.maxPlayers} players joined
                </p>
                <JoinTournamentButton tournamentId={tournament.id} />
              </article>
            ))}
          </div>
        </section>

        <aside className="panel page-card">
          <h2>Backend hooks</h2>
          <div className="list">
            <div className="list-item">GET /tournaments</div>
            <div className="list-item">GET /tournaments/:id</div>
            <div className="list-item">POST /tournaments/:id/join</div>
          </div>
        </aside>
      </div>
    </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <section className="panel page-card">
            <h2>Tournaments</h2>
            <p className="muted">
              The tournament list could not reach the FastAPI backend. Start the API on
              port 4000 and refresh this page.
            </p>
          </section>
        </div>
      </main>
    );
  }
}
