"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readBackendJson } from "@/lib/backend";

interface SeriesSummary {
  id: string;
  name: string;
  sport: string;
  tournamentType: string;
  rosterMode: string;
  cadenceDays: number;
  nextEventAt: string | null;
  weeksCreated: number;
  status: string;
  isPrivate: boolean;
  entryFee: { amount: string };
  maxPlayers: number;
}

const cadenceLabel = (days: number) =>
  days === 7 ? "Weekly" : days === 14 ? "Fortnightly" : days === 1 ? "Daily" : `Every ${days} days`;

export default function SeriesListPage() {
  const [series, setSeries] = useState<SeriesSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, profile] = await Promise.allSettled([
          readBackendJson<any>("/series"),
          readBackendJson<any>("/user/profile"),
        ]);

        if (list.status === "fulfilled") setSeries(list.value.payload?.series || []);
        else setError(list.reason instanceof Error ? list.reason.message : String(list.reason));

        if (profile.status === "fulfilled") setIsLoggedIn(!!profile.value.payload?.ok);
      } catch (err: any) {
        setError(err?.message || "Could not load series");
      }
    })();
  }, []);

  return (
    <main className="page">
      <div className="shell">
        <div className="app-header slide-in">
          <div className="header-info">
            <h1 className="glow-text">Series</h1>
            <p className="muted">Seasons that run week after week, with a table that remembers.</p>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link href="/tournaments" className="button button-secondary">One-off tournaments</Link>
            <Link href={isLoggedIn ? "/series/create" : "/login"} className="button button-gold btn-glow">
              + Host Series
            </Link>
          </div>
        </div>

        {error && (
          <div
            className="glass-morphism"
            style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <strong style={{ color: "#ef4444" }}>Series could not be loaded.</strong>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0.5rem 0 0" }}>{error}</p>
          </div>
        )}

        {series === null && !error && <p className="muted">Loading…</p>}

        {series !== null && series.length === 0 && (
          <div className="empty-state slide-in">
            <div className="empty-icon-large">📅</div>
            <h3>No seasons yet</h3>
            <p className="muted">
              A series runs one tournament a week and keeps a running table across all of them.
            </p>
            <Link href={isLoggedIn ? "/series/create" : "/login"} className="button button-gold mt-6">
              HOST A SERIES
            </Link>
          </div>
        )}

        {series !== null && series.length > 0 && (
          <div
            style={{
              display: "grid",
              gap: "1.25rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            }}
          >
            {series.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="glass-morphism"
                style={{ padding: "1.5rem", textDecoration: "none", display: "block" }}
              >
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "1rem" }}>
                  <span className={`status-badge ${s.status === "active" ? "open" : ""}`}>
                    {s.status === "active" ? "RUNNING" : "ENDED"}
                  </span>
                  <span
                    className="status-badge"
                    style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}
                  >
                    {s.sport === "FOOTBALL" ? "⚽ FOOTBALL" : "🎱 8-BALL"}
                  </span>
                  <span
                    className="status-badge"
                    style={
                      s.tournamentType === "offline"
                        ? { background: "rgba(245,158,11,0.12)", color: "var(--gold)" }
                        : { background: "rgba(16,185,129,0.12)", color: "#10b981" }
                    }
                  >
                    {s.tournamentType === "offline" ? "📍 OFFLINE" : "💻 ONLINE"}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.4rem", fontWeight: 900, margin: "0 0 0.4rem" }}>{s.name}</h3>
                <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                  {cadenceLabel(s.cadenceDays)} · {s.weeksCreated} week{s.weeksCreated === 1 ? "" : "s"} so far
                  {s.rosterMode === "locked" ? " · locked roster" : ""}
                  {s.isPrivate ? " · private" : ""}
                </p>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginTop: "1.5rem",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.6rem", letterSpacing: "1px", opacity: 0.5, fontWeight: 800 }}>
                      ENTRY, PER WEEK
                    </div>
                    <div style={{ fontWeight: 900, color: "var(--gold)" }}>
                      {Number(s.entryFee.amount) === 0 ? "FREE" : `₹${s.entryFee.amount}`}
                    </div>
                  </div>
                  <div className="action-circle">→</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
