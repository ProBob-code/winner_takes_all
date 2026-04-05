import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

type LeaderboardResponse = {
  ok: boolean;
  entries: Array<{
    userId: string;
    displayName: string;
    wins: number;
    losses: number;
    earnings: {
      amount: string;
      currency: string;
    };
  }>;
};

export default async function LeaderboardPage() {
  try {
    const { payload } = await readBackendJson<LeaderboardResponse>("/leaderboard/global");

    return (
      <main className="page">
        <div className="shell page-grid">
          <section className="panel page-card">
            <h2>Leaderboard</h2>
            <div className="list">
              {payload.entries.map((leader) => (
                <div className="list-item" key={leader.userId}>
                  <div className="value">{leader.displayName}</div>
                  <p className="muted">
                    {leader.wins} wins | {leader.losses} losses | {formatMoney(leader.earnings)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="panel page-card">
            <h2>Leaderboard slices</h2>
            <p className="muted">
              Global and tournament-local rankings now flow from FastAPI instead of mock
              cards, which keeps the surface aligned with future payout logic.
            </p>
          </aside>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <section className="panel page-card">
            <h2>Leaderboard</h2>
            <p className="muted">
              The leaderboard could not reach the FastAPI backend. Start the API on port
              4000 and refresh this page.
            </p>
          </section>
        </div>
      </main>
    );
  }
}
