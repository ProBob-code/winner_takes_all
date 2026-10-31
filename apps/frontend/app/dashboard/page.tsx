"use client";

export const dynamic = "force-dynamic";

/**
 * The dashboard.
 *
 * WHAT CAME OUT, AND WHY
 * It used to lead with "Rs 0.00 AVAILABLE CREDITS" and carry an Earnings panel
 * listing rupee transactions — on a platform that stopped taking stakes in
 * Phase 0 and whose policy page says there is no wallet. It also carried a
 * radio player and a hard-coded "Strategy Hub" tip that said the same sentence
 * about break speed to every player for ever. None of that told anyone
 * anything about their own night.
 *
 * WHAT WENT IN
 * The two things a player actually has here: their WTA Coins, and what they
 * have played. Plus the one action a host opens this page to take, which is
 * starting a night.
 *
 * The money view has not been deleted from the app — the wallet page still
 * exists for the wind-down, so anyone with a legacy balance can still see and
 * withdraw it. It is simply no longer the first thing the product says about
 * itself.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";
import { backendFetch } from "@/lib/backend";
import { CoinMark } from "@/components/coin-mark";
import { ProofResults } from "@/components/proof-results";
import { formatCoins, formatCoinsExact } from "@/lib/format";

interface Coins {
  balance: number;
  lifetime: number;
  rank: number;
  title: string;
  next: { title: string; at: number; toGo: number } | null;
  earnedToday: number;
}

interface LedgerEntry {
  id: string;
  amount: number;
  description: string | null;
  reason: string;
  at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [coins, setCoins] = useState<Coins | null>(null);
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || getApiUrl();
      const profileRes = await fetch(`${apiUrl}/api/user/profile`, {
        cache: "no-store",
        credentials: "include",
      });

      if (profileRes.status === 401) {
        router.push("/login");
        return;
      }

      const profile = await profileRes.json();
      if (profile.user) setUser(profile.user);

      // Coins are the point of the page, but a failure to read them should
      // leave the rest of it standing rather than blanking the dashboard.
      try {
        const [meRes, ledgerRes] = await Promise.all([
          backendFetch("/coins/me"),
          backendFetch("/coins/ledger?limit=6"),
        ]);
        const me = await meRes.json().catch(() => ({}));
        if (me?.ok) setCoins(me);
        const ledger = await ledgerRes.json().catch(() => ({}));
        if (ledger?.ok) setRecent(ledger.entries ?? []);
      } catch {
        /* the welcome and the actions still render */
      }
    } catch (err: any) {
      setError(err?.message || "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <div className="panel shimmer subtle" style={{ padding: "var(--space-6)" }}>
            <div className="skeleton text line-sm" style={{ height: "2rem" }} />
            <div className="skeleton text line-md" />
          </div>
          <div className="auto-grid" style={{ marginTop: "var(--space-5)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel shimmer subtle" style={{ padding: "var(--space-5)" }}>
                <div className="skeleton text line-md" />
                <div className="skeleton text line-sm" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="page">
        <div className="shell">
          <section className="panel" style={{ padding: "var(--space-7)", textAlign: "center" }}>
            <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 900 }}>Enter the arena</h1>
            <p className="muted" style={{ margin: "var(--space-3) 0 var(--space-6)" }}>
              {error ?? "Sign in to see your coins and your nights."}
            </p>
            <div className="h-stack" style={{ justifyContent: "center" }}>
              <Link className="button" href="/login" style={{ textDecoration: "none" }}>
                Log in
              </Link>
              <Link className="button-secondary" href="/signup" style={{ textDecoration: "none" }}>
                Create an account
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const firstName = String(user.name || "").split(" ")[0] || "player";
  const wins = user?.stats?.tournamentWins ?? 0;
  const joined: any[] = Array.isArray(user?.joinedTournaments) ? user.joinedTournaments : [];
  const progress = coins?.next
    ? Math.min(100, Math.round((coins.balance / coins.next.at) * 100))
    : 100;

  return (
    <main className="page">
      <div className="shell">
        {/* ── The welcome, with the balance that actually means something ── */}
        <section className="hero-card shimmer gold">
          <div className="h-stack between" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontSize: "var(--text-3xl)",
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Welcome, {firstName}.
              </h1>
              <p className="muted" style={{ marginTop: "var(--space-2)" }}>
                {coins && coins.earnedToday > 0
                  ? `You have earned ${formatCoins(coins.earnedToday)} coins today.`
                  : "Nothing played yet today."}
              </p>
            </div>

            <Link
              href="/coins"
              className="h-stack tight"
              style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}
            >
              <CoinMark size={44} />
              <div style={{ textAlign: "right" }}>
                <div className="hero-figure">{coins ? formatCoins(coins.balance) : "—"}</div>
                <div
                  className="muted"
                  style={{
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginTop: "var(--space-1)",
                  }}
                >
                  WTA Coins
                </div>
              </div>
            </Link>
          </div>

          {coins?.next && (
            <div style={{ marginTop: "var(--space-5)" }}>
              <div
                className="h-stack between"
                style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}
              >
                <span className="chip gold">{coins.title}</span>
                <span className="muted">
                  {formatCoins(coins.next.toGo)} to {coins.next.title}
                </span>
              </div>
              <div className="rail">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </section>

        {/* Results still locking, and how today's games were proven. */}
        <div style={{ marginTop: "var(--space-5)" }}>
          <ProofResults />
        </div>

        {/* ── The one action a host opens this page to take ── */}
        <div className="auto-grid" style={{ marginTop: "var(--space-5)" }}>
          <Link href="/run" className="action-card is-primary shimmer">
            <span className="glyph" aria-hidden="true">⚡</span>
            <span className="chip gold" style={{ alignSelf: "flex-start" }}>
              60 seconds
            </span>
            <span className="title">Run a night</span>
            <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Pick a game, pick how many are playing, go.
            </span>
          </Link>

          <Link href="/code" className="action-card">
            <span className="glyph" aria-hidden="true">🔢</span>
            <span className="chip" style={{ alignSelf: "flex-start" }}>
              Playing now?
            </span>
            <span className="title">Enter a game code</span>
            <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Type the code on the scorer&apos;s screen so your game counts as verified.
            </span>
          </Link>

          <Link href="/play/8ball" className="action-card">
            <span className="glyph" aria-hidden="true">🎱</span>
            <span className="chip" style={{ alignSelf: "flex-start" }}>
              +{formatCoins(3000)} a win
            </span>
            <span className="title">Play 8-ball</span>
            <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Against the AI or a friend. Free, and it counts.
            </span>
          </Link>

          <Link href="/tournaments" className="action-card">
            <span className="glyph" aria-hidden="true">🏆</span>
            <span className="chip" style={{ alignSelf: "flex-start" }}>
              {joined.length > 0 ? `${joined.length} entered` : "free to enter"}
            </span>
            <span className="title">Tournaments</span>
            <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {joined.length > 0 ? joined[0].name : "Find one to join."}
            </span>
          </Link>
        </div>

        {/* ── What you have actually done ── */}
        <div className="page-grid" style={{ marginTop: "var(--space-5)" }}>
          <section className="panel" style={{ padding: "var(--space-5)" }}>
            <div className="h-stack between" style={{ marginBottom: "var(--space-4)" }}>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>Recent coins</h2>
              <Link href="/coins" style={{ fontSize: "var(--text-sm)" }}>
                All of them
              </Link>
            </div>

            {recent.length === 0 ? (
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                Nothing yet. Play a frame and it appears here — win or lose, playing always
                earns.
              </p>
            ) : (
              <div className="v-stack" style={{ gap: "var(--space-2)" }}>
                {recent.map((entry) => (
                  <div key={entry.id} className="ledger-row">
                    <span style={{ fontSize: "var(--text-sm)", minWidth: 0, overflowWrap: "anywhere" }}>
                      {entry.description ?? entry.reason}
                    </span>
                    <span className="amount" style={{ fontSize: "var(--text-sm)" }}>
                      +{formatCoinsExact(entry.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="v-stack">
            <section className="panel" style={{ padding: "var(--space-5)" }}>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, marginBottom: "var(--space-4)" }}>
                Your record
              </h2>
              <div className="auto-grid narrow">
                <div className="stat">
                  <div className="stat-value">{wins}</div>
                  <div className="stat-label">nights won</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{coins ? formatCoins(coins.lifetime) : "—"}</div>
                  <div className="stat-label">coins all time</div>
                </div>
                <div className="stat">
                  <div className="stat-value">
                    {coins && coins.rank > 0 ? `#${coins.rank}` : "—"}
                  </div>
                  <div className="stat-label">on the board</div>
                </div>
              </div>
            </section>

            <section className="panel" style={{ padding: "var(--space-5)" }}>
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>No league night yet?</h2>
              <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 var(--space-4)" }}>
                The guide to starting one from nothing. Free, and it works on paper.
              </p>
              <Link
                className="button-secondary"
                href="/playbook"
                style={{ textDecoration: "none" }}
              >
                Read the playbook
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
