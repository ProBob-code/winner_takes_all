"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HostTournamentForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    entryFee: 0,
    maxPlayers: 8,
    teamSize: 1,
    tournamentType: "online",
    bracketType: "single_elimination",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tournaments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.message || "Failed to create tournament");
      }

      setSuccess(`Tournament created successfully! Tournament ID: ${data.tournament.id}`);
      setTimeout(() => {
        router.push(`/tournaments/${data.tournament.id}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel page-card slide-in" style={{ maxWidth: "680px", margin: "0 auto", padding: "3rem", borderRadius: "1.5rem", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <h2 className="glow-text" style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏆 Host a Tournament</h2>
        <p className="muted">Configure your custom competition logic and open the lobby.</p>
      </div>

      {error && <div className="panel p-4 slide-in" style={{ marginBottom: "1.5rem", borderColor: "var(--red-subtle)", background: "rgba(239, 68, 68, 0.1)" }}><p className="text-red" style={{ textAlign: "center" }}>{error}</p></div>}
      {success && <div className="panel p-4 slide-in" style={{ marginBottom: "1.5rem", borderColor: "var(--green-subtle)", background: "rgba(16, 185, 129, 0.1)" }}><p className="text-green" style={{ textAlign: "center" }}>{success}</p></div>}

      <div className="form-group" style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="name" style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-secondary)", fontWeight: 500 }}>Tournament Name</label>
        <input
          id="name"
          type="text"
          placeholder="e.g. Weekend Warriors 8-Ball"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="form-control"
          style={{ width: "100%", padding: "1rem", borderRadius: "0.5rem", background: "var(--glass-bg)", border: "1px solid var(--glass-border-color)", color: "var(--text-primary)", outline: "none", transition: "border 0.2s" }}
          onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
          onBlur={(e) => e.target.style.borderColor = "var(--glass-border-color)"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div className="form-group">
          <label htmlFor="entryFee" style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-secondary)", fontWeight: 500 }}>Entry Fee (Credits)</label>
          <input
            id="entryFee"
            type="number"
            min="0"
            required
            value={formData.entryFee}
            onChange={(e) => setFormData({ ...formData, entryFee: parseInt(e.target.value) })}
            className="form-control"
            style={{ width: "100%", padding: "1rem", borderRadius: "0.5rem", background: "var(--glass-bg)", border: "1px solid var(--glass-border-color)", color: "var(--text-primary)", outline: "none", transition: "border 0.2s" }}
            onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
            onBlur={(e) => e.target.style.borderColor = "var(--glass-border-color)"}
          />
        </div>

        <div className="form-group">
          <label htmlFor="maxPlayers" style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-secondary)", fontWeight: 500 }}>Max Players</label>
          <select
            id="maxPlayers"
            value={formData.maxPlayers}
            onChange={(e) => setFormData({ ...formData, maxPlayers: parseInt(e.target.value) })}
            className="form-control"
            style={{ width: "100%", padding: "1rem", borderRadius: "0.5rem", background: "var(--glass-bg)", border: "1px solid var(--glass-border-color)", color: "var(--text-primary)", outline: "none", cursor: "pointer" }}
          >
            <option value="2">2 Players</option>
            <option value="4">4 Players</option>
            <option value="8">8 Players</option>
            <option value="16">16 Players</option>
            <option value="32">32 Players</option>
            <option value="64">64 Players</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div className="form-group">
          <label htmlFor="teamSize" style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-secondary)", fontWeight: 500 }}>Team Size</label>
          <select
            id="teamSize"
            value={formData.teamSize}
            onChange={(e) => setFormData({ ...formData, teamSize: parseInt(e.target.value) })}
            className="form-control"
            style={{ width: "100%", padding: "1rem", borderRadius: "0.5rem", background: "var(--glass-bg)", border: "1px solid var(--glass-border-color)", color: "var(--text-primary)", outline: "none", cursor: "pointer" }}
          >
            <option value="1">1v1 (Single)</option>
            <option value="2">2v2 (Duo)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="tournamentType" style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-secondary)", fontWeight: 500 }}>Tournament Type</label>
          <select
            id="tournamentType"
            value={formData.tournamentType}
            onChange={(e) => setFormData({ ...formData, tournamentType: e.target.value })}
            className="form-control"
            style={{ width: "100%", padding: "1rem", borderRadius: "0.5rem", background: "var(--glass-bg)", border: "1px solid var(--glass-border-color)", color: "var(--text-primary)", outline: "none", cursor: "pointer" }}
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="hybrid">Online-Offline</option>
          </select>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: "2.5rem" }}>
        <label htmlFor="bracketType" style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-secondary)", fontWeight: 500 }}>Bracket Format</label>
        <select
          id="bracketType"
          value={formData.bracketType}
          onChange={(e) => setFormData({ ...formData, bracketType: e.target.value })}
          className="form-control"
          style={{ width: "100%", padding: "1rem", borderRadius: "0.5rem", background: "var(--glass-bg)", border: "1px solid var(--glass-border-color)", color: "var(--text-primary)", outline: "none", cursor: "pointer" }}
        >
          <option value="single_elimination">Single Elimination (Sudden Death)</option>
          <option value="double_elimination">Double Elimination</option>
        </select>
      </div>

      <button type="submit" disabled={loading} className="button" style={{ width: "100%", padding: "1.25rem", fontSize: "1.1rem" }}>
        {loading ? "Initializing..." : "🚀 Launch Tournament"}
      </button>

      <p className="muted" style={{ fontSize: "0.85rem", textAlign: "center", marginTop: "1.5rem" }}>
        * You will be able to share the tournament invite link once launched. Brackets are automatically generated when lobbies lock.
      </p>
    </form>
  );
}
