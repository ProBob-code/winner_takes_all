import { JoinTournamentButton } from "@/components/join-tournament-button";
import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

type TournamentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function TournamentDetailPage({
  params
}: TournamentDetailPageProps) {
  const { id } = await params;
  try {
    const [{ payload: tournamentPayload }, { payload: leaderboardPayload }] =
      await Promise.all([
        readBackendJson<{
          ok: boolean;
          tournament?: {
            id: string;
            name: string;
            entryFee: {
              amount: string;
              currency: string;
            };
            prizePool: {
              amount: string;
              currency: string;
            };
            joinedPlayers: number;
            maxPlayers: number;
            status: string;
            bracketType: string;
            bracketState?: {
              rounds?: Array<{
                name: string;
                matches: number;
              }>;
            };
          };
        }>(`/tournaments/${id}`),
        readBackendJson<{
          ok: boolean;
          entries: Array<{
            userId: string;
            displayName: string;
            wins: number;
            losses: number;
          }>;
        }>(`/leaderboard/tournaments/${id}`)
      ]);

    const tournament = tournamentPayload.tournament;

    if (!tournament) {
      throw new Error("Missing tournament");
    }

    return (
      <main className="page">
        <div className="shell page-grid">
          <section className="panel page-card">
            <h2>{tournament.name}</h2>
            <p className="muted">
              {tournament.status} | {tournament.bracketType} | Entry fee{" "}
              {formatMoney(tournament.entryFee)}
            </p>
            <div className="list">
              <div className="list-item">
                <div className="label">Prize pool</div>
                <div className="value">{formatMoney(tournament.prizePool)}</div>
              </div>
              <div className="list-item">
                <div className="label">Capacity</div>
                <div className="value">
                  {tournament.joinedPlayers} / {tournament.maxPlayers} players
                </div>
              </div>
              {tournament.bracketState?.rounds?.map((round) => (
                <div className="list-item" key={round.name}>
                  <div className="label">{round.name}</div>
                  <div className="value">{round.matches} matches</div>
                </div>
              ))}
            </div>
          </section>

          <aside className="stack">
            <section className="panel page-card">
              <h2>Join</h2>
              <JoinTournamentButton tournamentId={tournament.id} />
            </section>

            <section className="panel page-card">
              <h2>Participants</h2>
              <div className="list">
                {leaderboardPayload.entries.length > 0 ? (
                  leaderboardPayload.entries.map((entry) => (
                    <div className="list-item" key={entry.userId}>
                      <div className="value">{entry.displayName}</div>
                      <p className="muted">
                        {entry.wins} wins | {entry.losses} losses
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="list-item">No players have joined yet.</div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <section className="panel page-card">
            <h2>Tournament {id}</h2>
            <p className="muted">
              This page could not reach the FastAPI backend. Start the API on port 4000
              and refresh this page.
            </p>
          </section>
        </div>
      </main>
    );
  }
}
