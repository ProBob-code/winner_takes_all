"use client";

import { useState, useEffect } from "react";
import { TournamentEngine } from "@/components/tournament-engine";
import { getApiUrl } from "@/lib/api-config";

export default function EngineHostPage() {
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inputId, setInputId] = useState("");
  const apiBase = typeof window !== "undefined" ? getApiUrl() : "";

  // Check URL for tournament ID
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) setTournamentId(id);
  }, []);

  const createTournament = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/api/tournaments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: "Engine Tournament",
          maxPlayers: 16,
          bracketType: "engine",
          tournamentType: "offline",
        }),
      });
      const data = await res.json();
      if (data.ok && data.tournament?.id) {
        setTournamentId(data.tournament.id);
        // Update URL without reload
        window.history.pushState({}, "", `?id=${data.tournament.id}`);
      }
    } catch (e) {
      console.error("Failed to create tournament:", e);
    } finally {
      setCreating(false);
    }
  };

  const loadTournament = () => {
    if (inputId.trim()) {
      setTournamentId(inputId.trim());
      window.history.pushState({}, "", `?id=${inputId.trim()}`);
    }
  };

  if (!tournamentId) {
    return (
      <main className="page">
        <div className="shell">
          <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center", paddingTop: "3rem" }}>
            <h1 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: "0.5rem" }}>🏟️ Tournament Engine</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "2.5rem" }}>
              Create a new tournament or load an existing one.
            </p>

            <button
              className="btn-start-tournament"
              style={{ marginBottom: "2rem" }}
              onClick={createTournament}
              disabled={creating}
            >
              {creating ? "Creating..." : "🚀 Create New Tournament"}
            </button>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                className="team-input"
                placeholder="Enter tournament ID..."
                value={inputId}
                onChange={e => setInputId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadTournament()}
              />
              <button className="btn-add-team" onClick={loadTournament}>Load</button>
            </div>
          </div>
        </div>

        <style jsx>{`
          .btn-start-tournament {
            width: 100%;
            padding: 1.1rem;
            border-radius: 20px;
            background: linear-gradient(135deg, #d97706, #f59e0b);
            color: #000;
            font-size: 1rem;
            font-weight: 900;
            letter-spacing: 1px;
            text-transform: uppercase;
            border: none;
            cursor: pointer;
            transition: all 0.4s ease;
          }
          .btn-start-tournament:hover:not(:disabled) {
            transform: translateY(-3px);
            box-shadow: 0 8px 30px rgba(217, 119, 6, 0.4);
          }
          .btn-start-tournament:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
          .team-input {
            flex: 1;
            padding: 0.8rem 1.2rem;
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            color: var(--text-primary);
            font-size: 0.95rem;
            outline: none;
          }
          .team-input:focus {
            border-color: var(--accent);
          }
          .btn-add-team {
            padding: 0.8rem 1.5rem;
            border-radius: 12px;
            background: linear-gradient(135deg, #7c3aed, #0891b2);
            color: white;
            font-weight: 700;
            font-size: 0.85rem;
            border: none;
            cursor: pointer;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <TournamentEngine tournamentId={tournamentId} apiBase={apiBase} />
      </div>
    </main>
  );
}
