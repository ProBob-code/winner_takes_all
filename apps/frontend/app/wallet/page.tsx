"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { PaymentButton } from "@/components/payment-button";
import { useRouter } from "next/navigation";

const TX_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  deposit: { label: "Wallet Top-up", icon: "💳", color: "var(--green-light)" },
  entry_fee_debit: { label: "Entry Fee", icon: "🎮", color: "var(--red-light)" },
  tournament_payout: { label: "Tournament Payout", icon: "🏆", color: "var(--gold)" },
  refund: { label: "Refund", icon: "↩️", color: "var(--cyan)" },
  manual_adjustment: { label: "Bonus", icon: "🎁", color: "var(--accent-light)" },
};

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/wallet");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (data.wallet) setWallet(data.wallet);
      } catch (err: any) {
        console.error("Wallet error:", err);
        setError(err.message || "Failed to load wallet");
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, [router]);

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Opening Secure Vault...</h2>
          </div>
        </div>
      </main>
    );
  }

  if (error || !wallet) {
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

  return (
    <main className="page" style={{ padding: "1rem 2rem" }}>
      <div className="shell" style={{ maxWidth: "1000px" }}>
        
        {/* Premium Hero Balance Section */}
        <div className="wallet-hero slide-in" style={{ marginBottom: "2.5rem" }}>
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ opacity: 0.6, letterSpacing: "3px", textTransform: "uppercase", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              Active Arena Portfolio
            </div>
            <div className="glow-text" style={{ fontSize: "4.5rem", marginBottom: "1.5rem" }}>
              {formatMoney(wallet.balance)}
            </div>
            <PaymentButton />
          </div>
        </div>

        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          
          {/* Transaction History Feed */}
          <div className="stack" style={{ gap: "1.5rem" }}>
            <h3 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Ledger Activity</h3>
            <div className="list" style={{ gap: "0.75rem" }}>
              {wallet.transactions.length === 0 ? (
                <div className="panel" style={{ textAlign: "center", padding: "3rem", opacity: 0.5 }}>
                  No recorded activities yet.
                </div>
              ) : (
                wallet.transactions.map((tx: any) => {
                  const meta = TX_LABELS[tx.type] || { label: tx.type, icon: "📋", color: "var(--text-primary)" };
                  const isCredit = tx.type === "deposit" || tx.type === "tournament_payout" || tx.type === "manual_adjustment" || tx.type === "refund";
                  return (
                    <div key={tx.id} className="panel interactive-hover" style={{ 
                      padding: "1.25rem 1.75rem", 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                        <div style={{ 
                          width: "48px", 
                          height: "48px", 
                          borderRadius: "12px", 
                          background: `${meta.color}11`, 
                          backgroundClip: "text",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          display: "flex", 
                          justifyContent: "center", 
                          alignItems: "center",
                          fontSize: "1.5rem",
                          border: `1px solid ${meta.color}22`
                        }}>
                          {meta.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "1rem" }}>{meta.label}</div>
                          <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {tx.referenceType} • {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {tx.isTest && (
                              <span style={{ 
                                background: "rgba(239, 68, 68, 0.15)", 
                                color: "#f87171", 
                                padding: "1px 6px", 
                                borderRadius: "4px", 
                                fontSize: "0.6rem",
                                fontWeight: 800,
                                border: "1px solid rgba(239, 68, 68, 0.2)"
                              }}>
                                TEST MODE
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, color: meta.color, fontSize: "1.2rem" }}>
                          {isCredit ? "+" : "-"}{formatMoney(tx.amount)}
                        </div>
                        <div style={{ fontSize: "0.65rem", opacity: 0.4 }}>SUCCESS</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
