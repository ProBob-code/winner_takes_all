"use client";

// Rendered per request: the id comes from the router at mount. See
// app/display/[id] for why these pages are not prerendered.
export const dynamic = "force-dynamic";

/**
 * Anyone's profile, read-only. Where a name on the leaderboard leads.
 *
 * The same hero and record as the owner's own page (components/
 * player-profile.tsx), from the same API card, minus everything private: no
 * email, no role, no ledger and no balance, only coins collected.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { PlayerHero, PlayerShowcase, PlayerStats, PlayerTrophies, type PlayerCardData } from "@/components/player-profile";

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const [player, setPlayer] = useState<PlayerCardData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetch(`/players/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data: any = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.status === 404) return setState("missing");
        if (!res.ok || !data?.player) return setState("error");
        setPlayer(data.player);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="page">
      <div className="shell pp">
        {state === "loading" && <p className="muted">Loading…</p>}
        {state === "missing" && (
          <section className="pp-card">
            <h2>No player by that ID</h2>
            <p className="muted">
              The link may be mistyped. <Link href="/leaderboard">Back to the rankings</Link>
            </p>
          </section>
        )}
        {state === "error" && (
          <section className="pp-card">
            <h2>Could not load this player</h2>
            <p className="muted">Check your connection and try again.</p>
          </section>
        )}
        {state === "ready" && player && (
          <>
            <PlayerHero player={player} own={false} />
            <PlayerStats player={player} />
            <PlayerTrophies player={player} />
            <PlayerShowcase player={player} own={false} />
          </>
        )}
      </div>
    </main>
  );
}
