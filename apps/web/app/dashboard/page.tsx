import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { readBackendJson } from "@/lib/backend";
import { formatMoney } from "@/lib/format";
import { GamingRadio } from "@/components/gaming-radio";

type ProfileResponse = {
  ok: boolean;
  user?: {
    id: string;
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
            <section className="panel page-card text-center" style={{ padding: "4rem" }}>
              <div className="glow-text" style={{ fontSize: "3rem", marginBottom: "1rem" }}>Enter the Arena</div>
              <p className="muted" style={{ fontSize: "1.2rem", marginBottom: "2.5rem" }}>
                Connect your account to access your personalized command center.
              </p>
              <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
                <Link className="button" href="/login" style={{ padding: "1rem 2.5rem" }}>
                  Log In
                </Link>
                <Link className="button-secondary" href="/signup" style={{ padding: "1rem 2.5rem" }}>
                  Join Elite
                </Link>
              </div>
            </section>
          </div>
        </main>
      );
    }

    const user = profilePayload.user;
    const balance = walletPayload.wallet.balance;

    return (
      <main className="page dashboard-page" style={{ padding: "1rem 2rem" }}>
        <div className="shell">
          {/* Welcome Interactive Banner */}
          <div className="profile-banner slide-in" style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.05))",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            position: "relative",
            overflow: "hidden"
          }}>
             <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "200px", height: "200px", background: "var(--accent)", filter: "blur(100px)", opacity: 0.1 }}></div>
             <div className="profile-hero-info">
               <h1 className="glow-text" style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>Welcome back, {user.name.split(' ')[0]}!</h1>
               <p className="muted" style={{ fontSize: "1.1rem" }}>The arena is active. You have {walletPayload.wallet.transactions.length} recent activities to review.</p>
             </div>
             <div className="profile-balance-highlight" style={{ borderLeft: "none" }}>
                <Link href="/wallet" style={{ textDecoration: "none" }}>
                  <div className="balance-amount interactive-scale" style={{ fontSize: "3.5rem" }}>
                    {formatMoney(balance)}
                  </div>
                </Link>
                <span className="muted" style={{ display: "block", fontSize: "0.8rem", letterSpacing: "2px" }}>AVAILABLE CREDITS</span>
             </div>
          </div>

          <div className="dashboard-grid" style={{ gridTemplateColumns: "1.6fr 1fr", gap: "2rem" }}>
            
            {/* Left Stack: Interactive Zone */}
            <div className="stack" style={{ gap: "2rem" }}>
              
              {/* Chill Zone Card with Music */}
              <div className="panel slide-in dashboard-card interactive-hover" style={{ 
                animationDelay: "0.1s", 
                background: "linear-gradient(145deg, rgba(20,20,30,0.8), rgba(10,10,15,0.9))",
                padding: "2.5rem"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                  <h3 style={{ fontSize: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ animation: "pulse 2s infinite" }}>🎧</span> Gaming Lounge
                  </h3>
                  <div className="profile-badge" style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.1)", color: "var(--green)" }}>LIVE AMBIENT</div>
                </div>

                <GamingRadio />

                <div style={{ marginTop: "2rem" }}>
                  <h4 style={{ marginBottom: "1rem", fontSize: "1rem", opacity: 0.8 }}>Strategy Hub</h4>
                  <div className="info-list" style={{ gap: "0.75rem" }}>
                    <div className="info-row" style={{ background: "rgba(139, 92, 246, 0.05)", borderColor: "rgba(139, 92, 246, 0.1)" }}>
                      <span className="info-label">Current Tip:</span>
                      <span className="info-value" style={{ color: "var(--accent-light)" }}>"Always observe the break speed in 8-Ball; 85% leads to better scattering."</span>
                    </div>
                    <div className="info-row" style={{ background: "rgba(6, 182, 212, 0.05)", borderColor: "rgba(6, 182, 212, 0.1)" }}>
                      <span className="info-label">Team Synergy:</span>
                      <span className="info-value">Assign a dedicated 'Finisher' in 2v2 tournaments for consistency.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tournament Quick Action */}
              <div className="panel slide-in dashboard-card" style={{ animationDelay: "0.2s", padding: "2.5rem" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                   <h3>Next Up</h3>
                   <Link href="/tournaments" className="text-accent no-underline hover:glow" style={{ fontSize: "0.9rem" }}>View All Brackets</Link>
                 </div>
                 <div style={{ display: "flex", gap: "1.5rem" }}>
                    <div className="tournament-app-card" style={{ flex: 1, padding: "1.5rem", background: "rgba(0,0,0,0.4)" }}>
                       <div className="card-players">8-Ball Pool</div>
                       <div className="card-title" style={{ fontSize: "1.2rem" }}>Championship Cup</div>
                       <div className="card-bottom">
                         <div className="text-green" style={{ fontSize: "0.9rem" }}>JOINING OPEN</div>
                         <button className="btn-primary" style={{ padding: "0.4rem 1rem", fontSize: "0.8rem", borderRadius: "6px" }}>ENTER</button>
                       </div>
                    </div>
                    <div className="tournament-app-card" style={{ flex: 1, padding: "1.5rem", background: "rgba(0,0,0,0.4)" }}>
                       <div className="card-players">Poker High</div>
                       <div className="card-title" style={{ fontSize: "1.2rem" }}>Deep Stack Elite</div>
                       <div className="card-bottom">
                         <div className="text-secondary" style={{ fontSize: "0.9rem" }}>STARTS IN 2H</div>
                         <button className="button-secondary" style={{ padding: "0.4rem 1rem", fontSize: "0.8rem", borderRadius: "6px" }}>NOTIFY</button>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* Right Aside: Stats & Social */}
            <div className="stack" style={{ gap: "2rem" }}>
              <div className="panel slide-in dashboard-card" style={{ animationDelay: "0.3s", padding: "2rem" }}>
                <h3 style={{ marginBottom: "1.5rem" }}>Elite Status</h3>
                <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 2rem" }}>
                  <svg style={{ transform: "rotate(-90deg)", width: "120px", height: "120px" }}>
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                    <circle cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" strokeWidth="12" strokeDasharray="339.29" strokeDashoffset="84.82" style={{ transition: "stroke-dashoffset 1s ease" }} />
                  </svg>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>LVL 12</div>
                    <div className="muted" style={{ fontSize: "0.6rem" }}>PRO PLAYER</div>
                  </div>
                </div>
                <div className="info-list" style={{ gap: "0.5rem" }}>
                  <div className="info-row" style={{ padding: "0.75rem 1rem" }}>
                    <span className="info-label">Tournament Wins</span>
                    <span className="info-value text-green">24</span>
                  </div>
                  <div className="info-row" style={{ padding: "0.75rem 1rem" }}>
                    <span className="info-label">Win Rate</span>
                    <span className="info-value">72%</span>
                  </div>
                </div>
              </div>

              <div className="panel slide-in dashboard-card" style={{ animationDelay: "0.4s", padding: "2rem" }}>
                <h3 style={{ marginBottom: "1rem" }}>Recent Earnings</h3>
                <div className="list">
                  {walletPayload.wallet.transactions.slice(0, 4).map((tx) => (
                    <div key={tx.id} style={{ padding: "0.75rem 0", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <div>
                        <div style={{ fontSize: "0.9rem" }}>{tx.type.replace('_', ' ')}</div>
                        <div className="muted" style={{ fontSize: "0.7rem" }}>{tx.referenceType}</div>
                      </div>
                      <div className={tx.type.includes('payout') ? 'text-green' : 'text-accent'} style={{ fontWeight: 600 }}>
                         {tx.type.includes('debit') ? '-' : '+'}{formatMoney(tx.amount)}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/wallet" className="button-secondary btn-block" style={{ marginTop: "1.5rem", fontSize: "0.85rem", textAlign: "center" }}>Full Transaction History</Link>
              </div>
            </div>

          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
          @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .interactive-hover { transition: all 0.3s ease; }
          .interactive-hover:hover { 
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.5), 0 0 15px rgba(139, 92, 246, 0.2); 
            border-color: var(--accent);
          }
          .interactive-scale { transition: transform 0.2s ease; cursor: pointer; }
          .interactive-scale:hover { transform: scale(1.05); }
          .no-underline { text-decoration: none; }
          .hover\\:glow:hover { text-shadow: 0 0 10px var(--accent-light); }
        `}} />
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
