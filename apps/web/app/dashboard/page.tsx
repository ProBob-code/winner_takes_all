import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

type ProfileResponse = {
  ok: boolean;
  user?: {
    name: string;
    email: string;
    walletBalance: string;
  };
};

type WalletResponse = {
  ok: boolean;
  wallet?: {
    balance: {
      amount: string;
      currency: string;
    };
    transactions: Array<{
      id: string;
      type: string;
      amount: {
        amount: string;
        currency: string;
      };
      referenceType: string;
    }>;
  };
};

export default async function DashboardPage() {
  try {
    const [{ response: profileResponse, payload: profilePayload }, { payload: walletPayload }] =
      await Promise.all([
        readBackendJson<ProfileResponse>("/user/profile"),
        readBackendJson<WalletResponse>("/wallet")
      ]);

    if (!profileResponse.ok || !profilePayload.user || !walletPayload.wallet) {
      return (
        <main className="page">
          <div className="shell">
            <section className="panel page-card">
              <h2>Player dashboard</h2>
              <p className="muted">
                Sign in first to see your tournament entries, wallet balance, and active
                match state.
              </p>
              <div className="cta-row">
                <Link className="button" href="/login">
                  Log in
                </Link>
                <Link className="button-secondary" href="/signup">
                  Create account
                </Link>
              </div>
            </section>
          </div>
        </main>
      );
    }

    const recentTransactions = walletPayload.wallet.transactions.slice(0, 3);

    return (
      <main className="page">
        <div className="shell page-grid">
          <section className="panel page-card">
            <h2>Player dashboard</h2>
            <p className="muted">Signed in as {profilePayload.user.email}</p>
            <div className="list">
              <div className="list-item">
                <div className="label">Player</div>
                <div className="value">{profilePayload.user.name}</div>
              </div>
              <div className="list-item">
                <div className="label">Wallet balance</div>
                <div className="value">{formatMoney(walletPayload.wallet.balance)}</div>
              </div>
              <div className="list-item">
                <div className="label">Next step</div>
                <div className="value">Join a tournament to create your first match path</div>
              </div>
            </div>
          </section>

          <aside className="stack">
            <section className="panel page-card">
              <h2>Recent ledger</h2>
              <div className="list">
                {recentTransactions.map((transaction) => (
                  <div className="list-item" key={transaction.id}>
                    <div className="label">{transaction.referenceType}</div>
                    <div className="value">{formatMoney(transaction.amount)}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel page-card">
              <h2>Session</h2>
              <div className="cta-row">
                <Link className="button-secondary" href="/tournaments">
                  Browse tournaments
                </Link>
                <LogoutButton />
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
            <h2>Player dashboard</h2>
            <p className="muted">
              The dashboard could not reach the FastAPI backend. Start the API on port
              4000 and refresh this page.
            </p>
          </section>
        </div>
      </main>
    );
  }
}
