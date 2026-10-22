"use client";

/**
 * Claims the day's visit coins and says so.
 *
 * Mounted once in the layout, so it fires wherever someone lands rather than
 * only on the coins page. The claim is idempotent on the server for the UTC
 * date, so opening the app repeatedly in a day pays once; this only has to
 * decide whether there is anything to announce.
 *
 * WHY A TOAST AND NOT A BADGE
 * Coins arriving silently is the complaint this answers — a balance that
 * changed while you were looking elsewhere teaches nobody anything. A toast
 * names the award and the amount, then leaves. It is not a dialog: nothing is
 * blocked behind it, because nothing about receiving coins needs a decision.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { CoinMark } from "@/components/coin-mark";
import { formatCoinsExact } from "@/lib/format";

interface Claim {
  awarded: number;
  award: { reason: string; amount: number; description: string } | null;
  firstEver: boolean;
  balance: number;
}

/** Keeps a second mount in the same tab from claiming twice over. */
const ONCE_PER_LOAD = "wta-daily-claimed";

export function CoinToast() {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback(() => {
    setLeaving(true);
    timers.current.push(window.setTimeout(() => setClaim(null), 280));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (sessionStorage.getItem(ONCE_PER_LOAD)) return;
      } catch {
        /* private window; the server is still the real guard */
      }

      try {
        const res = await backendFetch("/coins/daily", { method: "POST" });
        // Signed out is the common case on a public page, and is not a problem.
        if (res.status === 401) return;

        const payload: any = await res.json().catch(() => null);
        if (cancelled || !payload?.ok || !payload.awarded) return;

        try {
          sessionStorage.setItem(ONCE_PER_LOAD, "1");
        } catch {
          /* nothing to do */
        }

        setClaim(payload);
        // Long enough to read, short enough not to sit in the way.
        timers.current.push(window.setTimeout(dismiss, 6000));
      } catch {
        /* offline, or the API is unreachable. Coins can wait. */
      }
    };

    void run();
    const scheduled = timers.current;
    return () => {
      cancelled = true;
      scheduled.forEach((t) => window.clearTimeout(t));
    };
  }, [dismiss]);

  if (!claim?.award) return null;

  return (
    <div
      className={`coin-toast${leaving ? " leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="coin-toast-mark">
        <CoinMark size={34} />
      </span>

      <div className="coin-toast-body">
        <strong>
          +{formatCoinsExact(claim.awarded)} coins
        </strong>
        <span className="coin-toast-note">
          {claim.firstEver
            ? "Welcome — your first coins. Play a frame to earn more."
            : claim.award.description}
        </span>
      </div>

      <Link href="/coins" className="coin-toast-link" onClick={dismiss}>
        View
      </Link>

      <button
        type="button"
        className="coin-toast-close"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
