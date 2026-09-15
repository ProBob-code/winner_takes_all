"use client";

/**
 * A season: the running table, and every week that has been played or is open.
 *
 * The weeks themselves are ordinary tournaments, so each one links out to the
 * tournament page and its arena. Nothing about a week is special-cased here.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { readBackendJson, backendFetch } from "@/lib/backend";

interface Series {
  id: string;
  name: string;
  hostId: string;
  sport: string;
  bracketType: string;
  tournamentType: string;
  entryFee: { amount: string };
  maxPlayers: number;
  teamSize: number;
  rosterMode: string;
  cadenceDays: number;
  nextEventAt: string | null;
  weeksCreated: number;
  status: string;
  isPrivate: boolean;
}

interface Week {
  id: string;
  name: string;
  seriesWeek: number | null;
  status: string;
  joinedPlayers: number;
  maxPlayers: number;
  prizePool: { amount: string };
}

interface SeasonRow {
  userId: string | null;
  name: string;
  weeksPlayed: number;
  weeksWon: number;
  matchWins: number;
  totalScore: number;
}

interface Member {
  user_id: string;
  user_name: string;
  joined_at: string;
}

const cadenceLabel = (days: number) =>
  days === 7 ? "weekly" : days === 14 ? "fortnightly" : days === 1 ? "daily" : `every ${days} days`;

const formatWhen = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function SeriesDetailPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const id = routeParams?.id;

  const [series, setSeries] = useState<Series | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [standings, setStandings] = useState<SeasonRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id || typeof window === "undefined") return;
    try {
      const [detail, profile] = await Promise.allSettled([
        readBackendJson<any>(`/series/${id}`),
        readBackendJson<any>("/user/profile"),
      ]);

      if (detail.status === "fulfilled") {
        const p = detail.value.payload;
        setSeries(p.series);
        setWeeks(p.weeks || []);
        setStandings(p.standings || []);
        setMembers(p.members || []);
        setError(null);
      } else {
        setError(detail.reason instanceof Error ? detail.reason.message : String(detail.reason));
      }

      if (profile.status === "fulfilled" && profile.value.payload?.ok) {
        setMeId(profile.value.payload.user?.id ?? null);
      }
    } catch (err: any) {
      setError(err?.message || "Could not load this series");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (path: string, okMessage: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await backendFetch(path, { method: "POST" });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.message || "That did not work.");
      setNotice(okMessage);
      await load();
    } catch (err: any) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Deleting a season leaves its weeks behind, so there is nothing to refund
  // here and nothing to undo either.
  const deleteSeries = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await backendFetch(`/series/${id}`, { method: "DELETE" });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.message || "That did not work.");
      router.push("/series");
    } catch (err: any) {
      setNotice(err.message);
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main className="page">
        <div className="shell">
          <div
            className="glass-morphism"
            style={{ padding: "1.5rem", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <strong style={{ color: "#ef4444" }}>This series could not be loaded.</strong>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0.5rem 0 0" }}>{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!series) {
    return (
      <main className="page">
        <div className="shell"><p className="muted">Loading…</p></div>
      </main>
    );
  }

  const isHost = !!meId && meId === series.hostId;
  const isMember = !!meId && members.some((m) => m.user_id === meId);
  const isFootball = series.sport === "FOOTBALL";
  const openWeek = weeks.find((w) => w.status === "open" || w.status === "full");

  return (
    <main className="page">
      <div className="shell">
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/series" className="muted" style={{ textDecoration: "none" }}>← All series</Link>
        </div>

        {/* Header */}
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
            <span className={`status-badge ${series.status === "active" ? "open" : ""}`}>
              {series.status === "active" ? "RUNNING" : "ENDED"}
            </span>
            <span className="status-badge" style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
              {isFootball ? "⚽ FOOTBALL" : "🎱 8-BALL"}
            </span>
            <span
              className="status-badge"
              style={
                series.tournamentType === "offline"
                  ? { background: "rgba(245,158,11,0.12)", color: "var(--gold)" }
                  : { background: "rgba(16,185,129,0.12)", color: "#10b981" }
              }
            >
              {series.tournamentType === "offline" ? "📍 PLAYED OFFLINE" : "💻 PLAYED ONLINE"}
            </span>
            <span
              className="status-badge"
              style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
            >
              {series.rosterMode === "locked" ? "🔒 LOCKED ROSTER" : "OPEN ENTRY"}
            </span>
          </div>

          <h1 style={{ fontSize: "2.4rem", fontWeight: 900, margin: 0 }}>{series.name}</h1>
          <p className="muted" style={{ marginTop: "0.6rem", fontSize: "0.88rem" }}>
            Runs {cadenceLabel(series.cadenceDays)}
            {isHost && <span style={{ color: "var(--gold)", fontWeight: 800 }}> · you host this</span>}
          </p>

          <div
            style={{
              display: "grid", gap: "1px", marginTop: "1.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px", overflow: "hidden",
            }}
          >
            {[
              { label: "ENTRY, PER WEEK", value: Number(series.entryFee.amount) === 0 ? "FREE" : `₹${series.entryFee.amount}`, gold: true },
              { label: "WEEKS SO FAR", value: String(series.weeksCreated) },
              { label: "NEXT WEEK OPENS", value: series.status === "active" ? formatWhen(series.nextEventAt) : "—" },
              { label: "PLAYERS, PER WEEK", value: String(series.maxPlayers) },
              { label: "ON THE ROSTER", value: String(members.length) },
            ].map((f) => (
              <div key={f.label} style={{ padding: "0.9rem 1rem", background: "rgba(9,9,22,0.6)" }}>
                <div style={{ fontSize: "0.6rem", letterSpacing: "1px", opacity: 0.5, fontWeight: 800 }}>{f.label}</div>
                <div style={{ fontWeight: 900, marginTop: "3px", color: f.gold ? "var(--gold)" : undefined, fontSize: "0.95rem" }}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "2rem" }}>
            {openWeek && (
              <Link href={`/tournaments/${openWeek.id}`} className="button button-gold">
                GO TO WEEK {openWeek.seriesWeek ?? "?"}
              </Link>
            )}
            {meId && !isMember && series.status === "active" && !series.isPrivate && (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => post(`/series/${series.id}/join`, "You are on the roster.")}
              >
                JOIN SERIES
              </button>
            )}
            {isHost && series.status === "active" && (
              <>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => post(`/series/${series.id}/weeks`, "The next week is open.")}
                >
                  OPEN NEXT WEEK NOW
                </button>
                <button
                  className="button button-danger"
                  disabled={busy}
                  onClick={() => post(`/series/${series.id}/end`, "The season is closed.")}
                >
                  END SEASON
                </button>
              </>
            )}
            {isHost && (
              <button
                className="button button-danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Delete "${series.name}"? The weeks already played stay as ordinary tournaments; only the season and its table go. This cannot be undone.`)) return;
                  deleteSeries();
                }}
              >
                🗑️ DELETE SERIES
              </button>
            )}
          </div>

          {notice && (
            <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>{notice}</p>
          )}
        </div>

        {/* Season table */}
        <div className="glass-morphism" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
          <h2 className="section-heading">Season standings</h2>
          {standings.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.88rem", margin: 0 }}>
              The table fills in as weeks are played. A week counts as won once all its fixtures
              are finished.
            </p>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>RANK</th>
                  <th>PLAYER</th>
                  <th>WEEKS WON</th>
                  <th>PLAYED</th>
                  <th>MATCH WINS</th>
                  <th>SCORE</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => (
                  <tr key={(row.userId || row.name) + i}>
                    <td style={{ padding: "1rem" }}>#{i + 1}</td>
                    <td style={{ fontWeight: 900 }}>
                      {row.name}
                      {i === 0 && row.weeksWon > 0 && <span style={{ marginLeft: "8px" }}>👑</span>}
                      {row.userId && row.userId === meId && (
                        <span
                          style={{
                            marginLeft: "6px", padding: "2px 8px", borderRadius: "5px",
                            fontSize: "0.6rem", fontWeight: 900,
                            background: "rgba(59,130,246,0.15)", color: "#60a5fa",
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 900, color: "var(--gold)" }}>{row.weeksWon}</td>
                    <td>{row.weeksPlayed}</td>
                    <td style={{ color: "var(--accent-primary)" }}>{row.matchWins}</td>
                    <td style={{ fontWeight: 900 }}>{row.totalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Weeks */}
        <div className="glass-morphism" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
          <h2 className="section-heading">Weeks</h2>
          {weeks.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.88rem", margin: 0 }}>
              No week has opened yet. The first opens {formatWhen(series.nextEventAt)}
              {isHost ? ", or you can open it now." : "."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {weeks.map((w) => (
                <Link
                  key={w.id}
                  href={`/tournaments/${w.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    padding: "14px 16px", borderRadius: "10px", textDecoration: "none",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <span style={{ fontFamily: "monospace", opacity: 0.5, minWidth: "4.5rem" }}>
                    WEEK {String(w.seriesWeek ?? 0).padStart(2, "0")}
                  </span>
                  <span style={{ flex: 1, fontWeight: 800 }}>{w.name}</span>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {w.joinedPlayers}/{w.maxPlayers} · ₹{w.prizePool.amount}
                  </span>
                  <span className={`status-badge ${w.status}`}>{w.status.toUpperCase()}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Roster */}
        <div className="glass-morphism" style={{ padding: "1.75rem" }}>
          <h2 className="section-heading">
            Roster <span style={{ opacity: 0.6 }}>({members.length})</span>
          </h2>
          {members.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.88rem", margin: 0 }}>Nobody has joined yet.</p>
          ) : (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {members.map((m) => (
                <span
                  key={m.user_id}
                  className="status-badge"
                  style={{ background: "rgba(255,255,255,0.05)", color: "var(--text)" }}
                >
                  {m.user_name}
                  {m.user_id === series.hostId ? " · HOST" : ""}
                </span>
              ))}
            </div>
          )}
          {series.rosterMode === "locked" && (
            <p className="muted" style={{ fontSize: "0.78rem", marginTop: "1rem" }}>
              This series is locked: only players on the roster can enter a week. Each week is still
              paid for by the player when they enter it.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
