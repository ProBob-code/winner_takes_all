"use client";

/**
 * What a night pays in WTA Coins, read from the API's published schedule.
 *
 * The schedule lives in apps/api/src/lib/coins.ts and is served at
 * /api/coins/rules. This reads it rather than copying the figures, so a change
 * to the economy cannot leave a page quoting the old numbers.
 */

import { useEffect, useState } from "react";
import { backendFetch } from "@/lib/backend";

export interface CoinSchedule {
  nightPlayed: number;
  framePlayed: number;
  frameWon: number;
  /** The champion's award: per player in the night when `perPlayer`, else flat. */
  nightWon: number;
  /** False only against an API from before the per-player schedule. */
  perPlayer: boolean;
  minPlayers: number;
}

export function useCoinSchedule(): CoinSchedule | null {
  const [schedule, setSchedule] = useState<CoinSchedule | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetch("/coins/rules");
        const data: any = await res.json().catch(() => null);
        const a = data?.awards;
        if (!res.ok || !a || cancelled) return;
        setSchedule({
          nightPlayed: Number(a.NIGHT_PLAYED) || 0,
          framePlayed: Number(a.FRAME_PLAYED) || 0,
          frameWon: Number(a.FRAME_WON) || 0,
          nightWon: Number(a.NIGHT_WON) || 0,
          perPlayer: data.nightWonPerPlayer === true,
          minPlayers: Number(data.minPlayers) || 2,
        });
      } catch {
        /* the figures are a nicety; the page works without them */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return schedule;
}

/** The champion's award for a night of `players`, as the server pays it. */
export function championCoins(schedule: CoinSchedule, players: number): number {
  if (!schedule.perPlayer) return schedule.nightWon;
  const field = Math.max(schedule.minPlayers, Math.floor(players) || 0);
  return schedule.nightWon * field;
}
