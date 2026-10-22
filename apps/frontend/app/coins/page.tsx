"use client";

// Rendered per request, not prerendered: this page reads the signed-in
// player's balance at mount.
export const dynamic = "force-dynamic";

/**
 * The WTA Coin.
 *
 * What a player earns for turning up and playing. Not money, and the page says
 * so prominently rather than in a footnote — a coin that is ambiguous about
 * whether it is money is a coin that gets the product prosecuted. India's
 * Promotion and Regulation of Online Gaming Act 2025 defines a prohibited
 * stake to include "credits, coins, and tokens equivalent or convertible to
 * money", so the whole design turns on the WTA Coin being neither.
 *
 * Deliberately shows the ledger. A balance a player cannot audit is just a
 * number the app asserts, and the thing that makes a non-monetary currency
 * feel real is being able to see exactly where every coin came from.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { CoinMark } from "@/components/coin-mark";
import { FlipCard } from "@/components/flip-card";
import { formatCoins, formatCoinsExact } from "@/lib/format";

interface Me {
  balance: number;
  lifetime: number;
  rank: number;
  title: string;
  next: { title: string; at: number; toGo: number } | null;
  earnedToday: number;
  dailyCap: number;
}

interface Entry {
  id: string;
  reason: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  at: string;
}

interface Leader {
  rank: number;
  userId: string;
  name: string;
  balance: number;
  title: string;
}

interface Rules {
  awards: Record<string, number>;
  /** NIGHT_WON is per player in the night when true; absent on an older API. */
  nightWonPerPlayer?: boolean;
  dailyCap: number;
  notice: string;
}

const EARN_LABELS: Array<{ key: string; label: string; note: string }> = [
  // The one award that is not for playing, so it leads: a new account has a
  // balance to look at before its first frame.
  { key: "DAILY_VISIT", label: "Sign in today", note: "A small amount once a day, just for coming back" },
  { key: "NIGHT_PLAYED", label: "Turn up", note: "Once a night, on your first frame" },
  { key: "FRAME_PLAYED", label: "Play a match", note: "Win or lose — losing never costs you" },
  { key: "FRAME_WON", label: "Win a match", note: "A small top-up on top of playing it. The big coins are for winning the night." },
  { key: "CLEARANCE", label: "Clear the table", note: "All seven and the black, one frame" },
  { key: "NIGHT_WON", label: "Win the night", note: "For every player in the night, so the champion takes more than everyone else combined." },
  // Counted over the nights the venue actually ran, not calendar weeks — a
  // venue skipping a week does not break anyone's run.
  { key: "STREAK", label: "Three nights running", note: "Three of a venue's nights in a row" },
  { key: "SEASON_WON", label: "Win the season", note: "Top of the table when it ends" },
  // Worth a fraction of the venue awards, and capped separately. The schedule
  // is where the product says league nights matter more than the sofa. Note
  // there is no "play online" row: losing to the machine pays nothing.
  { key: "ONLINE_WON", label: "Beat the machine", note: "Winner only — more for a harder AI" },
];

/**
 * Headline figures shorten — a balance is five or six digits from the first
 * league night, and "430K" is read at a glance where "4,30,000" is not. The
 * ledger uses the exact form instead: a figure a player cannot check is a
 * figure they have to take on trust, which is the opposite of the point.
 */
const coins = formatCoins;
const exact = formatCoinsExact;

