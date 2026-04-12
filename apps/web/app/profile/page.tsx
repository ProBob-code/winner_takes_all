import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

async function getProfileData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("wta_access_token")?.value;
  if (!token) return null;

  const apiUrl = process.env.WTA_API_URL || "http://127.0.0.1:4000";
  try {
    const res = await fetch(`${apiUrl}/user/profile`, {
      headers: { Cookie: `wta_access_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as ProfileResponse;
    return data.user || null;
  } catch {
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
        <div className="profile-banner slide-in">
          <div className="profile-avatar">
            {user.name ? user.name[0].toUpperCase() : "U"}
          </div>
          <div className="profile-hero-info">
            <h2 className="glow-text profile-name">{user.name || "Guest Player"}</h2>
            <div className="profile-badge">
              <span style={{opacity: 0.7}}>ID:</span> {user.id}
            </div>
          </div>
          <div className="profile-balance-highlight">
            <span className="muted text-sm balance-label">Wallet Balance</span>
            <div className="balance-amount">
              ₹{user.walletBalance}
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
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
