"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { formatMoney } from "@/lib/format";
import { PaymentButton } from "@/components/payment-button";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

const TX_LABELS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  deposit: { label: "Wallet Top-up", icon: "💳", color: "var(--green-light)", bg: "var(--green-subtle)" },
  entry_fee_debit: { label: "Entry Fee", icon: "🎮", color: "var(--red-light)", bg: "var(--red-subtle)" },
  tournament_payout: { label: "Tournament Payout", icon: "🏆", color: "var(--gold)", bg: "var(--gold-subtle)" },
  refund: { label: "Refund", icon: "↩️", color: "var(--cyan)", bg: "var(--cyan-subtle)" },
  manual_adjustment: { label: "Bonus", icon: "🎁", color: "var(--accent-light)", bg: "var(--accent-subtle)" },
};

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWallet = async () => {
      if (typeof window === "undefined") return;
      try {
        setLoading(true);
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/wallet`, { 
          cache: "no-store",
          credentials: "include" 
        });
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

  const stats = useMemo(() => {
    if (!wallet?.transactions) return { deposits: 0, winnings: 0, entries: 0 };
    return wallet.transactions.reduce((acc: any, tx: any) => {
      const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount || 0);
      if (tx.type === "deposit") acc.deposits += amt;
      if (tx.type === "tournament_payout") acc.winnings += amt;
      if (tx.type === "entry_fee_debit") acc.entries += amt;
      return acc;
    }, { deposits: 0, winnings: 0, entries: 0 });
  }, [wallet]);

  if (loading) {
    return (
      <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="status-main">SYNCING VAULT...</div>
      </main>
    );
  }

  if (error || !wallet) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card" style={{ textAlign: 'center' }}>
            <h2>Wallet Connection Lost</h2>
            <p className="muted">Please ensure you are logged in securely.</p>
            <button onClick={() => router.push("/login")} className="button" style={{ marginTop: "1.5rem" }}>Login Now</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ padding: "2rem" }}>
      <div className="shell" style={{ maxWidth: "1200px" }}>
        
        <div className="page-header" style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 900 }}>Financial Dashboard</h1>
          <p className="muted">Manage your tournament credits and track earnings</p>
        </div>

        <div className="page-grid" style={{ gridTemplateColumns: "1fr 350px", gap: "2rem" }}>
          
          <div className="stack" style={{ gap: "2rem" }}>
            {/* Main Balance Card */}
            <div className="panel" style={{ 
              background: "linear-gradient(135deg, rgba(20, 10, 60, 0.8) 0%, rgba(5, 2, 20, 0.9) 100%)",
              padding: "2.5rem",
              borderRadius: "32px",
              border: "1px solid var(--glass-border-color-hover)",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5), inset 0 0 40px rgba(187, 134, 252, 0.05)"
            }}>
              {/* Background Accents */}
              <div style={{ position: "absolute", top: "-100px", right: "-100px", width: "300px", height: "300px", background: "var(--accent)", filter: "blur(120px)", opacity: 0.1, pointerEvents: "none" }}></div>
              <div style={{ position: "absolute", bottom: "-100px", left: "-100px", width: "250px", height: "250px", background: "var(--cyan)", filter: "blur(100px)", opacity: 0.05, pointerEvents: "none" }}></div>
              
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
                  <div>
                    <div style={{ color: "var(--accent-light)", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                      Available Balance
                    </div>
                    <div style={{ fontSize: "4rem", fontWeight: 950, fontFamily: "var(--font-outfit)", letterSpacing: "-2px" }}>
                      {formatMoney(wallet.balance)}
                    </div>
                  </div>
                  <div style={{ 
                    background: "rgba(255,255,255,0.05)", 
                    padding: "1rem", 
                    borderRadius: "20px", 
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <span style={{ fontSize: "2rem" }}>💎</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "2rem", marginBottom: "2rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1.5rem" }}>
                   <div>
                     <div className="muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>CURRENCY</div>
                     <div style={{ fontWeight: 700 }}>INR / Credits</div>
                   </div>
                   <div>
                     <div className="muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>STATUS</div>
                     <div style={{ fontWeight: 700, color: "var(--green-light)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                       <span style={{ width: "8px", height: "8px", background: "var(--green)", borderRadius: "50%", boxShadow: "0 0 10px var(--green)" }}></span>
                       SECURED
                     </div>
                   </div>
                   <div>
                     <div className="muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>LAST SYNC</div>
                     <div style={{ fontWeight: 700 }}>Just Now</div>
                   </div>
                </div>

                <div className="cta-row" style={{ marginTop: "auto" }}>
                  <PaymentButton />
                  <button className="button-secondary" style={{ opacity: 0.6, cursor: "not-allowed" }} title="Coming Soon">
                    Withdraw
                  </button>
                </div>
              </div>
            </div>

            {/* Transaction List */}
            <div className="stack" style={{ gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "1.5rem" }}>Recent Activity</h3>
                <span className="muted" style={{ fontSize: "0.85rem" }}>Showing last 20 operations</span>
              </div>
              
              <div className="list">
                {wallet.transactions.length === 0 ? (
                  <div className="panel" style={{ padding: "4rem", textAlign: "center", opacity: 0.5 }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🌑</div>
                    <p>No transaction history found.</p>
                  </div>
                ) : (
                  wallet.transactions.map((tx: any) => {
                    const meta = TX_LABELS[tx.type] || { label: tx.type, icon: "📋", color: "var(--text-primary)", bg: "rgba(255,255,255,0.05)" };
                    const isCredit = tx.type === "deposit" || tx.type === "tournament_payout" || tx.type === "manual_adjustment" || tx.type === "refund";
                    return (
                      <div key={tx.id} className="panel interactive-hover" style={{ 
                        padding: "1rem 1.5rem",
                        display: "grid",
                        gridTemplateColumns: "48px 1fr 150px",
                        alignItems: "center",
                        gap: "1.5rem"
                      }}>
                        <div style={{ 
                          width: "48px", 
                          height: "48px", 
                          borderRadius: "14px", 
                          background: meta.bg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.25rem",
                          border: `1px solid ${meta.color}22`
                        }}>
                          {meta.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700 }}>{meta.label}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            {tx.referenceType} • {new Date(tx.createdAt).toLocaleDateString()} at {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 900, fontSize: "1.25rem", color: meta.color }}>
                            {isCredit ? "+" : "-"}{formatMoney(tx.amount)}
                          </div>
                          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--green)", opacity: 0.8, letterSpacing: "1px" }}>COMPLETED</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Stats Area */}
          <div className="stack" style={{ gap: "2rem" }}>
            <div className="panel" style={{ padding: "1.5rem" }}>
              <h4 style={{ marginBottom: "1.5rem", fontSize: "1.1rem" }}>Portfolio Analytics</h4>
              <div className="stack" style={{ gap: "1rem" }}>
                <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="muted" style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Total Winnings</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--gold)" }}>{formatMoney(stats.winnings)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="muted" style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Total Deposited</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--green-light)" }}>{formatMoney(stats.deposits)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="muted" style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" }}>Entry Fees Paid</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--red-light)" }}>{formatMoney(stats.entries)}</div>
                </div>
              </div>
            </div>

            <div className="panel" style={{ padding: "1.5rem", border: "1px dashed var(--border-color)", background: "transparent" }}>
              <h4 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Security Tips</h4>
              <ul className="muted" style={{ fontSize: "0.85rem", paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <li>Never share your tournament OTP with anyone.</li>
                <li>Refunds for cancelled tournaments are processed instantly.</li>
                <li>Payouts are subject to anti-cheat verification.</li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
