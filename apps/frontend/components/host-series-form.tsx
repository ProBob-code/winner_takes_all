"use client";

/**
 * Set up a season once, and every week is cut from these settings.
 *
 * Deliberately the same fields as hosting a one-off tournament, plus the three
 * that only a season needs: how often it runs, when the first week opens, and
 * whether latecomers may enter.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

/** A datetime-local value for the next whole hour, in the viewer's own zone. */
function defaultFirstEvent() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.5rem",
  color: "var(--text-secondary)",
  fontWeight: 500,
};

// Matched to the one-off host form, whose inputs are styled inline because the
// premium input class lives in a stylesheet only the arena imports.
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "1rem",
  borderRadius: "0.5rem",
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border-color)",
  color: "var(--text-primary)",
  outline: "none",
};

export default function HostSeriesForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    entryFee: 0,
    maxPlayers: 8,
    teamSize: 1,
    tournamentType: "online",
    sport: "8BALL",
    bracketType: "single_elimination",
    rosterMode: "open",
    cadenceDays: 7,
    firstEventAt: defaultFirstEvent(),
    password: "",
  });
  const [isPrivate, setIsPrivate] = useState(false);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/series/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          // The picker is in local time; the API stores UTC.
          firstEventAt: new Date(form.firstEventAt).toISOString(),
          password: isPrivate ? form.password : null,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Could not create the series");
      router.push(`/series/${data.series.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="panel page-card slide-in"
      style={{ maxWidth: "680px", margin: "0 auto", padding: "3rem", borderRadius: "1.5rem" }}
    >
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <h2 className="glow-text" style={{ fontSize: "2.2rem", marginBottom: "0.5rem" }}>
          📅 Host a Series
        </h2>
        <p className="muted">
          One tournament a week, and a season table that adds every week together.
        </p>
      </div>

      {error && (
        <div
          className="panel p-4 slide-in"
          style={{ marginBottom: "1.5rem", borderColor: "var(--red-subtle)", background: "rgba(239, 68, 68, 0.1)" }}
        >
          <p className="text-red" style={{ textAlign: "center" }}>{error}</p>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="name" style={labelStyle}>Series Name</label>
        <input
          id="name"
          className="form-control"
          style={inputStyle}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Monday Night League"
          required
          minLength={2}
          maxLength={80}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div>
          <label htmlFor="entryFee" style={labelStyle}>Entry Fee, per week (₹)</label>
          <input
            id="entryFee"
            type="number"
            min={0}
            className="form-control"
            style={inputStyle}
            value={form.entryFee}
            onChange={(e) => set({ entryFee: Number(e.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="maxPlayers" style={labelStyle}>Max Players, per week</label>
          <select
            id="maxPlayers"
            className="form-control"
            style={inputStyle}
            value={form.maxPlayers}
            onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
          >
            {[2, 4, 8, 16, 32, 64].map((n) => (
              <option key={n} value={n}>{n} players</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div>
          <label htmlFor="sport" style={labelStyle}>Sport</label>
          <select
            id="sport"
            className="form-control"
            style={inputStyle}
            value={form.sport}
            onChange={(e) => set({ sport: e.target.value })}
          >
            <option value="8BALL">🎱 8-Ball Pool</option>
            <option value="FOOTBALL">⚽ Football</option>
          </select>
        </div>
        <div>
          <label htmlFor="tournamentType" style={labelStyle}>Played</label>
          <select
            id="tournamentType"
            className="form-control"
            style={inputStyle}
            value={form.tournamentType}
            onChange={(e) => set({ tournamentType: e.target.value })}
          >
            <option value="online">💻 Online</option>
            <option value="offline">📍 Offline, in person</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div>
          <label htmlFor="bracketType" style={labelStyle}>Bracket Format</label>
          <select
            id="bracketType"
            className="form-control"
            style={inputStyle}
            value={form.bracketType}
            onChange={(e) => set({ bracketType: e.target.value })}
          >
            <option value="single_elimination">Single Elimination</option>
            <option value="double_elimination">Double Elimination</option>
            <option value="round_robin">Round Robin</option>
            <option value="group_knockout">Group + Knockout</option>
          </select>
        </div>
        <div>
          <label htmlFor="teamSize" style={labelStyle}>Team Size</label>
          <select
            id="teamSize"
            className="form-control"
            style={inputStyle}
            value={form.teamSize}
            onChange={(e) => set({ teamSize: Number(e.target.value) })}
          >
            <option value={1}>Solo</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
              <option key={n} value={n}>{n} a side</option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          padding: "1.5rem",
          borderRadius: "14px",
          marginBottom: "1.5rem",
          background: "rgba(245,158,11,0.05)",
          border: "1px solid rgba(245,158,11,0.2)",
        }}
      >
        <h3 className="section-heading" style={{ marginTop: 0 }}>The schedule</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <div>
            <label htmlFor="firstEventAt" style={labelStyle}>First week opens</label>
            <input
              id="firstEventAt"
              type="datetime-local"
              className="form-control"
              style={inputStyle}
              value={form.firstEventAt}
              onChange={(e) => set({ firstEventAt: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor="cadenceDays" style={labelStyle}>Repeats every</label>
            <select
              id="cadenceDays"
              className="form-control"
              style={inputStyle}
              value={form.cadenceDays}
              onChange={(e) => set({ cadenceDays: Number(e.target.value) })}
            >
              <option value={7}>Week</option>
              <option value={14}>2 weeks</option>
              <option value={1}>Day</option>
              <option value={30}>30 days</option>
            </select>
          </div>
        </div>

        <p className="muted" style={{ fontSize: "0.78rem", marginTop: "1rem", marginBottom: 0 }}>
          Each week opens on its own once its date passes. You can also open the next one early
          from the series page at any time.
        </p>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="rosterMode" style={labelStyle}>Who can enter a week</label>
        <select
          id="rosterMode"
          className="form-control"
          style={inputStyle}
          value={form.rosterMode}
          onChange={(e) => set({ rosterMode: e.target.value })}
        >
          <option value="open">Open — anyone can enter any week</option>
          <option value="locked">Locked — only players who joined the series</option>
        </select>
        <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.6rem" }}>
          Either way, players enter each week themselves and pay that week&apos;s fee when they do.
          A season never charges anyone in the background.
        </p>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          <span>Private series — a password is needed to join</span>
        </label>
        {isPrivate && (
          <input
            type="password"
            className="form-control"
            style={{ ...inputStyle, marginTop: "0.8rem" }}
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder="Series password"
            maxLength={64}
            required
          />
        )}
      </div>

      <button type="submit" className="button button-gold" style={{ width: "100%" }} disabled={loading}>
        {loading ? "CREATING…" : "CREATE SERIES"}
      </button>
    </form>
  );
}
