"use client";

/**
 * The badge for a level: a medallion in its band's metal, the band's emblem,
 * the level number, and a pip for each step through the band.
 *
 * Bands and colours are in lib/progression.ts; the level itself comes from the
 * API. Original art throughout.
 */

import { useId } from "react";
import { bandStyle } from "@/lib/progression";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `#${((1 << 24) | (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255)).toString(16).slice(1)}`;
}

function Emblem({ kind, colour }: { kind: string; colour: string }) {
  switch (kind) {
    case "star":
      return <polygon points="32,13 35.5,22 45,22.5 37.5,28.5 40,38 32,32.5 24,38 26.5,28.5 19,22.5 28.5,22" fill={colour} opacity="0.35" />;
    case "fin":
      return <path d="M20 38 Q30 30 33 12 Q38 28 46 38 Z" fill={colour} opacity="0.35" />;
    case "cues":
      return (
        <g stroke={colour} strokeWidth="3.5" strokeLinecap="round" opacity="0.4">
          <line x1="18" y1="42" x2="46" y2="14" />
          <line x1="46" y1="42" x2="18" y2="14" />
        </g>
      );
    case "crown":
      return <path d="M17 36 L19 18 L26 26 L32 14 L38 26 L45 18 L47 36 Z" fill={colour} opacity="0.38" />;
    default:
      return <circle cx="32" cy="28" r="13" fill="none" stroke={colour} strokeWidth="3" opacity="0.35" />;
  }
}

export function LevelBadge({
  level,
  bandId,
  bandName,
  pip,
  pips,
  size = 44,
}: {
  level: number;
  bandId: string;
  bandName?: string;
  /** Step within the band, from 1, and how many steps it has (null = open). */
  pip?: number;
  pips?: number | null;
  size?: number;
}) {
  // React ids can carry ":" or "«»"; keep only what is safe inside url(#…).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const style = bandStyle(bandId);
  const metal = `lb-metal-${uid}`;
  const steps = pips && pips > 0 ? Math.min(pips, 11) : 0;
  const filled = pip ? Math.min(pip, steps) : 0;
  const digits = String(level).length;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={bandName ? `Level ${level}, ${bandName}` : `Level ${level}`}
      style={{ display: "block", flexShrink: 0, filter: style.glow ? "drop-shadow(0 0 6px rgba(255,215,0,0.65))" : undefined }}
    >
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(style.fill, 0.35)} />
          <stop offset="55%" stopColor={style.fill} />
          <stop offset="100%" stopColor={shade(style.fill, -0.25)} />
        </linearGradient>
      </defs>
      {/* An eight-sided medallion: reads as a badge, not a coin. */}
      <polygon points="21,3 43,3 59,19 59,41 43,57 21,57 5,41 5,19" fill={style.rim} />
      <polygon points="22.5,7 41.5,7 55,20.5 55,39.5 41.5,53 22.5,53 9,39.5 9,20.5" fill={`url(#${metal})`} />
      <Emblem kind={style.emblem} colour={style.rim} />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        fontSize={digits >= 3 ? 16 : digits === 2 ? 21 : 24}
        fontWeight="900"
        fill={style.rim}
        fontFamily="Anton, Impact, system-ui, sans-serif"
      >
        {level}
      </text>
      {steps > 1 &&
        Array.from({ length: steps }, (_, i) => {
          const spread = Math.min(4.2, 36 / steps);
          const x = 32 - ((steps - 1) * spread) / 2 + i * spread;
          return <circle key={i} cx={x} cy="60.5" r="1.5" fill={i < filled ? style.rim : shade(style.rim, 0.55)} />;
        })}
    </svg>
  );
}
