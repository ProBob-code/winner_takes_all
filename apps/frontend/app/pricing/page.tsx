"use client";

// Rendered per request, not prerendered. These pages read the router, the
// query string or the live tournament state at mount, and prerendering them
// trips Next's workUnitAsyncStorage invariant. The admin console already
// does this for the same reason.
export const dynamic = "force-dynamic";

/**
 * What the software costs, and how a venue starts paying for it.
 *
 * Phase 2.2. This is the page that replaces the rake: Phase 0 stopped taking a
 * cut of pooled entry fees, which the Online Gaming Act 2025 prohibits, and a
 * venue subscription is the lawful revenue line that takes its place. A venue
 * paying for tournament software is an ordinary business-to-business sale.
 *
 * WHAT THE BUYER PANEL SAID ABOUT PRICE
 * Price blocked nobody. Ten of twenty would buy, and not one of the ten who
 * would not gave the price as the reason — the blockers were staff adoption
 * (six), not being the decision-maker (three), having no league night to score
 * (three) and being entirely offline (two). So this page spends its words on
 * what the thing does rather than on discounting, and the free month is here
 * to answer "will my staff actually use it", which is the real question.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { backendFetch } from "@/lib/backend";

interface Plan {
  code: string;
  name: string;
  price: { amount: string; currency: string };
  rupees: number;
  intervalMonths: number;
  perSite: boolean;
  minSites: number;
  blurb: string;
  features: string[];
}

interface Venue {
  id: string;
  name: string;
  entitled: boolean;
}

interface Chain {
  id: string;
  name: string;
  sites: number;
}

const money = (rupees: number) => `₹${rupees.toLocaleString("en-IN")}`;

export default function PricingPage() {
  const router = useRouter();
  const search = useSearchParams();
  const preselectedVenue = search?.get("venue") ?? "";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [trialDays, setTrialDays] = useState(30);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  const [venues, setVenues] = useState<Venue[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  const [venueId, setVenueId] = useState(preselectedVenue);
  const [chainId, setChainId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await backendFetch("/billing/plans");
      const payload: any = await res.json().catch(() => ({}));
      if (payload?.ok) {
        setPlans(payload.plans ?? []);
        setEnabled(!!payload.enabled);
        setTrialDays(payload.trialDays ?? 30);
        setClosedMessage(payload.message ?? null);
      }
    } catch {
      setError("Could not read the plans. Try again in a moment.");
    }

    // Who this person is and what they already own. A 401 is fine here — the
    // prices are public and a venue owner who has not signed in should still
    // see them.
    try {
      const [venueRes, chainRes] = await Promise.all([
        backendFetch("/venues"),
        backendFetch("/chains"),
      ]);
      if (venueRes.status !== 401) {
        setSignedIn(true);
        const vp: any = await venueRes.json().catch(() => ({}));
        if (vp?.ok) {
          setVenues(vp.venues ?? []);
          if (!preselectedVenue && vp.venues?.length === 1) setVenueId(vp.venues[0].id);
        }
        const cp: any = await chainRes.json().catch(() => ({}));
        if (cp?.ok) setChains(cp.chains ?? []);
      }
    } catch {
      /* not signed in, or offline. The prices still show. */
    }
  }, [preselectedVenue]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async (plan: Plan) => {
    if (!signedIn) {
      router.push("/login");
      return;
    }

    if (plan.perSite && !chainId) {
      setError("Pick which chain this is for.");
      return;
    }
    if (!plan.perSite && !venueId) {
      setError("Pick which venue this is for.");
      return;
    }

    setBusy(plan.code);
    setError(null);
    setAuthUrl(null);
    try {
      const res = await backendFetch("/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: plan.code,
          venueId: plan.perSite ? null : venueId,
          chainId: plan.perSite ? chainId : null,
          sites: plan.perSite ? chains.find((c) => c.id === chainId)?.sites ?? plan.minSites : 1,
        }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setError(payload?.message || "That did not go through.");
        return;
      }
      // Razorpay's own authorisation page. The mandate is set up there, not
      // here: we never see the card.
      if (payload.authorisationUrl) setAuthUrl(payload.authorisationUrl);
      else setError("The subscription was created but no authorisation link came back.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="page">
      <div className="shell">
        <header style={{ maxWidth: "44rem" }}>
          <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 900 }}>
            Tournament software, billed to the venue.
          </h1>
          <p className="muted" style={{ marginTop: "var(--space-3)", lineHeight: 1.8 }}>
            Winner Takes All takes nothing from players. Tournaments are free to enter,
            there is no wallet and no prize money is pooled. The venue pays for the
            software, as it would for any other till-side system.
          </p>
          <p className="muted" style={{ marginTop: "var(--space-3)" }}>
            <strong style={{ color: "var(--text-primary)" }}>
              {trialDays} days free, no card charged until after
            </strong>{" "}
            — long enough to run a month of league nights and find out whether your staff
            actually use it.
          </p>
        </header>

        {!enabled && closedMessage && (
          <div
            className="panel"
            style={{ marginTop: "var(--space-5)", borderColor: "var(--gold-subtle)" }}
          >
            <strong>{closedMessage}</strong>
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              Nothing in the app is locked in the meantime. Every feature on this page
              works today.
            </p>
          </div>
        )}

        {signedIn && (venues.length > 0 || chains.length > 0) && (
          <div className="panel v-stack" style={{ marginTop: "var(--space-5)" }}>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Billing for</h2>
            <div className="auto-grid">
              {venues.length > 0 && (
                <div className="field">
                  <label htmlFor="pick-venue">Venue</label>
                  <select
                    id="pick-venue"
                    className="select"
                    value={venueId}
                    onChange={(e) => setVenueId(e.target.value)}
                  >
                    <option value="">Choose a venue</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name}
                        {venue.entitled ? " (already covered)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {chains.length > 0 && (
                <div className="field">
                  <label htmlFor="pick-chain">Chain</label>
                  <select
                    id="pick-chain"
                    className="select"
                    value={chainId}
                    onChange={(e) => setChainId(e.target.value)}
                  >
                    <option value="">Choose a chain</option>
                    {chains.map((chain) => (
                      <option key={chain.id} value={chain.id}>
                        {chain.name} — {chain.sites} {chain.sites === 1 ? "site" : "sites"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {error && <p style={{ color: "#f87171", marginTop: "var(--space-4)" }}>{error}</p>}

        {authUrl && (
          <div
            className="panel v-stack"
            style={{ marginTop: "var(--space-4)", borderColor: "var(--gold)" }}
          >
            <strong>One more step.</strong>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Authorise the mandate with Razorpay. Nothing is charged until the free month
              is over, and you can cancel before then at no cost.
            </p>
            <a
              className="button"
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", alignSelf: "flex-start" }}
            >
              Authorise with Razorpay
            </a>
          </div>
        )}

        <div className="plan-grid" style={{ marginTop: "var(--space-6)" }}>
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={`plan${plan.code === "venue_monthly" ? " featured" : ""}`}
            >
              <div>
                <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>{plan.name}</h2>
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  {plan.blurb}
                </p>
              </div>

              <div>
                <span className="price">{money(plan.rupees)}</span>
                <span className="per">
                  {plan.perSite
                    ? " per site, per month"
                    : plan.intervalMonths === 12
                      ? " per year"
                      : " per month"}
                </span>
                {plan.perSite && (
                  <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {plan.minSites} sites or more
                  </div>
                )}
              </div>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <button
                type="button"
                className={plan.code === "venue_monthly" ? "button" : "button-secondary"}
                onClick={() => void subscribe(plan)}
                disabled={!enabled || busy !== null}
                title={enabled ? undefined : "Subscriptions are not open yet"}
              >
                {busy === plan.code
                  ? "Setting it up…"
                  : !enabled
                    ? "Not open yet"
                    : `Start ${trialDays} days free`}
              </button>
            </div>
          ))}
          {plans.length === 0 && <p className="muted">Reading the plans…</p>}
        </div>

        <div className="panel v-stack" style={{ marginTop: "var(--space-6)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
            No league night to score yet?
          </h2>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Three of the twenty venues we spoke to said exactly that — &ldquo;I would be
            buying a scoreboard for an event that does not exist yet.&rdquo; So we wrote
            the guide to starting one from nothing. It is free and you do not need an
            account.
          </p>
          <Link
            className="button-secondary"
            href="/playbook"
            style={{ textDecoration: "none", alignSelf: "flex-start" }}
          >
            Read the league-night playbook
          </Link>
        </div>
      </div>
    </main>
  );
}
