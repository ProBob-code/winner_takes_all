"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * The chain dashboard: every site at once, and the league table that spans
 * them.
 *
 * Phase 2.3. The table is the reason this tier exists. A chain owner can
 * always buy the single-venue product twice; what they cannot get that way is
 * a player's record following them between rooms instead of restarting at
 * each. Everything else here is convenience.
 *
 * The per-site activity is laid out so the quiet rooms stand out. A chain
 * owner's real question is not how the chain is doing in aggregate — it is
 * which sites have stopped running nights, because those are the ones about to
 * cancel.
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

interface Site {
  id: string;
  name: string;
  city: string;
  activity: Activity | null;
}

interface Standing {
  name: string;
  played: number;
  points: number;
  score: number;
  venues: number;
}

interface Overview {
  chain: { id: string; name: string };
  sites: Site[];
  subscription: {
    id: string;
    planCode: string;
    status: string;
    entitled: boolean;
    amount: { amount: string; currency: string };
    periodEnd: string | null;
  } | null;
}

const money = (amount: string) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

/** How long since this site last ran anything, and whether that is a worry. */
function quietFor(iso: string | null): { label: string; tone: "good" | "warn" | "bad" } {
  if (!iso) return { label: "never run a night", tone: "bad" };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 7) return { label: days <= 1 ? "ran today" : `${days} days ago`, tone: "good" };
  // A fortnight without a night, for a venue paying for a weekly league, means
  // something has stopped — staff turnover, a broken table, a lost habit.
  if (days <= 21) return { label: `${days} days ago`, tone: "warn" };
  return { label: `${days} days ago`, tone: "bad" };
}

export default function ChainDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const chainId = params?.id;

  const [data, setData] = useState<Overview | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chainId) return;
    try {
      const [overviewRes, standingsRes] = await Promise.all([
        backendFetch(`/chains/${chainId}/overview`),
        backendFetch(`/chains/${chainId}/standings`),
      ]);

      if (overviewRes.status === 401) {
        router.push("/login");
        return;
      }

      const overview: any = await overviewRes.json().catch(() => ({}));
      if (!overviewRes.ok || overview?.ok === false) {
        setLoadError(overview?.message || "That chain could not be read.");
        return;
      }
      setData(overview);
      setLoadError(null);

      const table: any = await standingsRes.json().catch(() => ({}));
      if (table?.ok) setStandings(table.standings ?? []);
    } catch {
      setLoadError("Could not reach the server.");
    }
  }, [chainId, router]);

  useEffect(() => {
    void load();
  }, [load]);

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
          <p className="muted">Reading the chain…</p>
        </div>
      </main>
    );
  }

  const { chain, sites, subscription } = data;

  const totals = sites.reduce(
    (sum, site) => ({
      nights: sum.nights + (site.activity?.tournaments ?? 0),
      frames: sum.frames + (site.activity?.matches ?? 0),
    }),
    { nights: 0, frames: 0 }
  );

  const quiet = sites.filter((site) => quietFor(site.activity?.lastNightAt ?? null).tone !== "good");

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
                marginTop: "var(--space-2)",
                overflowWrap: "anywhere",
              }}
            >
              {chain.name}
            </h1>
            <p className="muted" style={{ marginTop: "var(--space-2)" }}>
              {sites.length} {sites.length === 1 ? "site" : "sites"}
            </p>
          </div>
          {subscription && (
            <div style={{ textAlign: "right" }}>
              <span className={`chip ${subscription.entitled ? "good" : "bad"}`}>
                {subscription.status}
              </span>
              <div style={{ fontWeight: 900, marginTop: "var(--space-2)" }}>
                {money(subscription.amount.amount)}
              </div>
            </div>
          )}
        </div>

        <div className="auto-grid narrow" style={{ marginBottom: "var(--space-5)" }}>
          <div className="stat">
            <div className="stat-value">{sites.length}</div>
            <div className="stat-label">sites</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totals.nights}</div>
            <div className="stat-label">nights run</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totals.frames}</div>
            <div className="stat-label">frames played</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: quiet.length ? "#f87171" : undefined }}>
              {quiet.length}
            </div>
            <div className="stat-label">gone quiet</div>
          </div>
        </div>

        {quiet.length > 0 && (
          <div
            className="panel"
            style={{ marginBottom: "var(--space-5)", borderColor: "rgba(220,38,38,0.4)" }}
          >
            <strong>
              {quiet.length} {quiet.length === 1 ? "site has" : "sites have"} not run a night
              in over a week.
            </strong>
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              {quiet.map((site) => site.name).join(", ")}. Usually this is staff turnover
              or a lost habit rather than anything about the software — a visit fixes it
              more often than a feature does.
            </p>
          </div>
        )}

        <div className="panel" style={{ marginBottom: "var(--space-5)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "var(--space-4)" }}>
            Every site
          </h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Nights</th>
                  <th>Frames</th>
                  <th>Players</th>
                  <th>Last night</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const when = quietFor(site.activity?.lastNightAt ?? null);
                  return (
                    <tr key={site.id}>
                      <td>
                        <Link href={`/venues/${site.id}`}>{site.name}</Link>
                        {site.city && (
                          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                            {" "}
                            · {site.city}
                          </span>
                        )}
                      </td>
                      <td>{site.activity?.tournaments ?? 0}</td>
                      <td>{site.activity?.matches ?? 0}</td>
                      <td>{site.activity?.players ?? 0}</td>
                      <td>
                        <span className={`chip ${when.tone}`}>{when.label}</span>
                      </td>
                    </tr>
                  );
                })}
                {sites.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No sites in this chain yet. Add a venue and put it in the chain.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div style={{ marginBottom: "var(--space-4)" }}>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
              One table across the chain
            </h2>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              A player&apos;s record follows them between your rooms rather than restarting
              at each one. This is the thing you cannot get by buying the single-venue
              product twice.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Played</th>
                  <th>Points</th>
                  <th>Sites</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => (
                  <tr key={`${row.name}-${i}`}>
                    <td className="muted">{i + 1}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{row.name}</td>
                    <td>{row.played}</td>
                    <td style={{ fontWeight: 900 }}>{row.points}</td>
                    <td>
                      {/* Someone who plays at more than one of your rooms is the
                          person this tier is actually for. */}
                      {row.venues > 1 ? (
                        <span className="chip gold">{row.venues}</span>
                      ) : (
                        <span className="muted">1</span>
                      )}
                    </td>
                  </tr>
                ))}
                {standings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nothing has been played across the chain yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
