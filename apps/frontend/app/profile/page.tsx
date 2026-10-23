"use client";

/**
 * The player's own profile: who they are on WTA, and what they have done.
 *
 * Coins, level and record up top; account details at the bottom. There is no
 * wallet here and no transfer form. Stakes are off, so there is no money to
 * show, and coins can never be sent to anyone else (lib/coins.ts in the API).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { formatCoins } from "@/lib/format";
import { PlayerHero, PlayerShowcase, PlayerStats, PlayerTrophies, type PlayerCardData } from "@/components/player-profile";
import { COINS_AWARDED_EVENT } from "@/components/coin-toast";

interface OwnProfile extends PlayerCardData {
  email: string;
  role: string;
}

interface LedgerEntry {
  id: string;
  amount: number;
  description: string | null;
  reason: string;
  at: string;
}

const ROLE_LABEL: Record<string, string> = {
  player: "Player",
  admin: "Admin",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<OwnProfile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await backendFetch("/user/profile", { cache: "no-store" });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data: any = await res.json().catch(() => null);
        if (!data?.user) {
          router.push("/login");
          return;
        }
        if (!cancelled) setUser(data.user);

        // The recent coins are a nicety; the profile stands without them.
        const l: any = await backendFetch("/coins/ledger?limit=5")
          .then((r) => r.json())
          .catch(() => null);
        if (!cancelled && l?.ok) setLedger(l.entries ?? []);
      } catch (err) {
        console.error("Profile fetch error:", err);
        router.push("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    // The day's first visit pays coins after this page has already read the
    // balance, which left the hero saying 0 beside a ledger showing +1K.
    // Read it again when the toast says coins have landed.
    const onAward = () => void load();
    window.addEventListener(COINS_AWARDED_EVENT, onAward);
    return () => {
      cancelled = true;
      window.removeEventListener(COINS_AWARDED_EVENT, onAward);
    };
  }, [router]);

  async function copyId() {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* the id is on screen to read either way */
    }
  }

  if (loading) {
    return (
      <main className="page">
        <div className="shell">
          <p className="muted">Loading your profile…</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="page profile-page">
      <div className="shell pp">
        <PlayerHero player={user} own />
        <PlayerStats player={user} />

        <div className="pp-grid">
          <PlayerTrophies player={user} />
          <PlayerShowcase player={user} own />
          <section className="pp-card">
            <div className="h-stack between" style={{ marginBottom: "0.85rem" }}>
              <h2 style={{ margin: 0 }}>Recent coins</h2>
              <Link href="/coins" className="muted" style={{ fontSize: "var(--text-sm)" }}>
                All coins →
              </Link>
            </div>
            {ledger.length === 0 ? (
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                Nothing yet. Every frame you play at a night earns coins, win or lose.
              </p>
            ) : (
              <div className="pp-rows">
                {ledger.map((e) => (
                  <div className="pp-row" key={e.id}>
                    <span>
                      {e.description || e.reason}
                      <span style={{ display: "block", fontSize: "var(--text-xs)" }}>
                        {formatDate(e.at)}
                      </span>
                    </span>
                    <span className="pp-gain">{e.amount < 0 ? `−${formatCoins(-e.amount)}` : `+${formatCoins(e.amount)}`}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pp-card">
            <h2>Account</h2>
            <div className="pp-rows">
              <div className="pp-row">
                <span>Email</span>
                <span>{user.email}</span>
              </div>
              <div className="pp-row">
                <span>Role</span>
                <span>{ROLE_LABEL[user.role] ?? user.role}</span>
              </div>
              <div className="pp-row">
                <span>Member since</span>
                <span>{formatDate(user.memberSince)}</span>
              </div>
              <div className="pp-row">
                <span>Player ID</span>
                <span>
                  <code>{user.id}</code>
                  <button type="button" className="pp-copy" onClick={copyId}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
