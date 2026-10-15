"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

type Tab =
  | "overview"
  | "payouts"
  | "users"
  | "transactions"
  | "tournaments"
  | "venues"
  | "billing";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  // The two tabs that watch the business as it is after Phase 0: venues
  // are the customer and subscriptions are the revenue. Placed ahead of
  // payouts and the ledger, which are now wind-down concerns.
  { id: "venues", label: "Venues" },
  { id: "billing", label: "Revenue" },
  { id: "payouts", label: "Payouts" },
  { id: "users", label: "Members" },
  { id: "transactions", label: "Ledger" },
  { id: "tournaments", label: "Tournaments" },
];

async function getJson(path: string) {
  const res = await backendFetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data;
}

async function postJson(path: string, body: unknown) {
  const res = await backendFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [ledger, setLedger] = useState<any[] | null>(null);
  const [venues, setVenues] = useState<any[] | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [o, p, u, t] = await Promise.all([
        getJson("/admin/overview"),
        getJson("/admin/payouts"),
        getJson("/admin/users"),
        getJson("/admin/transactions?limit=150"),
      ]);
      setOverview(o);
      setPayouts(p.payouts);
      setUsers(u.users);
      setLedger(t.transactions);

      // Separately, and forgiving: these read tables added in migration 0012,
      // and a database that has not had it applied should cost the rest of the
      // console nothing.
      try {
        const [v, b] = await Promise.all([
          getJson("/admin/venues"),
          getJson("/admin/subscriptions"),
        ]);
        setVenues(v.venues);
        setBilling(b);
      } catch (err) {
        console.warn("Venue and billing figures are unavailable:", err);
      }
    } catch (err: any) {
      setError(err?.message || "Could not load the admin console.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setNotice(null);
    setError(null);
    try {
      await fn();
      setNotice(message);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "That did not work.");
    }
  }

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <div className="empty-state slide-in">
            <div className="empty-icon loading-spin">🛡️</div>
            <h3>Opening the control room…</h3>
          </div>
        </div>
      </main>
    );
  }

  if (error && !overview) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel" style={{ padding: "2rem" }}>
            <h2>Admin</h2>
            <p className="muted">{error}</p>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              This console is only reachable by an account whose role is <code>admin</code>.
            </p>
            <Link href="/login" className="button button-gold" style={{ marginTop: "1rem", display: "inline-block" }}>
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const platform = overview?.platform;

  return (
    <main className="page">
      <div className="shell">
        <div className="app-header slide-in">
          <div className="header-info">
            <h1 className="glow-text" style={{ fontSize: "clamp(1.6rem, 6vw, 2.5rem)" }}>Control Room</h1>
            <p className="muted">Everything the platform knows, and the levers that change it.</p>
          </div>
        </div>

        <div className="admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`admin-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "payouts" && overview?.platform?.pendingPayouts > 0 && (
                <span className="admin-pill">{overview.platform.pendingPayouts}</span>
              )}
            </button>
          ))}
        </div>

        {notice && (
          <div className="panel" style={{ padding: "0.9rem 1.15rem", marginBottom: "1rem", border: "1px solid rgba(16,185,129,0.3)" }}>
            <span style={{ color: "var(--gold)", fontWeight: 700 }}>{notice}</span>
          </div>
        )}
        {error && (
          <div className="panel" style={{ padding: "0.9rem 1.15rem", marginBottom: "1rem", border: "1px solid rgba(239,68,68,0.3)" }}>
            <span style={{ color: "#f87171", fontWeight: 700 }}>{error}</span>
          </div>
        )}

        {tab === "overview" && (
          <div className="stack" style={{ gap: "1.5rem" }}>
            <div className="admin-stat-grid">
              <Stat label="Members" value={String(overview.totalUsers)} sub={`${overview.admins} admin`} />
              <Stat label="Tournaments" value={String(overview.totalTournaments)} sub={`${overview.activeTournaments} running`} />
              <Stat label="Completed" value={String(overview.completedTournaments)} sub="settled" />
              <Stat label="Payouts waiting" value={String(platform.pendingPayouts)} sub={formatMoney(platform.pendingPayoutValue)} accent="var(--gold)" />
            </div>

            {/* Platform charges live here and nowhere a member can reach. */}
            <div className="panel" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.2rem" }}>Platform charges</h3>
              <p className="muted" style={{ fontSize: "0.78rem", marginTop: 0 }}>
                Admin-only. A member sees the charge on their own withdrawal and nothing else.
              </p>
              <div className="admin-stat-grid">
                <Stat label={`Fees earned (${platform.feePercent}%)`} value={formatMoney(platform.feesEarned)} accent="var(--green-light)" />
                <Stat label="Paid out to members" value={formatMoney(platform.paidOut)} />
                <Stat label="Member balances" value={formatMoney(platform.memberBalances)} />
                <Stat label="Bonus outstanding" value={formatMoney(platform.bonusOutstanding)} sub="never payable" accent="var(--gold)" />
                <Stat label="Cash liability" value={formatMoney(platform.liability)} sub="owed if everyone cashed out" accent="var(--accent-light)" />
              </div>
            </div>
          </div>
        )}

        {tab === "payouts" && (
          <PayoutQueue payouts={payouts ?? []} onSettle={act} />
        )}

        {tab === "users" && <Members users={users ?? []} onAct={act} />}

        {tab === "transactions" && (
          <div className="panel" style={{ padding: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Ledger</h3>
            <p className="muted" style={{ fontSize: "0.78rem" }}>Every movement across every account, newest first.</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>When</th><th>Member</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th>Reference</th></tr>
                </thead>
                <tbody>
                  {(ledger ?? []).map((t) => (
                    <tr key={t.id}>
                      <td className="muted">{new Date(t.createdAt).toLocaleString()}</td>
                      <td>{t.userName || t.userId}<div className="muted admin-sub">{t.userEmail}</div></td>
                      <td>{t.type}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(t.amount)}</td>
                      <td className="muted admin-sub">{t.description || t.referenceType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "venues" && (
          <div className="panel" style={{ padding: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Venues</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: "-0.4rem" }}>
              The customer, after Phase 0. A venue that has stopped running nights is a
              venue about to cancel, so the last night is the column to read.
            </p>
            {venues === null ? (
              <p className="muted">Venue figures are unavailable — migration 0012 may not have run.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Venue</th><th>Town</th><th>Nights</th><th>Frames</th>
                      <th>Players</th><th>Last night</th><th>Subscription</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((v: any) => {
                      const last = v.activity?.lastNightAt
                        ? Math.floor((Date.now() - new Date(v.activity.lastNightAt).getTime()) / 86400000)
                        : null;
                      return (
                        <tr key={v.id}>
                          <td><Link href={`/venues/${v.id}`}>{v.name}</Link></td>
                          <td className="muted admin-sub">{v.city || "—"}</td>
                          <td>{v.activity?.tournaments ?? 0}</td>
                          <td>{v.activity?.matches ?? 0}</td>
                          <td>{v.activity?.players ?? 0}</td>
                          <td
                            className="admin-sub"
                            style={{ color: last === null || last > 21 ? "#f87171" : undefined }}
                          >
                            {last === null ? "never" : last <= 1 ? "today" : `${last}d ago`}
                          </td>
                          <td className="admin-sub">
                            {v.entitled ? (v.monthly ? formatMoney(v.monthly) : "covered") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {venues.length === 0 && (
                      <tr><td colSpan={7} className="muted">No venues yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "billing" && (
          <div className="panel" style={{ padding: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Recurring revenue</h3>
            {billing === null ? (
              <p className="muted">Billing figures are unavailable — migration 0012 may not have run.</p>
            ) : (
              <>
                {/* The exit test for Phase 1 is three venues paying after their
                    free month. This is where it is read off. */}
                <div className="auto-grid narrow" style={{ marginBottom: "1.25rem" }}>
                  <div className="stat">
                    <div className="stat-value">{billing.payingVenues ?? 0}</div>
                    <div className="stat-label">paying venues</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">{billing.payingChains ?? 0}</div>
                    <div className="stat-label">paying chains</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">
                      {billing.recurringMonthly ? formatMoney(billing.recurringMonthly) : "Rs 0"}
                    </div>
                    <div className="stat-label">per month</div>
                  </div>
                  <div className="stat">
                    <div
                      className="stat-value"
                      style={{ fontSize: "var(--text-xl)", color: billing.billingEnabled ? undefined : "#f87171" }}
                    >
                      {billing.billingEnabled ? "open" : "closed"}
                    </div>
                    <div className="stat-label">checkout</div>
                  </div>
                </div>

                {(billing.payingVenues ?? 0) < 3 && (
                  <p
                    className="muted"
                    style={{ fontSize: "0.85rem", marginBottom: "1rem", color: "var(--gold)" }}
                  >
                    Phase 1&apos;s exit test is three venues paying after their free month.
                    Currently {billing.payingVenues ?? 0}.
                  </p>
                )}

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Venue</th><th>Owner</th><th>Plan</th><th>Status</th>
                        <th style={{ textAlign: "right" }}>Amount</th><th>Free until</th><th>Next due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(billing.subscriptions ?? []).map((sub: any) => (
                        <tr key={sub.id}>
                          <td>
                            {sub.venueId ? (
                              <Link href={`/venues/${sub.venueId}`}>{sub.venueName || sub.venueId}</Link>
                            ) : (
                              <span className="muted">chain</span>
                            )}
                          </td>
                          <td className="muted admin-sub">{sub.owner || "—"}</td>
                          <td className="admin-sub">{sub.planCode}</td>
                          <td className="admin-sub">{sub.status}</td>
                          <td style={{ textAlign: "right" }}>{formatMoney(sub.amount)}</td>
                          <td className="muted admin-sub">
                            {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString("en-IN") : "—"}
                          </td>
                          <td className="muted admin-sub">
                            {sub.periodEnd ? new Date(sub.periodEnd).toLocaleDateString("en-IN") : "—"}
                          </td>
                        </tr>
                      ))}
                      {(billing.subscriptions ?? []).length === 0 && (
                        <tr><td colSpan={7} className="muted">Nobody is subscribed yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "tournaments" && (
          <div className="panel" style={{ padding: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Tournaments &amp; wins</h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Status</th><th>Players</th><th style={{ textAlign: "right" }}>Entry</th><th style={{ textAlign: "right" }}>Pot</th><th>Winner</th></tr>
                </thead>
                <tbody>
                  {(overview?.tournaments ?? []).map((t: any) => (
                    <tr key={t.id}>
                      <td><Link href={`/tournaments/${t.id}`}>{t.name}</Link></td>
                      <td>{t.status}</td>
                      <td>{t.joinedPlayers}/{t.maxPlayers}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(t.entryFee)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(t.prizePool)}</td>
                      <td className="muted admin-sub">
                        {t.winnerId
                          ? (users ?? []).find((u) => u.id === t.winnerId)?.name || t.winnerId
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .admin-tabs {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 1.5rem;
        }
        .admin-tabs :global(.admin-tab) {
          padding: 0.6rem 1.1rem;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
          font-family: inherit;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          transition: all 0.2s ease;
        }
        .admin-tabs :global(.admin-tab.active) {
          background: var(--gradient-primary);
          color: white;
          border-color: transparent;
        }
        .admin-tabs :global(.admin-pill) {
          background: var(--gold);
          color: #1a1400;
          border-radius: 999px;
          padding: 0 0.45rem;
          font-size: 0.7rem;
          font-weight: 900;
        }
        .admin-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
          gap: 1rem;
        }
        /* Tables are the one thing allowed to scroll sideways, in their own
           box, so the page itself never does. */
        .admin-table-wrap {
          overflow-x: auto;
          margin-top: 1rem;
        }
      `}</style>
    </main>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--glass-bg)", padding: "1rem", borderRadius: "16px", border: "1px solid var(--glass-border-color)" }}>
      <div className="muted" style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
      <div style={{ fontSize: "1.45rem", fontWeight: 900, color: accent, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: "0.7rem" }}>{sub}</div>}
    </div>
  );
}

function PayoutQueue({ payouts, onSettle }: { payouts: any[]; onSettle: (fn: () => Promise<unknown>, msg: string) => void }) {
  const [note, setNote] = useState<Record<string, string>>({});
  const pending = payouts.filter((p) => p.status === "pending");
  const settled = payouts.filter((p) => p.status !== "pending");

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      <div className="panel" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Waiting on you ({pending.length})</h3>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          The money already left the member&apos;s balance. Marking one paid keeps the handling charge; declining one
          returns every rupee, charge included.
        </p>
        {pending.length === 0 && <p className="muted">Nothing pending.</p>}
        <div className="stack" style={{ gap: "0.85rem", marginTop: "1rem" }}>
          {pending.map((p) => (
            <div key={p.id} style={{ background: "var(--glass-bg)", padding: "1rem", borderRadius: "14px", border: "1px solid var(--glass-border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.user?.name || p.user?.email || p.id}</strong>
                  <div className="muted" style={{ fontSize: "0.75rem", overflowWrap: "anywhere" }}>
                    to {p.destination} · requested {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, fontSize: "1.15rem" }}>{formatMoney(p.net)}</div>
                  <div className="muted" style={{ fontSize: "0.7rem" }}>
                    {formatMoney(p.amount)} less {formatMoney(p.fee)} charge
                  </div>
                </div>
              </div>
              <input
                className="premium-input-v2"
                placeholder="Note (shown to the member if declined)"
                value={note[p.id] ?? ""}
                onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                style={{ width: "100%", marginTop: "0.75rem" }}
              />
              <div className="cta-row" style={{ marginTop: "0.75rem" }}>
                <button
                  className="button"
                  onClick={() => onSettle(
                    () => postJson(`/admin/payouts/${p.id}/settle`, { action: "paid", note: note[p.id] || undefined }),
                    "Marked paid.",
                  )}
                >
                  Mark paid
                </button>
                <button
                  className="button-secondary"
                  onClick={() => onSettle(
                    () => postJson(`/admin/payouts/${p.id}/settle`, { action: "rejected", note: note[p.id] || undefined }),
                    "Declined and refunded.",
                  )}
                >
                  Decline &amp; refund
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Settled</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Member</th><th>Status</th><th style={{ textAlign: "right" }}>Paid</th><th style={{ textAlign: "right" }}>Charge</th><th>When</th></tr>
            </thead>
            <tbody>
              {settled.map((p) => (
                <tr key={p.id}>
                  <td>{p.user?.name || p.user?.email}</td>
                  <td style={{ color: p.status === "paid" ? "var(--gold)" : "#f87171", fontWeight: 700 }}>{p.status}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(p.net)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(p.fee)}</td>
                  <td className="muted admin-sub">{p.processedAt ? new Date(p.processedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Members({ users, onAct }: { users: any[]; onAct: (fn: () => Promise<unknown>, msg: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [bonus, setBonus] = useState("");
  const [password, setPassword] = useState("");

  const shown = users.filter((u) => {
    const q = query.trim().toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <div className="panel" style={{ padding: "1.25rem" }}>
      <h3 style={{ marginTop: 0 }}>Members</h3>
      {/* Stated plainly, because "show me the passwords" is a reasonable thing
          to expect of an admin console and the answer here is no. */}
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Passwords are stored as salted PBKDF2 hashes and cannot be read back by anyone, including you. Set a new one
        instead, and tell the member to change it after signing in.
      </p>

      <input
        className="premium-input-v2"
        placeholder="Search by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", margin: "1rem 0" }}
      />

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Member</th><th>Role</th><th style={{ textAlign: "right" }}>Balance</th>
              <th style={{ textAlign: "right" }}>Bonus</th><th style={{ textAlign: "right" }}>Entries</th>
              <th>Last active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<div className="muted admin-sub">{u.email}</div></td>
                <td>{u.role}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(u.balance)}</td>
                <td style={{ textAlign: "right", color: "var(--gold)" }}>{formatMoney(u.bonus)}</td>
                <td style={{ textAlign: "right" }}>{u.transactionCount}</td>
                <td className="muted admin-sub">{u.lastActivity ? new Date(u.lastActivity).toLocaleDateString() : "never"}</td>
                <td>
                  <button className="button-secondary button-sm" onClick={() => setOpen(open === u.id ? null : u.id)}>
                    {open === u.id ? "Close" : "Manage"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div style={{ background: "var(--glass-bg)", padding: "1rem", borderRadius: "14px", marginTop: "1rem", border: "1px solid var(--glass-border-color)" }}>
          <h4 style={{ marginTop: 0 }}>{shown.find((u) => u.id === open)?.name}</h4>

          <div className="admin-stat-grid" style={{ gap: "0.75rem" }}>
            <div>
              <label className="muted" style={{ fontSize: "0.7rem", fontWeight: 800 }}>GRANT GAME BONUS (Rs)</label>
              <input className="premium-input-v2" value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="500" style={{ width: "100%", marginTop: "0.3rem" }} />
              <button
                className="button button-sm"
                style={{ marginTop: "0.5rem" }}
                disabled={!(Number(bonus) > 0)}
                onClick={() => onAct(
                  () => postJson(`/admin/users/${open}/bonus`, { amount: Number(bonus) }),
                  "Bonus granted — spendable, not withdrawable.",
                )}
              >
                Grant
              </button>
            </div>

            <div>
              <label className="muted" style={{ fontSize: "0.7rem", fontWeight: 800 }}>SET A NEW PASSWORD</label>
              <input className="premium-input-v2" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" style={{ width: "100%", marginTop: "0.3rem" }} />
              <button
                className="button button-sm"
                style={{ marginTop: "0.5rem" }}
                disabled={password.length < 8}
                onClick={() => onAct(
                  () => postJson(`/admin/users/${open}/reset-password`, { password }),
                  "Password reset.",
                )}
              >
                Reset
              </button>
            </div>

            <div>
              <label className="muted" style={{ fontSize: "0.7rem", fontWeight: 800 }}>ROLE</label>
              <div className="cta-row" style={{ marginTop: "0.3rem" }}>
                <button className="button-secondary button-sm" onClick={() => onAct(() => postJson(`/admin/users/${open}/role`, { role: "admin" }), "Now an admin.")}>
                  Make admin
                </button>
                <button className="button-secondary button-sm" onClick={() => onAct(() => postJson(`/admin/users/${open}/role`, { role: "player" }), "Now a player.")}>
                  Make player
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
