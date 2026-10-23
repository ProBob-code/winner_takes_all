"use client";

/**
 * A trophy count's badge: a cup on a shield in its arena's colours.
 *
 * Original art. The arena comes from the trophies (lib/trophies.ts), so the
 * same number always wears the same colours wherever it appears.
 */

import { useId } from "react";
import { arenaIdFor, arenaStyle } from "@/lib/trophies";

export function TrophyBadge({
  trophies,
  arenaId,
  size = 40,
  title,
}: {
  trophies: number;
  /** Optional: the arena the API already worked out. */
  arenaId?: string;
  size?: number;
  title?: string;
}) {
  // React ids can carry ":" or "«»"; keep only what is safe inside url(#…).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = arenaId ?? arenaIdFor(trophies);
  const style = arenaStyle(id);
  const grad = `tb-${uid}`;
  const top = id === "the-crown";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? `${trophies} trophies, ${style.name}`}
      style={{ display: "block", flexShrink: 0, filter: top ? "drop-shadow(0 0 6px rgba(255,215,0,0.6))" : undefined }}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={style.from_colour} />
          <stop offset="100%" stopColor={style.to_colour} />
        </linearGradient>
      </defs>
      {/* Shield. */}
      <path d="M32 3 L57 11 V30 C57 45 46 55 32 61 C18 55 7 45 7 30 V11 Z" fill={`url(#${grad})`} stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      <path d="M32 7 L53 14 V30 C53 42.5 44 51 32 56.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      {/* Cup. */}
      <g fill="#ffd34d" stroke="#8a6200" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M22 16 H42 V24 C42 31 37.5 35 32 35 C26.5 35 22 31 22 24 Z" />
        <path d="M22 18.5 H16.5 C16.5 25 19 28 23 28.5" fill="none" strokeWidth="2.2" stroke="#ffd34d" />
        <path d="M42 18.5 H47.5 C47.5 25 45 28 41 28.5" fill="none" strokeWidth="2.2" stroke="#ffd34d" />
        <rect x="29.5" y="35" width="5" height="5" />
        <path d="M24 44 H40 L38 40 H26 Z" />
      </g>
      <path d="M26 19 V24 C26 27 27.5 29.5 30 31" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
