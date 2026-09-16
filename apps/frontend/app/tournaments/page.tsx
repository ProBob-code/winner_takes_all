"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-config";
import { QuickTournament } from "@/components/quick-tournament";

type TournamentsResponse = {
  ok: boolean;
  tournaments: Array<{
    id: string;
    name: string;
    entryFee: { amount: string; currency: string };
    maxPlayers: number;
    joinedPlayers: number;
    status: string;
    isPrivate: boolean;
  }>;
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = !!user;

  useEffect(() => {
    const fetchData = async () => {
      if (typeof window === "undefined") return;
      try {
        setLoading(true);
        const apiUrl = getApiUrl();
        // Fetch user profile
        try {
          const userRes = await fetch(`${apiUrl}/api/user/profile`, { credentials: "include" });
          const userData = await userRes.json();
          if (userData.user) setUser(userData.user);
        } catch { /* not logged in */ }

        // Fetch tournaments
        const finalApiUrl = process.env.NEXT_PUBLIC_API_URL || apiUrl;
        const tourRes = await fetch(`${finalApiUrl}/api/tournaments`, { 
          cache: "no-store",
          credentials: "include" 
        });
        const tourData = await tourRes.json();
        setTournaments(tourData.tournaments || []);
      } catch (err: any) {
        console.error("Tournament fetch error:", err);
        setError(err.message || "Failed to connect to API");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const [activeTab, setActiveTab] = useState<'arena' | 'quick'>('arena');

  // A finished tournament has had its pot paid out and takes no more entries,
  // so it moves out of the live listing and into the record below it.
  // Tournaments finished before prizes were paid out carry an upper-case
  // status, so this is matched either way.
  const isFinished = (t: any) => String(t.status || "").toLowerCase() === "completed";
  const live = tournaments.filter((t: any) => !isFinished(t));
  const past = tournaments.filter(isFinished);

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <div className="empty-state slide-in">
            <div className="empty-icon loading-spin">🎮</div>
            <h3>Loading tournaments...</h3>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <div className="shell">
          <div className="app-header">
            <div className="header-info">
              <h1>Tournaments</h1>
            </div>
          </div>
          <div className="panel p-6 mt-6" style={{ borderColor: "var(--red-subtle)", background: "rgba(239, 68, 68, 0.05)" }}>
            <h3 className="text-red">Connection Error</h3>
            <p className="muted mt-2">Could not load tournaments. The API might be offline. Error: {error}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="app-header slide-in">
          <div className="header-info">
            <h1 className="glow-text">The Arena</h1>
            <p className="muted">Professional esports tournaments managed by elite organizers.</p>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div className="tab-switcher-v2">
              <button 
                className={`tab-btn ${activeTab === 'arena' ? 'active' : ''}`}
                onClick={() => setActiveTab('arena')}
              >
                ARENA
              </button>
              <button 
                className={`tab-btn ${activeTab === 'quick' ? 'active' : ''}`}
                onClick={() => setActiveTab('quick')}
              >
                QUICK
              </button>
              {/* A series lists seasons rather than tournaments, so it is its
                  own section rather than a tab of this one. */}
              <Link href="/series" className="tab-btn" style={{ textDecoration: "none" }}>
                SERIES
              </Link>
            </div>
            {activeTab === 'arena' && (
              <Link href={isLoggedIn ? "/tournaments/create" : "/login"} className="button button-gold btn-glow">
                + Host Arena
              </Link>
            )}
          </div>
        </div>

        {activeTab === 'arena' ? (
          <>
            {!isLoggedIn && (
              <div className="guest-banner-v2 slide-in mb-8">
                <div className="banner-content">
                  <div className="banner-icon">⚔️</div>
                  <div>
                    <h3>Organizer Verification Required</h3>
                    <p className="muted">Secure your account to participate in professional tournament brackets.</p>
                  </div>
                </div>
                <Link href="/login" className="button button-gold">Access Arena</Link>
              </div>
            )}

            {live.length > 0 && (
              <section className="arena-section slide-in">
                <div className="section-header">
                  <h2 className="section-title">Verified Competitions</h2>
                  <div className="section-line"></div>
                </div>
                <div className="tournament-grid">
                  {live.map((t: any) => {
                    const statusClass = `status-badge ${t.status}`;
                    const isFree = parseFloat(t.entryFee.amount) === 0;

                    return (
                      <Link 
                        key={t.id} 
                        href={isLoggedIn ? `/tournaments/${t.id}` : "/login"} 
                        className={`premium-card ${!isLoggedIn ? 'locked' : ''}`}
                      >
                        <div className="card-glass"></div>
                        <div className="card-content">
                          <div className="card-header">
                            <span className={statusClass}>{t.status.toUpperCase()}</span>
                            <span className="player-count">
                              <span className="icon">👤</span> {t.joinedPlayers}/{t.maxPlayers}
                            </span>
                          </div>
                          
                          <div className="card-body">
                            <h3 className="tournament-title">{t.name}</h3>
                            <div className="tournament-type">
                              {t.isPrivate ? "🔒 PRIVATE ROOM" : "🌐 OPEN ARENA"}
                            </div>
                            {/* Whether you have to turn up in person decides
                                whether you can enter at all, so it belongs on
                                the card and not two pages deep. */}
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                              <span
                                className="status-badge"
                                style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}
                              >
                                {t.sport === "FOOTBALL" ? "⚽ FOOTBALL" : "🎱 8-BALL"}
                              </span>
                              <span
                                className="status-badge"
                                style={
                                  t.tournamentType === "offline"
                                    ? { background: "rgba(245,158,11,0.12)", color: "var(--gold)" }
                                    : { background: "rgba(16,185,129,0.12)", color: "#10b981" }
                                }
                              >
                                {t.tournamentType === "offline" ? "📍 OFFLINE" : "💻 ONLINE"}
                              </span>
                            </div>
                          </div>

                          <div className="card-footer">
                            <div className="entry-info">
                              <span className="label">PARTICIPATION FEE</span>
                              <span className={`value ${isFree ? 'free' : 'paid'}`}>
                                {isFree ? "FREE" : `₹${t.entryFee.amount}`}
                              </span>
                            </div>
                            <div className="action-circle">
                              {isLoggedIn ? "→" : "🔒"}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {live.length === 0 && (
              <div className="empty-state slide-in">
                <div className="empty-icon-large">🏆</div>
                <h3>The Arena is Quiet</h3>
                <p className="muted">No active tournament brackets found. Create your own community event now.</p>
                <Link href="/tournaments/create" className="button button-gold mt-6">INITIALIZE EVENT</Link>
              </div>
            )}

            {/* PAST MATCHES — finished tournaments, with who took the pot. */}
            {past.length > 0 && (
              <section className="arena-section slide-in" style={{ marginTop: "3rem" }}>
                <div className="section-header">
                  <h2 className="section-title">Past Matches</h2>
                  <div className="section-line"></div>
                </div>
                <div className="past-list">
                  {past.map((t: any) => {
                    const winners: any[] = t.result?.winners || [];
                    const shared = (t.result?.splitWays ?? 1) > 1;
                    return (
                      <Link
                        key={t.id}
                        href={isLoggedIn ? `/tournaments/${t.id}` : "/login"}
                        className="past-card"
                      >
                        <div className="past-main">
                          <div className="past-head">
                            <span className="status-badge completed">COMPLETED</span>
                            <span className="past-meta">
                              {t.sport === "FOOTBALL" ? "⚽ FOOTBALL" : "🎱 8-BALL"} · {t.joinedPlayers} played
                              {t.completedAt ? ` · ${new Date(t.completedAt).toLocaleDateString()}` : ""}
                            </span>
                          </div>
                          <h3 className="past-title">{t.name}</h3>
                          <div className="past-winner">
                            {winners.length > 0 ? (
                              <>
                                🏆 <strong>{winners.map((w) => w.name).join(" & ")}</strong>
                                {shared ? ` shared the pot ${t.result.splitWays} ways` : " took the pot"}
                              </>
                            ) : (
                              <span className="muted">Finished — prize not settled yet</span>
                            )}
                          </div>
                        </div>
                        <div className="past-prize">
                          <span className="past-prize-label">PRIZE POT</span>
                          <span className="past-prize-value">
                            ₹{Number(t.result?.prize?.amount ?? t.prizePool?.amount ?? 0).toLocaleString("en-IN")}
                          </span>
                          {shared && <span className="past-prize-split">split {t.result.splitWays} ways</span>}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="slide-in">
            <QuickTournament />
          </div>
        )}
      </div>

      <style jsx>{`
        .tab-switcher-v2 {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .tab-btn {
          padding: 0.6rem 1.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 1px;
          color: var(--text-muted);
          transition: all 0.3s ease;
        }
        .tab-btn.active {
          background: var(--gradient-primary);
          color: white;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }

        .guest-banner-v2 {
          background: linear-gradient(90deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.1));
          border: 1px solid var(--border-glow);
          border-radius: 24px;
          padding: 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
        }
        .banner-content { display: flex; gap: 1.5rem; align-items: center; }
        .banner-icon { font-size: 2.5rem; filter: drop-shadow(0 0 10px var(--accent)); }

        .section-header { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; }
        .section-title { font-size: 0.9rem; font-weight: 900; letter-spacing: 2px; color: var(--gold); text-transform: uppercase; white-space: nowrap; }
        .section-line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--gold-subtle), transparent); }

        .premium-card {
          position: relative;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
          color: inherit;
        }
        .premium-card:hover {
          transform: translateY(-10px) scale(1.02);
          border-color: var(--gold-subtle);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(255, 183, 0, 0.1);
        }
        .card-content { padding: 1.5rem; position: relative; z-index: 2; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        
        .status-badge {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 1px;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(255,255,255,0.05);
        }
        .status-badge.OPEN { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
        .status-badge.IN_PROGRESS { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }

        .tournament-title { font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .tournament-type { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); letter-spacing: 1px; }

        .card-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2rem; }
        .entry-info .label { display: block; font-size: 0.6rem; font-weight: 900; color: var(--text-muted); margin-bottom: 2px; }
        .entry-info .value { font-size: 1.1rem; font-weight: 900; }
        .entry-info .value.free { color: #10b981; }
        .entry-info .value.paid { color: var(--gold); }

        .action-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          transition: all 0.3s ease;
        }
        .premium-card:hover .action-circle {
          background: var(--gold);
          color: black;
          transform: rotate(-45deg);
        }

        .empty-icon-large { font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3; }

        /* Past matches: a record, so it reads as a list rather than an offer. */
        .past-list { display: flex; flex-direction: column; gap: 12px; }
        .past-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.5rem;
          padding: 1.25rem 1.5rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          text-decoration: none;
          color: inherit;
          transition: all 0.3s ease;
        }
        .past-card:hover { background: rgba(255,255,255,0.04); border-color: var(--gold-subtle); }
        .past-main { min-width: 0; }
        .past-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
        .status-badge.completed { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }
        .past-meta { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; }
        .past-title { font-size: 1.05rem; font-weight: 800; margin: 0 0 4px; }
        .past-winner { font-size: 0.85rem; color: var(--text-secondary); }
        .past-prize { text-align: right; white-space: nowrap; }
        .past-prize-label { display: block; font-size: 0.55rem; font-weight: 900; letter-spacing: 1px; color: var(--text-muted); }
        .past-prize-value { font-size: 1.15rem; font-weight: 900; color: var(--gold); }
        .past-prize-split { display: block; font-size: 0.6rem; font-weight: 700; color: var(--text-muted); }

        @media (max-width: 640px) {
          .past-card { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
          .past-prize { text-align: left; }
        }

        @media (max-width: 768px) {
          .guest-banner-v2 { flex-direction: column; padding: 1.5rem; text-align: center; }
          .banner-content { flex-direction: column; gap: 1rem; }
          .banner-icon { font-size: 2rem; }
          .section-header { margin-bottom: 1.5rem; }
          .section-title { font-size: 0.75rem; letter-spacing: 1px; }
          .premium-card { border-radius: 16px; }
          .card-content { padding: 1.25rem; }
          .tournament-title { font-size: 1.1rem; }
          .card-footer { margin-top: 1.5rem; }
        }
      `}</style>
    </main>
  );
}
