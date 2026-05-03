"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readBackendJson } from "@/lib/backend";

export default function EngineSelectionPage() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { payload } = await readBackendJson<any>("/tournaments");
        if (payload.ok) {
          setTournaments(payload.tournaments);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main className="page">
      <div className="shell">
        <div className="app-header">
          <h1 className="glow-text">Stadium Arena Manager</h1>
          <p className="muted">Select a tournament to launch the dynamic engine.</p>
        </div>

        {loading ? (
          <div className="panel page-card">Loading tournaments...</div>
        ) : (
          <div className="list" style={{ marginTop: "2rem" }}>
            {tournaments.map((t: any) => (
              <div key={t.id} className="panel page-card list-item" style={{ marginBottom: "1rem" }}>
                <div>
                  <h3 className="value">{t.name}</h3>
                  <div className="label">Status: {t.status} | Players: {t.joinedPlayers}/{t.maxPlayers}</div>
                </div>
                <Link href={`/tournaments/engine/${t.id}`} className="button button-primary">
                  LAUNCH ENGINE
                </Link>
              </div>
            ))}
            {tournaments.length === 0 && (
              <div className="panel page-card">
                <p>No tournaments found. Create one first!</p>
                <Link href="/tournaments/create" className="button button-secondary" style={{ marginTop: "1rem" }}>
                  CREATE TOURNAMENT
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
