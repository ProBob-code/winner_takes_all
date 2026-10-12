"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * The venues this account runs nights for.
 *
 * Phase 2.1. The venue, not the player, is the customer: that is the whole
 * shape of the business after Phase 0 stopped taking stakes. A venue owns its
 * tournaments, its staff and its subscription, and this is where an owner adds
 * one and sees whether it is covered.
 *
 * SPECULATIVE, AND WORTH SAYING SO
 * The plan gates this behind three venues paying for Phase 1. It is built
 * ahead of that gate, which means the shape here is a guess about how venues
 * want to be organised rather than something observed. Expect the roles and
 * the chain relationship to change once real venues use it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";

interface Venue {
  id: string;
  name: string;
  city: string;
  chainId: string | null;
  role: string | null;
  entitled: boolean;
  subscriptionStatus: string | null;
}

interface Chain {
  id: string;
  name: string;
  sites: number;
}

export default function VenuesPage() {
  const router = useRouter();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [chainId, setChainId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [venueRes, chainRes] = await Promise.all([
        backendFetch("/venues"),
        backendFetch("/chains"),
      ]);

      if (venueRes.status === 401) {
        router.push("/login");
        return;
      }

      const venuePayload: any = await venueRes.json().catch(() => ({}));
      if (venuePayload?.ok) setVenues(venuePayload.venues ?? []);
      else setError(venuePayload?.message || "Could not read your venues.");

      const chainPayload: any = await chainRes.json().catch(() => ({}));
      if (chainPayload?.ok) setChains(chainPayload.chains ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) {
      setError("A venue needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await backendFetch("/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim(),
          chainId: chainId || null,
        }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      setName("");
      setCity("");
      setChainId("");
      setAdding(false);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="shell">
        <div className="h-stack between" style={{ marginBottom: "var(--space-5)" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 900 }}>Venues</h1>
            <p className="muted" style={{ marginTop: "var(--space-2)" }}>
              Every room you run nights in. Tournaments, staff and billing belong to a
              venue.
            </p>
          </div>
          <button type="button" className="button" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Add a venue"}
          </button>
        </div>

        {adding && (
          <div className="panel v-stack" style={{ marginBottom: "var(--space-5)" }}>
            <div className="auto-grid">
              <div className="field">
                <label htmlFor="venue-name">Name</label>
                <input
                  id="venue-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="The Corner Pocket"
                  maxLength={80}
                />
              </div>
              <div className="field">
                <label htmlFor="venue-city">Town or city</label>
                <input
                  id="venue-city"
                  className="input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Kochi"
                  maxLength={60}
                />
              </div>
              {chains.length > 0 && (
                <div className="field">
                  <label htmlFor="venue-chain">Part of a chain</label>
                  <select
                    id="venue-chain"
                    className="select"
                    value={chainId}
                    onChange={(e) => setChainId(e.target.value)}
                  >
                    <option value="">On its own</option>
                    {chains.map((chain) => (
                      <option key={chain.id} value={chain.id}>
                        {chain.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button
              type="button"
              className="button"
              onClick={() => void create()}
              disabled={busy}
              style={{ alignSelf: "flex-start" }}
            >
              {busy ? "Adding…" : "Add it"}
            </button>
          </div>
        )}

        {error && (
          <p style={{ color: "#f87171", marginBottom: "var(--space-4)" }}>{error}</p>
        )}

        {loading ? (
          <p className="muted">Reading your venues…</p>
        ) : venues.length === 0 ? (
          <div className="panel v-stack">
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>No venues yet</h2>
            <p className="muted">
              A venue is a room you run tournaments in. Adding one lets you put staff on
              it, keep its nights together and see how busy it actually is.
            </p>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              You do not need a venue to run a night — <Link href="/run">run one now</Link>{" "}
              and attach it later.
            </p>
          </div>
        ) : (
          <div className="auto-grid">
            {venues.map((venue) => (
              <Link
                key={venue.id}
                href={`/venues/${venue.id}`}
                className="panel v-stack"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="h-stack between">
                  <strong style={{ fontSize: "var(--text-lg)", overflowWrap: "anywhere" }}>
                    {venue.name}
                  </strong>
                  <span className={`chip ${venue.entitled ? "good" : "warn"}`}>
                    {venue.entitled ? "covered" : "no subscription"}
                  </span>
                </div>
                <div className="h-stack tight">
                  {venue.city && <span className="chip">{venue.city}</span>}
                  {venue.role && <span className="chip">{venue.role}</span>}
                  {venue.chainId && <span className="chip">chain</span>}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="panel v-stack" style={{ marginTop: "var(--space-6)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Several venues?</h2>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            A chain gets one dashboard across every site and one league table spanning all
            of them, so a player&apos;s record follows them between rooms instead of
            restarting at each.
          </p>
          <Link className="button-secondary" href="/pricing" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
            See what it costs
          </Link>
        </div>
      </div>
    </main>
  );
}
