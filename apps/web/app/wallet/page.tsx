import Link from "next/link";
import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

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
      createdAt: string;
      referenceType: string;
    }>;
  };
};

export default async function WalletPage() {
  try {
    const { response, payload } = await readBackendJson<WalletResponse>("/wallet");

    if (!response.ok || !payload.wallet) {
      return (
        <main className="page">
          <div className="shell">
            <section className="panel page-card">
              <h2>Wallet</h2>
              <p className="muted">Your wallet becomes available after you sign in.</p>
              <div className="cta-row">
                <Link className="button" href="/login">
                  Log in
                </Link>
              </div>
            </section>
          </div>
        </main>
      );
    }

    return (
      <main className="page">
        <div className="shell page-grid">
          <section className="panel page-card">
            <h2>Wallet</h2>
            <p className="muted">
              Wallet state is rendered from FastAPI ledger entries, not hardcoded frontend
              placeholders.
            </p>
            <div className="stat">{formatMoney(payload.wallet.balance)}</div>
            <div className="list">
              {payload.wallet.transactions.map((item) => (
                <div className="list-item" key={item.id}>
                  <div className="label">{item.referenceType}</div>
                  <div className="value">{formatMoney(item.amount)}</div>
                  <p className="muted">
                    {item.type} | {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="panel page-card">
            <h2>Core APIs</h2>
            <div className="list">
              <div className="list-item">GET /wallet</div>
              <div className="list-item">POST /payments/create-order</div>
              <div className="list-item">POST /payments/webhook</div>
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
            <h2>Wallet</h2>
            <p className="muted">
              The wallet page could not reach the FastAPI backend. Start the API on port
              4000 and refresh this page.
            </p>
          </section>
        </div>
      </main>
    );
  }
}
