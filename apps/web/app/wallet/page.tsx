import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";
import { PaymentButton } from "@/components/payment-button";

type WalletResponse = {
  ok: boolean;
  wallet?: {
    balance: { amount: string; currency: string };
    transactions: Array<{
      id: string;
      type: string;
      amount: { amount: string; currency: string };
      referenceType: string;
      createdAt: string;
    }>;
  };
};

const TX_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  deposit: { label: "Wallet Top-up", icon: "💳", color: "var(--green-light)" },
  entry_fee_debit: { label: "Entry Fee", icon: "🎮", color: "var(--red-light)" },
  tournament_payout: { label: "Tournament Payout", icon: "🏆", color: "var(--gold)" },
  refund: { label: "Refund", icon: "↩️", color: "var(--cyan)" },
  manual_adjustment: { label: "Bonus", icon: "🎁", color: "var(--accent-light)" },
};

export default async function WalletPage() {
  try {
    const { payload, response } = await readBackendJson<WalletResponse>("/wallet");

    if (!response.ok || !payload.wallet) {
      return (
        <main className="page">
          <div className="shell">
            <div className="panel page-card">
              <h2>Wallet</h2>
              <p className="muted">Please log in to view your wallet.</p>
            </div>
          </div>
        </main>
      );
    }

    const wallet = payload.wallet;

    return (
      <main className="page">
        <div className="shell" style={{ maxWidth: "800px" }}>
          <div className="wallet-balance-card slide-in" style={{ marginBottom: "1.5rem" }}>
            <div className="wallet-balance-label">Available Balance</div>
            <div className="wallet-balance-amount">₹{wallet.balance.amount}</div>
            <PaymentButton />
          </div>

          <div className="panel page-card slide-in">
            <h2>Transaction History</h2>
            <div className="list">
              {wallet.transactions.length === 0 ? (
                <p className="muted">No transactions yet.</p>
              ) : (
                wallet.transactions.map(tx => {
                  const meta = TX_LABELS[tx.type] || { label: tx.type, icon: "📋", color: "var(--text-primary)" };
                  const isCredit = tx.type === "deposit" || tx.type === "tournament_payout" || tx.type === "manual_adjustment" || tx.type === "refund";
                  return (
                    <div key={tx.id} className="list-item">
                      <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                        <span style={{ fontSize: "1.25rem" }}>{meta.icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{meta.label}</div>
                          <div className="muted" style={{ fontSize: ".75rem" }}>
                            {tx.referenceType} · {new Date(tx.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: meta.color, fontSize: ".95rem" }}>
                        {isCredit ? "+" : "-"}₹{tx.amount.amount}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Wallet</h2>
            <p className="muted">Could not load wallet. Make sure the API is running.</p>
          </div>
        </div>
      </main>
    );
  }
}
