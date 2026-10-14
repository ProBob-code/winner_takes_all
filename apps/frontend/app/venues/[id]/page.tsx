"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * One venue: what it has run, who may run it, and what it pays.
 *
 * Phase 2.1, with the staff list that makes Phase 1's staff mode usable by
 * someone other than the owner — which the panel named as the single biggest
 * blocker, six of twenty, ahead of price.
 *
 * The activity figures are deliberately the first thing on the page. A venue
 * that has stopped running nights is a venue about to cancel, and the owner
 * seeing that before we do is better for both of us.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";

interface Activity {
  tournaments: number;
  completed: number;
  matches: number;
  players: number;
  lastNightAt: string | null;
}

interface Member {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  since: string;
}

interface Subscription {
  id: string;
  planCode: string;
  status: string;
  entitled: boolean;
  amount: { amount: string; currency: string };
  periodEnd: string | null;
  trialEndsAt: string | null;
  viaChain: boolean;
}

interface VenueDetail {
  venue: {
    id: string;
    name: string;
    city: string;
    chainId: string | null;
    whatsappGroup: string | null;
    status: string;
  };
  role: string;
  chain: { id: string; name: string } | null;
  activity: Activity | null;
  members: Member[];
  subscription: Subscription | null;
}

const whenever = (iso: string | null) => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const venueId = params?.id;

  const [data, setData] = useState<VenueDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<"staff" | "manager">("staff");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await backendFetch(`/venues/${venueId}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setLoadError(payload?.message || "That venue could not be read.");
        return;
      }
      setData(payload);
      setGroup(payload.venue?.whatsappGroup ?? "");
      setLoadError(null);
    } catch {
      setLoadError("Could not reach the server.");
    }
  }, [venueId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const addStaff = async () => {
    if (!staffEmail.trim()) {
      setError("Put in the email they signed up with.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await backendFetch(`/venues/${venueId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: staffEmail.trim(), role: staffRole }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      setStaffEmail("");
      setNotice(`${payload.name || "They"} can now run nights here.`);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const removeStaff = async (email: string | null) => {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const res = await backendFetch(`/venues/${venueId}/members/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await backendFetch(`/venues/${venueId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappGroup: group.trim() || null }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not save.");
        return;
      }
      setNotice("Saved.");
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <main className="page">
        <div className="shell">
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>{loadError}</h1>
          <Link href="/venues">Back to your venues</Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="shell">
          <p className="muted">Reading the venue…</p>
        </div>
      </main>
    );
  }

  const { venue, role, chain, activity, members, subscription } = data;
  const mayAdminister = role === "owner" || role === "manager";

  return (
    <main className="page">
      <div className="shell">
        <div className="h-stack between" style={{ marginBottom: "var(--space-5)" }}>
          <div style={{ minWidth: 0 }}>
            <Link href="/venues" className="muted" style={{ fontSize: "var(--text-sm)" }}>
              ← Venues
            </Link>
            <h1
              style={{
                fontSize: "var(--text-3xl)",
                fontWeight: 900,
                overflowWrap: "anywhere",
                marginTop: "var(--space-2)",
              }}
            >
              {venue.name}
            </h1>
            <div className="h-stack tight" style={{ marginTop: "var(--space-2)" }}>
              {venue.city && <span className="chip">{venue.city}</span>}
              <span className="chip">{role}</span>
              {chain && <span className="chip">{chain.name}</span>}
            </div>
          </div>
          <Link className="button" href="/run" style={{ textDecoration: "none" }}>
            Run a night
          </Link>
        </div>

        {/* Activity first: a room that has gone quiet is the thing worth
            noticing, and the owner should see it before we do. */}
        {activity && (
          <div className="auto-grid narrow" style={{ marginBottom: "var(--space-6)" }}>
            <div className="stat">
              <div className="stat-value">{activity.tournaments}</div>
              <div className="stat-label">nights run</div>
            </div>
            <div className="stat">
              <div className="stat-value">{activity.matches}</div>
              <div className="stat-label">frames played</div>
            </div>
            <div className="stat">
              <div className="stat-value">{activity.players}</div>
              <div className="stat-label">players seen</div>
            </div>
            <div className="stat">
              <div className="stat-value" style={{ fontSize: "var(--text-xl)" }}>
                {whenever(activity.lastNightAt)}
              </div>
              <div className="stat-label">last night</div>
            </div>
          </div>
        )}

        {notice && <p className="chip good" style={{ marginBottom: "var(--space-4)" }}>{notice}</p>}
        {error && <p style={{ color: "#f87171", marginBottom: "var(--space-4)" }}>{error}</p>}

        <div className="auto-grid">
          <div className="panel v-stack">
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>The group chat</h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              A note of which WhatsApp group results go to, so whoever is on shift knows.
              We hold no phone number and send nothing ourselves — the draw and the
              results are pushed with one tap from the tournament page.
            </p>
            {mayAdminister ? (
              <>
                <input
                  className="input"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="Friday League regulars"
                  maxLength={120}
                />
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void saveGroup()}
                  disabled={busy}
                  style={{ alignSelf: "flex-start" }}
                >
                  Save
                </button>
              </>
            ) : (
              <p>{venue.whatsappGroup || "Not set."}</p>
            )}
          </div>
        </div>

        {mayAdminister && (
          <div className="panel v-stack" style={{ marginTop: "var(--space-5)" }}>
            <div>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Who can run a night</h2>
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                Staff get staff mode and nothing else — no settings, no deleting, no
                billing. Six of the twenty venues we spoke to said this was the thing
                stopping them: the owner cannot be the only person who can score.
              </p>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.userId}>
                      <td>{member.name ?? "—"}</td>
                      <td style={{ overflowWrap: "anywhere" }}>{member.email ?? "—"}</td>
                      <td>
                        <span className="chip">{member.role}</span>
                      </td>
                      <td>
                        {member.role !== "owner" && (
                          <button
                            type="button"
                            className="button-secondary button-sm"
                            onClick={() => void removeStaff(member.email)}
                            disabled={busy}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Just you so far.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="h-stack" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 16rem" }}>
                <label htmlFor="staff-email">Add someone</label>
                <input
                  id="staff-email"
                  className="input"
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="they@example.com"
                />
                <span className="hint">
                  They need an account first. Ask them to sign up, then add them here.
                </span>
              </div>
              <div className="field" style={{ flex: "0 1 10rem" }}>
                <label htmlFor="staff-role">As</label>
                <select
                  id="staff-role"
                  className="select"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as "staff" | "manager")}
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => void addStaff()}
                disabled={busy}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
