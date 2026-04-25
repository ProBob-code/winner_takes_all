"use client";
import { useEffect, useState } from "react";
import { readBackendJson } from "@/lib/backend";
import Link from "next/link";

type AdminResponse = {
  ok: boolean;
  totalTournaments: number;
  activeTournaments: number;
  completedTournaments: number;
  totalMatches: number;
  activeMatches: number;
  pendingApprovals: Array<{
    id: string;
    tournamentId: string;
    round: number;
    player1: { id: string; name: string; score: number; submittedScore?: number | null } | null;
    player2: { id: string; name: string; score: number; submittedScore?: number | null } | null;
    status: string;
  }>;
  tournaments: Array<{
    id: string;
    name: string;
    status: string;
    joinedPlayers: number;
    maxPlayers: number;
  }>;
};

export default function AdminPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      try {
        const { payload } = await readBackendJson<AdminResponse>("/admin/overview");
        setData(payload);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="page"><div className="shell">Loading...</div></div>;
  if (error || !data) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel page-card">
            <h2>Admin</h2>
            <p className="muted">Could not load admin dashboard. Make sure the API is running and you are authenticated.</p>
          </div>
        </div>
      </main>
    );
  }

  const payload = data;

  return (
    <main className="page">
      <div className="shell">
        <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
          <h2>🛡️ Admin Dashboard</h2>
        </div>

        <div className="admin-grid slide-in">
          <div className="admin-stat">
            <div className="admin-stat-value">{payload.totalTournaments}</div>
            <div className="admin-stat-label">Total Tournaments</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{payload.activeTournaments}</div>
            <div className="admin-stat-label">Active</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{payload.completedTournaments}</div>
            <div className="admin-stat-label">Completed</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{payload.totalMatches}</div>
            <div className="admin-stat-label">Total Matches</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{payload.activeMatches}</div>
            <div className="admin-stat-label">Active Matches</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value" style={{ color: (payload.pendingApprovals?.length || 0) > 0 ? "var(--yellow)" : undefined }}>
              {payload.pendingApprovals?.length || 0}
            </div>
            <div className="admin-stat-label">Pending Approvals</div>
          </div>
        </div>

        {/* Pending Score Approvals */}
        {(payload.pendingApprovals?.length || 0) > 0 && (
          <div className="panel page-card slide-in" style={{ marginBottom: "1.5rem" }}>
            <h2>⏳ Pending Score Approvals</h2>
            {payload.pendingApprovals.map((match: any) => (
              <ApprovalCard key={match.id} match={match} />
            ))}
          </div>
        )}

        {/* Tournaments */}
        <div className="panel page-card slide-in">
          <h2>Tournaments</h2>
          <div className="list">
            {(payload.tournaments || []).map((t: any) => (
              <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="list-item">
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: ".8rem" }}>{t.joinedPlayers}/{t.maxPlayers} players</div>
                  </div>
                  <span className={`tournament-status status-${t.status}`}>{t.status.replace("_", " ")}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function ApprovalCard({ match }: { match: any }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/matches/${match.id}/approve-scores`, { method: "POST" });
      if (res.ok) window.location.reload();
      else alert("Failed to approve scores");
    } catch {
      alert("Error approving scores");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="approval-card">
      <div style={{ fontSize: ".8rem", color: "var(--text-muted)", marginBottom: ".5rem" }}>
        Round {match.round} · Match {match.id.slice(-8)}
      </div>
      <div className="approval-scores">
        <div className="approval-player">
          <div style={{ fontWeight: 600 }}>{match.player1?.name || "Player 1"}</div>
          <div className="approval-score">{match.player1?.submittedScore ?? "-"}</div>
        </div>
        <div style={{ color: "var(--text-muted)", fontWeight: 700 }}>VS</div>
        <div className="approval-player">
          <div style={{ fontWeight: 600 }}>{match.player2?.name || "Player 2"}</div>
          <div className="approval-score">{match.player2?.submittedScore ?? "-"}</div>
        </div>
      </div>
      <div className="cta-row" style={{ justifyContent: "center" }}>
        <form onSubmit={handleApprove}>
          <button type="submit" className="button-success button-sm" disabled={submitting}>
            {submitting ? "Approving..." : "✅ Approve Scores"}
          </button>
        </form>
      </div>
    </div>
  );
}
