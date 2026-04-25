"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-config";

type LeaderboardResponse = {
  ok: boolean;
  entries: Array<{
    userId: string;
    displayName: string;
    wins: number;
    losses: number;
    points: number;
    totalScore: number;
    earnings: { amount: string; currency: string };
    status: string;
  }>;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (typeof window === "undefined") return;
      try {
        setLoading(true);
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/leaderboard/global`, { credentials: "include" });
        const data = await res.json();
        setEntries(data.entries || []);
      } catch (err: any) {
        console.error("Leaderboard fetch error:", err);
        setError(err.message || "Failed to load leaderboard");
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
            <div className="empty-icon loading-spin">🏆</div>
            <h3>Loading leaderboard...</h3>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Leaderboard</h2>
            <p className="muted">Something went wrong. Error: {error}</p>
          </div>
        </div>
      </main>
    );
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: "900px" }}>
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <h2>🏆 Global Leaderboard</h2>
          <p className="muted">Rankings based on tournament points (3 pts per win)</p>
        </div>

        {/* Podium */}
        {top3.length >= 3 && (
          <div className="podium slide-in">
            <div className="podium-place podium-2nd">
              <div className="podium-medal">🥈</div>
              <div className="podium-name">{top3[1].displayName}</div>
              <div className="podium-score">{top3[1].points} pts</div>
              <div className="podium-pillar"></div>
            </div>
            <div className="podium-place podium-1st">
              <div className="podium-medal">🥇</div>
              <div className="podium-name">{top3[0].displayName}</div>
              <div className="podium-score">{top3[0].points} pts</div>
              <div className="podium-pillar"></div>
            </div>
            <div className="podium-place podium-3rd">
              <div className="podium-medal">🥉</div>
              <div className="podium-name">{top3[2].displayName}</div>
              <div className="podium-score">{top3[2].points} pts</div>
              <div className="podium-pillar"></div>
            </div>
          </div>
        )}

        {/* Full table */}
        <div className="panel page-card slide-in">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Score</th>
                <th>W/L</th>
                <th>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                    No match data yet. Play some tournaments to appear on the leaderboard!
                  </td>
                </tr>
              ) : (
                entries.map((entry: any, i: number) => (
                  <tr key={entry.userId}>
                    <td className="leaderboard-rank" data-label="Rank">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="rank-text">#{i + 1}</span>}
                    </td>
                    <td className="leaderboard-name" data-label="Player">
                      {entry.displayName}
                    </td>
                    <td style={{ fontWeight: 700 }} data-label="Points">{entry.points}</td>
                    <td data-label="Score">{entry.totalScore}</td>
                    <td data-label="W/L">{entry.wins}W / {entry.losses}L</td>
                    <td className="earnings-value" data-label="Earnings">₹{entry.earnings.amount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
