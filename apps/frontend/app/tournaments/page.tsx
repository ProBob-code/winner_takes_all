"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-config";

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
        const tourRes = await fetch(`${apiUrl}/api/tournaments`, { credentials: "include" });
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
            <h1>Tournaments</h1>
            <p className="muted">Join active lobbies and claim the prize pool.</p>
          </div>
          <div className="header-actions">
            <Link href={isLoggedIn ? "/tournaments/create" : "/login"} className="button button-gold">
              + Host Tournament
            </Link>
          </div>
        </div>

        {!isLoggedIn && (
          <div className="guest-banner slide-in mb-6" style={{
            background: "var(--accent-subtle)",
            border: "1px solid var(--border-glow)",
            borderRadius: "16px",
            padding: "1rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            color: "var(--text-primary)"
          }}>
            <span style={{ fontSize: "1.5rem" }}>🔒</span>
            <div>
              <strong style={{ display: "block" }}>Login Required</strong>
              <span className="muted text-sm">Please log in to view details or join tournaments.</span>
            </div>
            <Link href="/login" className="button button-sm ml-auto" style={{ background: "var(--accent)", color: "white" }}>
              Log In
            </Link>
          </div>
        )}

        <div className="tournament-grid mt-6">
          {tournaments.map((t: any) => {
            const statusClass = `tournament-status status-${t.status}`;
            const isFree = parseFloat(t.entryFee.amount) === 0;

            return (
              <Link 
                key={t.id} 
                href={isLoggedIn ? `/tournaments/${t.id}` : "/login"} 
                className={`tournament-app-card slide-in ${!isLoggedIn ? 'guest-mode' : ''}`}
              >
                <div className="card-top">
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span className={statusClass}>{t.status.replace("_", " ")}</span>
                    {t.isPrivate && (
                      <span style={{ 
                        background: "var(--red-subtle)", 
                        color: "var(--red-light)", 
                        fontSize: "0.65rem", 
                        padding: "2px 6px", 
                        borderRadius: "4px",
                        fontWeight: "800",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em"
                      }}>
                        🔒 Private
                      </span>
                    )}
                  </div>
                  <span className="card-players">
                    <span className="icon">👥</span> {t.joinedPlayers}/{t.maxPlayers}
                  </span>
                </div>
                <h3 className="card-title glow-text">{t.name}</h3>
                <div className="card-bottom">
                  <div className="card-fee">
                    <span className="muted text-xs">ENTRY FEE</span>
                    <strong className={isFree ? "text-green" : "text-accent"}>
                      {isFree ? "FREE" : `₹${t.entryFee.amount}`}
                    </strong>
                  </div>
                  <div className="card-action">
                    <span className="join-arrow">{isLoggedIn ? "→" : "🔒"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {tournaments.length === 0 && (
          <div className="empty-state slide-in">
            <div className="empty-icon">🎮</div>
            <h3>No tournaments found</h3>
            <p className="muted" style={{ maxWidth: 400, margin: "auto" }}>No active tournaments are running right now. Why not host your own and invite friends?</p>
            <Link href="/tournaments/create" className="button button-secondary" style={{ marginTop: "1.5rem" }}>
              Host First Tournament
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
