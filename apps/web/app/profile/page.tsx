import { redirect } from "next/navigation";
export const runtime = "edge";
import { readBackendJson } from "@/lib/backend";
import { TransferForm } from "@/components/transfer-form";

type ProfileResponse = {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    walletBalance: string;
  };
};

import { backendFetch } from "@/lib/backend";

async function getProfileData() {
  try {
    const { response, payload, status } = await readBackendJson<ProfileResponse>("/user/profile");
    if (status === 401) return null;
    if (!response.ok) return null;
    return payload.user || null;
  } catch (err) {
    console.error("Profile getProfileData error:", err);
    return null;
  }
}

export default async function ProfilePage() {
  const user = await getProfileData();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="page profile-page" style={{ padding: "1rem 2rem" }}>
      <div className="shell">
        {/* Extreme Premium User Banner */}
        <div className="profile-banner slide-in" style={{
          background: "linear-gradient(145deg, rgba(30,30,40,0.9), rgba(15,15,20,0.95))",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255,255,255,0.1)",
          backdropFilter: "blur(20px)"
        }}>
          <div className="profile-avatar" style={{ transform: "scale(1.1)", border: "3px solid var(--glass-bg)", boxShadow: "0 0 20px var(--gold-light)" }}>
            {user.name ? user.name[0].toUpperCase() : "U"}
          </div>
          <div className="profile-hero-info" style={{ paddingLeft: "1rem" }}>
            <h2 className="glow-text" style={{ fontSize: "2.8rem", letterSpacing: "-1px" }}>{user.name || "Guest Player"}</h2>
            <div className="profile-badge" style={{ background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.3)", color: "var(--accent-light)", marginTop: "0.25rem", padding: "0.3rem 0.8rem", fontSize: "0.9rem" }}>
              <span style={{opacity: 0.7}}>ID:</span> {user.id}
            </div>
          </div>
          <div className="profile-balance-highlight" style={{ paddingLeft: "3rem", borderLeftColor: "rgba(255, 255, 255, 0.1)" }}>
            <span className="muted text-sm" style={{ letterSpacing: "2px", textTransform: "uppercase" }}>Wallet Balance</span>
            <div className="balance-amount" style={{ textShadow: "0 0 15px rgba(245, 158, 11, 0.5)", fontSize: "3rem" }}>
              ₹{user.walletBalance}
            </div>
          </div>
        </div>

        <div className="dashboard-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
          {/* Transfer Card */}
          <div className="panel slide-in dashboard-card p-6" style={{ animationDelay: "0.1s", background: "var(--bg-surface)", border: "1px solid var(--glass-border-color)", padding: "2.5rem" }}>
            <div className="card-header" style={{ marginBottom: "2rem" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "1.5rem" }}>
                <span style={{ padding: "0.5rem", background: "rgba(255,255,255,0.05)", borderRadius: "50%" }}>💸</span> Peer-to-Peer Transfer
              </h3>
              <p className="muted">Send credits instantly to any other player via their User ID.</p>
            </div>
            <div className="card-body">
              <TransferForm />
            </div>
          </div>

          {/* Settings/Info Card */}
          <div className="panel slide-in dashboard-card p-6" style={{ animationDelay: "0.2s", background: "var(--bg-surface)", border: "1px solid var(--glass-border-color)", padding: "2.5rem" }}>
            <div className="card-header" style={{ marginBottom: "2rem" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "1.5rem" }}>
                <span style={{ padding: "0.5rem", background: "rgba(255,255,255,0.05)", borderRadius: "50%" }}>⚙️</span> Account Details
              </h3>
              <p className="muted">Your personal account information and status.</p>
            </div>
            <div className="card-body">
              <div className="info-list">
                <div className="info-row" style={{ padding: "1.25rem 1.5rem", background: "rgba(0,0,0,0.2)", backdropFilter: "blur(5px)" }}>
                  <span className="info-label">Email Address</span>
                  <span className="info-value">{user.email || "Not Provided"}</span>
                </div>
                <div className="info-row" style={{ padding: "1.25rem 1.5rem", background: "rgba(0,0,0,0.2)", backdropFilter: "blur(5px)" }}>
                  <span className="info-label">Account Status</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: "8px", height: "8px", background: "var(--green)", borderRadius: "50%", boxShadow: "0 0 10px var(--green)" }}></div>
                    <span className="info-value text-green">Active & Verified</span>
                  </div>
                </div>
                <div className="info-row" style={{ padding: "1.25rem 1.5rem", background: "rgba(0,0,0,0.2)", backdropFilter: "blur(5px)" }}>
                  <span className="info-label">Current Role</span>
                  <span className="info-value text-accent" style={{ background: "rgba(139, 92, 246, 0.2)", padding: "0.2rem 0.8rem", borderRadius: "1rem" }}>Player</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