export default function CoinsPage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [rulesRes, boardRes] = await Promise.all([
        backendFetch("/coins/rules"),
        backendFetch("/coins/leaderboard"),
      ]);
      const r: any = await rulesRes.json().catch(() => ({}));
      if (r?.ok) setRules(r);
      const b: any = await boardRes.json().catch(() => ({}));
      if (b?.ok) setLeaders(b.leaders ?? []);

      const meRes = await backendFetch("/coins/me");
      if (meRes.status === 401) {
        setSignedIn(false);
      } else {
        const m: any = await meRes.json().catch(() => ({}));
        if (m?.ok) setMe(m);
        const ledgerRes = await backendFetch("/coins/ledger?limit=40");
        const l: any = await ledgerRes.json().catch(() => ({}));
        if (l?.ok) setEntries(l.entries ?? []);
      }
    } catch {
      /* the rules and the board still render from whatever arrived */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = me?.next
    ? Math.min(100, Math.round((me.balance / me.next.at) * 100))
    : 100;

  return (
    <main className="page">
      <div className="shell">
        <header style={{ maxWidth: "46rem" }}>
          <div className="h-stack tight">
            <CoinMark size={44} />
            <div>
              <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 900, lineHeight: 1.1 }}>
                WTA Coin
              </h1>
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                What you earn for turning up and playing.
              </p>
            </div>
          </div>
        </header>

        {/* The sentence the whole design turns on. First, not in a footnote. */}
        <div
          className="panel"
          style={{ marginTop: "var(--space-5)", borderColor: "var(--gold-subtle)" }}
        >
          <strong style={{ display: "block", marginBottom: "var(--space-2)" }}>
            Coins are not money.
          </strong>
          <p className="muted" style={{ lineHeight: 1.8, fontSize: "var(--text-sm)" }}>
            {rules?.notice ??
              "WTA Coins have no cash value. They cannot be bought, sold, transferred, withdrawn or staked. They are a record of what you have played, like a league table."}
          </p>
        </div>

        {loading ? (
          <p className="muted" style={{ marginTop: "var(--space-6)" }}>
            Counting your coins…
          </p>
        ) : !signedIn ? (
          <div className="panel v-stack" style={{ marginTop: "var(--space-5)" }}>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>
              Sign in to start earning
            </h2>
            <p className="muted">
              Coins attach to an account, so they survive from one league night to the next.
              Playing as a walk-in still gets you on the board for the night — it just
              cannot carry over.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => router.push("/login")}
              style={{ alignSelf: "flex-start" }}
            >
              Sign in
            </button>
          </div>
        ) : (
          me && (
            <section
              className="panel"
              style={{
                marginTop: "var(--space-5)",
                background:
                  "linear-gradient(135deg, var(--gold-subtle), transparent 60%)",
                borderColor: "var(--gold)",
              }}
            >
              <div className="h-stack between" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="h-stack tight">
                    <CoinMark size={52} />
                    <div>
                      <div
                        style={{
                          fontSize: "var(--text-3xl)",
                          fontWeight: 900,
                          fontFamily: "var(--font-outfit), system-ui, sans-serif",
                          lineHeight: 1,
                        }}
                      >
                        {coins(me.balance)}
                      </div>
                      <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                        {exact(me.balance)} WTA Coins
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="chip gold">{me.title}</span>
                  {me.rank > 0 && (
                    <div className="muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
                      #{me.rank} overall
                    </div>
                  )}
                </div>
              </div>

              {me.next && (
                <div style={{ marginTop: "var(--space-5)" }}>
                  <div
                    className="h-stack between"
                    style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}
                  >
                    <span className="muted">
                      {coins(me.next.toGo)} to {me.next.title}
                    </span>
                    <span className="muted">
                      {coins(me.balance)} / {coins(me.next.at)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      background: "var(--bg-inset)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "var(--gradient-gold)",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="auto-grid narrow" style={{ marginTop: "var(--space-5)" }}>
                <div className="stat">
                  <div className="stat-value">{coins(me.lifetime)}</div>
                  <div className="stat-label">earned all time</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{coins(me.earnedToday)}</div>
                  <div className="stat-label">earned today</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{coins(me.dailyCap)}</div>
                  <div className="stat-label">daily limit</div>
                </div>
              </div>
            </section>
          )
        )}

        <section style={{ marginTop: "var(--space-7)" }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="sticker gold">Tap a card</span>
            <h2>How you <em>earn</em></h2>
          </div>
          <p className="muted" style={{ marginTop: "var(--space-2)", maxWidth: "40rem" }}>
            Small coins for every match you play and win. The champion of the night takes
            the majority — and losing never costs you a coin.
          </p>

          <div className="flip-grid wta-deal" style={{ marginTop: "var(--space-5)" }}>
            {EARN_LABELS.filter((e) => rules?.awards?.[e.key]).map((e, i) => {
              const perPlayer = e.key === "NIGHT_WON" && rules?.nightWonPerPlayer === true;
              const amount = `+${coins(rules!.awards[e.key])}`;
              const champion = e.key === "NIGHT_WON";
              return (
                <FlipCard
                  key={e.key}
                  minHeight="12rem"
                  frontTone={champion ? "gold" : i % 2 === 0 ? "ink" : "gold"}
                  label={`${e.label}: ${amount}${perPlayer ? " per player" : ""}. ${e.note}`}
                  front={
                    <>
                      <span className="label">{champion ? "The big one" : `Award ${i + 1}`}</span>
                      <span className="flip-title">{e.label}</span>
                      <span className="big-num" style={{ fontSize: "2.4rem" }}>
                        {amount}
                        {perPlayer && (
                          <span style={{ fontSize: "0.85rem", marginLeft: "0.35rem", letterSpacing: 0 }}>per player</span>
                        )}
                      </span>
                    </>
                  }
                  back={
                    <>
                      <span className="label">{e.label}</span>
                      <span className="flip-text" style={{ fontSize: "1.05rem" }}>{e.note}</span>
                      <span className="flip-text" style={{ color: "var(--gold-fill)" }}>{amount}{perPlayer ? " × players" : ""}</span>
                    </>
                  }
                />
              );
            })}
          </div>
        </section>

        {entries.length > 0 && (
          <section style={{ marginTop: "var(--space-7)" }}>
            <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Where yours came from</h2>
            <p className="muted" style={{ marginTop: "var(--space-2)" }}>
              Every coin, and what it was for. Check the arithmetic yourself.
            </p>
            <div className="table-scroll" style={{ marginTop: "var(--space-4)" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>When</th>
                    <th style={{ textAlign: "right" }}>Coins</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.description ?? e.reason}</td>
                      <td className="muted">
                        {new Date(e.at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--gold)", fontWeight: 700 }}>
                        +{exact(e.amount)}
                      </td>
                      <td style={{ textAlign: "right" }} className="muted">
                        {exact(e.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section style={{ marginTop: "var(--space-7)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>Most coins</h2>
          <div className="table-scroll" style={{ marginTop: "var(--space-4)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Title</th>
                  <th style={{ textAlign: "right" }}>Coins</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l) => (
                  <tr key={l.userId}>
                    <td className="muted">{l.rank}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{l.name}</td>
                    <td>
                      <span className="chip">{l.title}</span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{coins(l.balance)}</td>
                  </tr>
                ))}
                {leaders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Nobody has earned a coin yet. Be first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="h-stack" style={{ marginTop: "var(--space-7)" }}>
          <Link className="button" href="/run" style={{ textDecoration: "none" }}>
            Run a night
          </Link>
          <Link className="button-secondary" href="/tournaments" style={{ textDecoration: "none" }}>
            Find a tournament
          </Link>
        </div>
      </div>
    </main>
  );
}
