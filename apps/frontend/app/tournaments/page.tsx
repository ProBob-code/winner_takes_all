"use client";

export const dynamic = "force-dynamic";

import { sportInfo } from "@/lib/sports";
import Link from "next/link";
import { formatCoins } from "@/lib/format";
import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-config";
import { QuickTournament } from "@/components/quick-tournament";
import { CoinMark } from "@/components/coin-mark";

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

  // The SERIES tab leaves this page, so the switcher on /series links back
  // with ?tab=quick to land on the tab the visitor was last looking at.
  const [activeTab, setActiveTab] = useState<'arena' | 'quick'>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "quick"
      ? 'quick'
      : 'arena',
  );

  // A finished tournament has had its pot paid out and takes no more entries,
  // so it moves out of the live listing and into the record below it.
  // Tournaments finished before prizes were paid out carry an upper-case
  // status, so this is matched either way.
  const isFinished = (t: any) => String(t.status || "").toLowerCase() === "completed";
  const live = tournaments.filter((t: any) => !isFinished(t));
  // Newest night first: the record reads like a results page, not an archive.
  const finishedAt = (t: any) => Date.parse(t.completedAt || t.result?.decidedAt || "") || 0;
  const past = tournaments.filter(isFinished).sort((a: any, b: any) => finishedAt(b) - finishedAt(a));

  const prizeOf = (t: any) => Number(t.result?.prize?.amount ?? t.prizePool?.amount ?? 0);
  const paidOut = past.reduce((sum: number, t: any) => sum + prizeOf(t), 0);
  const champions = new Set(
    past.flatMap((t: any) => (t.result?.winners || []).map((w: any) => w.userId || w.name)),
  ).size;

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <h1 className="sr-only">Tournaments</h1>
          <div className="empty-state slide-in">
            <div className="empty-icon loading-spin" aria-hidden="true">🎮</div>
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
            <p className="muted">Pool, football, tennis, badminton, pickleball and table tennis nights, run by the people whose tables and courts they are.</p>
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
              <Link href="/series" className="tab-btn">
                SERIES
              </Link>
            </div>
            {activeTab === 'arena' && (
              <Link href={isLoggedIn ? "/tournaments/create" : "/login"} className="host-cta">
                <span className="host-cta-plus" aria-hidden="true">+</span>
                <span className="host-cta-text">
                  <span className="host-cta-label">Host Arena</span>
                  <span className="host-cta-sub">Run your own night</span>
                </span>
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
                                style={{ background: "rgba(59,130,246,0.12)", color: "var(--team-blue)" }}
                              >
                                {`${sportInfo(t.sport).icon} ${sportInfo(t.sport).label.toUpperCase()}`}
                              </span>
                              <span
                                className="status-badge"
                                style={
                                  t.tournamentType === "offline"
                                    ? { background: "rgba(245,158,11,0.12)", color: "var(--gold)" }
                                    : { background: "rgba(16,185,129,0.12)", color: "var(--gold)" }
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
                                {/* Every tournament is free; a legacy fee is
                                    shown as what it is rather than in money. */}
                                {isFree ? "FREE" : "ARCHIVED"}
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

            {/* PAST MATCHES — finished tournaments, with who took the night.
                The newest sits on the gold card; the rest read as a results
                list under it. */}
            {past.length > 0 && (
              <section className="arena-section slide-in" style={{ marginTop: "3.5rem" }}>
                <div className="section-header">
                  <h2 className="section-title">Hall of Champions</h2>
                  <div className="section-line"></div>
                </div>

                <div className="hall-stats">
                  <div className="hall-stat">
                    <span className="hall-stat-value">{past.length}</span>
                    <span className="hall-stat-label">{past.length === 1 ? "Night played" : "Nights played"}</span>
                  </div>
                  <div className="hall-stat">
                    <span className="hall-stat-value">{champions}</span>
                    <span className="hall-stat-label">{champions === 1 ? "Champion crowned" : "Champions crowned"}</span>
                  </div>
                  <div className="hall-stat">
                    <span className="hall-stat-value">
                      <CoinMark size={22} />
                      {formatCoins(paidOut)}
                    </span>
                    <span className="hall-stat-label">Coins won</span>
                  </div>
                </div>

                <div className="past-list">
                  {past.map((t: any, i: number) => {
                    const winners: any[] = t.result?.winners || [];
                    const splitWays = t.result?.splitWays ?? 1;
                    const shared = splitWays > 1;
                    const prize = prizeOf(t);
                    const pot = Number(t.result?.pot?.amount ?? 0);
                    const when = finishedAt(t) ? new Date(finishedAt(t)) : null;
                    const sport = sportInfo(t.sport);
                    const decidedBy =
                      t.result?.decidedBy === "STANDINGS" ? "Top of the table"
                      : t.result?.decidedBy === "FINAL" ? "Won the final"
                      : null;

                    return (
                      <Link
                        key={t.id}
                        href={isLoggedIn ? `/tournaments/${t.id}` : "/login"}
                        className={`past-card ${i === 0 ? "is-latest" : ""}`}
                      >
                        <div className="past-date" aria-label={when ? when.toDateString() : "Date unknown"}>
                          <span className="past-date-day">{when ? when.getDate() : "—"}</span>
                          <span className="past-date-month">
                            {when ? when.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : ""}
                          </span>
                        </div>

                        <div className="past-main">
                          <div className="past-head">
                            {i === 0 && <span className="past-chip latest">LATEST</span>}
                            <span className="past-chip">{`${sport.icon} ${sport.label.toUpperCase()}`}</span>
                            <span className="past-chip">{t.tournamentType === "offline" ? "📍 OFFLINE" : "💻 ONLINE"}</span>
                            <span className="past-chip">{t.joinedPlayers} PLAYED</span>
                          </div>
                          <h3 className="past-title">{t.name}</h3>
                          {winners.length > 0 ? (
                            <div className="past-winner">
                              <span className="past-crown" aria-hidden="true">👑</span>
                              <span className="past-winner-name">{winners.map((w) => w.name).join(" & ")}</span>
                              <span className="past-winner-how">
                                {shared ? `shared the title ${splitWays} ways` : decidedBy ?? "took the night"}
                              </span>
                            </div>
                          ) : (
                            <div className="past-winner muted">Finished. Prize not settled yet.</div>
                          )}
                        </div>

                        <div className="past-prize">
                          <span className="past-prize-label">{shared ? "EACH WON" : "WON"}</span>
                          {prize > 0 ? (
                            <span className="past-prize-value">
                              <CoinMark size={24} />
                              {formatCoins(prize)}
                            </span>
                          ) : (
                            <span className="past-prize-value glory">Glory</span>
                          )}
                          {pot > prize && <span className="past-prize-split">of a {formatCoins(pot)} pot</span>}
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
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        /* SERIES is a <Link>, and styled-jsx does not scope custom
           components, so the tab rules are written as :global() from the
           switcher down -- otherwise only the plain <button> tabs get them. */
        .tab-switcher-v2 :global(.tab-btn) {
          display: inline-flex;
          align-items: center;
          padding: 0.6rem 1.5rem;
          background: none;
          border: none;
          border-radius: 12px;
          font-family: inherit;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 1px;
          line-height: 1;
          white-space: nowrap;
          text-decoration: none;
          cursor: pointer;
          color: var(--text-muted);
          transition: all 0.3s ease;
        }
        .tab-switcher-v2 :global(.tab-btn:hover) {
          color: var(--text-primary);
          text-shadow: none;
        }
        .tab-switcher-v2 :global(.tab-btn.active) {
          background: var(--gradient-primary);
          color: white;
          box-shadow: 0 4px 15px color-mix(in oklab, var(--accent) 30%, transparent);
        }

        .guest-banner-v2 {
          background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 10%, transparent), rgba(6, 182, 212, 0.1));
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
        .status-badge.OPEN { background: rgba(16, 185, 129, 0.1); color: var(--gold); border: 1px solid rgba(16, 185, 129, 0.2); }
        .status-badge.IN_PROGRESS { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }

        .tournament-title { font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .tournament-type { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); letter-spacing: 1px; }

        .card-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2rem; }
        .entry-info .label { display: block; font-size: 0.6rem; font-weight: 900; color: var(--text-muted); margin-bottom: 2px; }
        .entry-info .value { font-size: 1.1rem; font-weight: 900; }
        .entry-info .value.free { color: var(--gold); }
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

        /* Host Arena: the page's one call to action, cut like the cards below
           it -- gold sticker, red ink, hard shadow -- and never allowed to
           wrap, which is what used to fold it into a round blob. */
        .header-actions :global(.host-cta) {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
          white-space: nowrap;
          padding: 0.6rem 1.25rem 0.6rem 0.6rem;
          border-radius: 16px;
          background: var(--gradient-fill);
          color: var(--on-gold);
          border: 2px solid var(--on-gold);
          box-shadow: 4px 4px 0 var(--on-gold);
          text-decoration: none;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .header-actions :global(.host-cta:hover) { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--on-gold); color: var(--on-gold); }
        .header-actions :global(.host-cta:active) { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--on-gold); }
        .header-actions :global(.host-cta:focus-visible) { outline: 3px solid var(--text-primary); outline-offset: 3px; }
        .host-cta-plus {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 11px;
          background: var(--on-gold);
          color: var(--gold-fill);
          font-size: 1.5rem;
          font-weight: 900;
          line-height: 1;
          transition: transform 0.25s ease;
        }
        .header-actions :global(.host-cta:hover) .host-cta-plus { transform: rotate(90deg); }
        .host-cta-text { display: flex; flex-direction: column; line-height: 1.1; }
        .host-cta-label { font-size: 0.95rem; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase; }
        .host-cta-sub { font-size: 0.68rem; font-weight: 700; opacity: 0.8; }

        /* Hall of Champions: a record, so it reads as a results list rather
           than an offer. The global card rules give each row its sticker. */
        .hall-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin-bottom: 1.75rem;
        }
        .hall-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 1rem 1.25rem;
          border-radius: 16px;
          border: 2px dashed var(--glass-border-color);
        }
        .hall-stat-value {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 1.6rem;
          font-weight: 900;
          line-height: 1;
          color: var(--gold);
          font-variant-numeric: tabular-nums;
        }
        .hall-stat-label { font-size: 0.65rem; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); }

        .past-list { display: flex; flex-direction: column; gap: 16px; }
        .past-list :global(.past-card) {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 1.5rem;
          padding: 1.25rem 1.5rem;
          text-decoration: none;
          color: inherit;
        }
        .past-date {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 68px;
          border-radius: 14px;
          border: 2px solid var(--glass-border-color);
          background: var(--glass-bg-hover);
        }
        .past-date-day { font-size: 1.6rem; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
        .past-date-month { font-size: 0.62rem; font-weight: 900; letter-spacing: 1.5px; color: var(--wta-red); margin-top: 3px; }

        .past-main { min-width: 0; }
        .past-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .past-chip {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 1px;
          padding: 3px 8px;
          border-radius: 7px;
          background: var(--glass-bg-hover);
          color: var(--text-muted);
        }
        .past-chip.latest { background: var(--wta-red); color: #fff; }
        .past-title { font-size: 0.85rem; font-weight: 800; margin: 0 0 4px; color: var(--text-secondary); overflow-wrap: anywhere; }
        .past-winner { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; font-size: 0.85rem; color: var(--text-secondary); }
        .past-crown { font-size: 1.15rem; align-self: center; }
        .past-winner-name { font-size: 1.4rem; font-weight: 900; line-height: 1.1; color: var(--text-primary); overflow-wrap: anywhere; }
        .past-winner-how { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); }

        .past-prize { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; white-space: nowrap; }
        .past-prize-label { font-size: 0.58rem; font-weight: 900; letter-spacing: 1.5px; color: var(--text-muted); }
        .past-prize-value {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 1.6rem;
          font-weight: 900;
          line-height: 1;
          color: var(--gold);
          font-variant-numeric: tabular-nums;
        }
        .past-prize-value.glory { font-size: 1.1rem; letter-spacing: 1px; text-transform: uppercase; color: var(--text-secondary); }
        .past-prize-split { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); }

        /* The latest night is the gold card, inked in red like the CTA. */
        .past-list :global(.past-card.is-latest) {
          background: var(--gradient-fill);
          color: var(--on-gold);
          border-color: var(--on-gold);
          box-shadow: 7px 7px 0 var(--on-gold);
          padding-top: 1.6rem;
          padding-bottom: 1.6rem;
        }
        .past-list :global(.past-card.is-latest:hover) { border-color: var(--on-gold); box-shadow: 11px 11px 0 var(--on-gold); }
        .past-list :global(.past-card.is-latest::before) { display: none; }
        .past-list :global(.past-card.is-latest) .past-date { border-color: var(--on-gold); background: var(--on-gold); color: var(--gold-fill); }
        .past-list :global(.past-card.is-latest) .past-date-month { color: var(--gold-fill); }
        .past-list :global(.past-card.is-latest) .past-chip { background: color-mix(in oklab, var(--on-gold) 14%, transparent); color: var(--on-gold); }
        .past-list :global(.past-card.is-latest) .past-chip.latest { background: var(--on-gold); color: var(--gold-fill); }
        .past-list :global(.past-card.is-latest) .past-title,
        .past-list :global(.past-card.is-latest) .past-winner,
        .past-list :global(.past-card.is-latest) .past-winner-how,
        .past-list :global(.past-card.is-latest) .past-prize-label,
        .past-list :global(.past-card.is-latest) .past-prize-split,
        .past-list :global(.past-card.is-latest) .past-prize-value { color: var(--on-gold); }
        .past-list :global(.past-card.is-latest) .past-winner-name { font-size: 1.9rem; color: var(--on-gold); }

        @media (max-width: 640px) {
          .hall-stats { gap: 0.5rem; }
          .hall-stat { padding: 0.75rem; }
          .hall-stat-value { font-size: 1.2rem; }
          .hall-stat-label { font-size: 0.55rem; letter-spacing: 1px; }
          .past-list :global(.past-card) { grid-template-columns: auto minmax(0, 1fr); gap: 1rem; padding: 1.1rem; }
          .past-date { width: 52px; height: 56px; }
          .past-date-day { font-size: 1.3rem; }
          .past-prize { grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; }
          .past-winner-name, .past-list :global(.past-card.is-latest) .past-winner-name { font-size: 1.25rem; }
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
          .header-actions :global(.host-cta) { width: 100%; justify-content: center; }
        }
      `}</style>
    </main>
  );
}
