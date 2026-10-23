"use client";

/**
 * Art for everything in the shop: artifacts, avatar frames and emotes.
 * Original, pool-room themed, drawn as SVG so every size is sharp and nothing
 * is downloaded. The list of items is lib/shop.ts.
 */

import { useId, type ReactNode } from "react";
import { itemArt, RARITY_COLOUR } from "@/lib/shop";

const safeId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, "");

// ─────────────────────────── Artifacts ───────────────────────────

export function ArtifactArt({ id, size = 64 }: { id: string; size?: number }) {
  const uid = safeId(useId());
  const g = (name: string) => `${name}-${uid}`;
  const item = itemArt(id);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={item?.name ?? "Artifact"} style={{ display: "block" }}>
      <defs>
        <linearGradient id={g("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#e8b923" />
          <stop offset="1" stopColor="#a67c00" />
        </linearGradient>
        <linearGradient id={g("wood")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9a066" />
          <stop offset="1" stopColor="#8a5a2b" />
        </linearGradient>
        <radialGradient id={g("ball")} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={g("glow")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ArtifactBody id={id} g={g} />
    </svg>
  );
}

function ArtifactBody({ id, g }: { id: string; g: (n: string) => string }) {
  switch (id) {
    case "artifact.chalk-cube":
      return (
        <g>
          <path d="M14 24 L32 14 L50 24 L50 46 L32 56 L14 46 Z" fill="#2f6fb5" />
          <path d="M14 24 L32 14 L50 24 L32 34 Z" fill="#6fa8dc" />
          <path d="M32 34 L50 24 L50 46 L32 56 Z" fill="#1f4f86" />
          <ellipse cx="32" cy="24" rx="7" ry="3.6" fill="#1f4f86" opacity="0.6" />
        </g>
      );
    case "artifact.cue-tip":
      return (
        <g transform="rotate(-40 32 32)">
          <rect x="29" y="22" width="6" height="40" rx="2" fill={`url(#${g("wood")})`} />
          <rect x="29" y="14" width="6" height="9" fill="#f4f1e8" />
          <path d="M29 14 Q32 6 35 14 Z" fill="#2f6fb5" />
        </g>
      );
    case "artifact.bridge":
      return (
        <g>
          <line x1="12" y1="56" x2="40" y2="20" stroke={`url(#${g("wood")})`} strokeWidth="4" strokeLinecap="round" />
          <path d="M34 22 L52 8 M40 20 L54 20 M38 24 L50 34" stroke="#c9ced6" strokeWidth="3" strokeLinecap="round" />
          <circle cx="40" cy="20" r="4" fill="#8a9099" />
        </g>
      );
    case "artifact.rack":
      return (
        <g>
          <path d="M32 8 L58 54 L6 54 Z" fill="none" stroke={`url(#${g("wood")})`} strokeWidth="5" strokeLinejoin="round" />
          {[
            [32, 22, "#e8b923"], [26, 32, "#c8102e"], [38, 32, "#1f3a68"], [20, 42, "#6b3fa0"],
            [32, 42, "#111111"], [44, 42, "#e0701b"],
          ].map(([cx, cy, fill], i) => (
            <g key={i}>
              <circle cx={cx as number} cy={cy as number} r="5.4" fill={fill as string} />
              <circle cx={cx as number} cy={cy as number} r="5.4" fill={`url(#${g("ball")})`} />
            </g>
          ))}
        </g>
      );
    case "artifact.pocket-net":
      return (
        <g>
          <path d="M8 18 Q32 4 56 18" stroke="#3b2a20" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M12 20 Q32 64 52 20" fill="#f4f1e8" fillOpacity="0.12" stroke="#d9c39a" strokeWidth="1.6" />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${16 + i * 10} 21 Q32 ${50 - i} ${48 - i * 10} 22`} stroke="#d9c39a" strokeWidth="1" fill="none" />
          ))}
          <circle cx="32" cy="38" r="8" fill="#c8102e" />
          <circle cx="32" cy="38" r="8" fill={`url(#${g("ball")})`} />
        </g>
      );
    case "artifact.scoreboard":
      return (
        <g>
          <rect x="6" y="20" width="52" height="24" rx="4" fill={`url(#${g("wood")})`} />
          <line x1="10" y1="32" x2="54" y2="32" stroke="#3b2a20" strokeWidth="1.5" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={`a${i}`} cx={14 + i * 6} cy="32" r="2.8" fill="#f4f1e8" stroke="#3b2a20" strokeWidth="0.8" />
          ))}
          {[0, 1, 2].map((i) => (
            <circle key={`b${i}`} cx={50 - i * 6} cy="32" r="2.8" fill="#c8102e" stroke="#3b2a20" strokeWidth="0.8" />
          ))}
        </g>
      );
    case "artifact.cue-case":
      return (
        <g transform="rotate(-35 32 32)">
          <rect x="24" y="4" width="16" height="56" rx="8" fill="#6b4428" />
          <rect x="24" y="4" width="16" height="12" rx="6" fill="#4a2c17" />
          <rect x="24" y="26" width="16" height="4" fill="#d9a066" />
          <circle cx="32" cy="44" r="2" fill="#e8b923" />
        </g>
      );
    case "artifact.neon-sign":
      return (
        <g>
          <rect x="6" y="10" width="52" height="44" rx="8" fill="#141a2e" stroke="#2a3150" strokeWidth="2" />
          <g filter={`url(#${g("glow")})`} fill="none" strokeWidth="2.6" strokeLinecap="round">
            <circle cx="32" cy="26" r="6" stroke="#e05a8a" />
            <circle cx="32" cy="39" r="7.5" stroke="#e05a8a" />
            <path d="M14 48 H50" stroke="#12c2b0" />
          </g>
        </g>
      );
    case "artifact.diamond-cue":
      return (
        <g transform="rotate(-40 32 32)">
          <rect x="29" y="4" width="6" height="58" rx="2.5" fill="#1b1b1b" />
          <rect x="29" y="4" width="6" height="22" rx="2" fill={`url(#${g("wood")})`} />
          {[34, 42, 50].map((y) => (
            <path key={y} d={`M32 ${y - 3} L35 ${y} L32 ${y + 3} L29 ${y} Z`} fill="#e9f4ff" />
          ))}
          <rect x="29" y="2" width="6" height="3" fill="#f4f1e8" />
        </g>
      );
    case "artifact.golden-eight":
      return (
        <g>
          <circle cx="32" cy="32" r="24" fill={`url(#${g("gold")})`} />
          <circle cx="32" cy="32" r="11" fill="#fffaf0" />
          <text x="32" y="38" textAnchor="middle" fontSize="16" fontWeight="900" fill="#1b1b1b" fontFamily="system-ui, sans-serif">
            8
          </text>
          <circle cx="32" cy="32" r="24" fill={`url(#${g("ball")})`} />
        </g>
      );
    case "artifact.crown-rack":
      return (
        <g>
          <path d="M32 20 L56 58 L8 58 Z" fill="none" stroke={`url(#${g("gold")})`} strokeWidth="5" strokeLinejoin="round" />
          <path d="M18 18 L22 4 L28 12 L32 2 L36 12 L42 4 L46 18 Z" fill={`url(#${g("gold")})`} stroke="#a67c00" strokeWidth="1" />
          <circle cx="32" cy="11" r="1.8" fill="#c8102e" />
          {[
            [32, 36, "#c8102e"], [26, 47, "#111111"], [38, 47, "#e8b923"],
          ].map(([cx, cy, fill], i) => (
            <g key={i}>
              <circle cx={cx as number} cy={cy as number} r="5.6" fill={fill as string} />
              <circle cx={cx as number} cy={cy as number} r="5.6" fill={`url(#${g("ball")})`} />
            </g>
          ))}
        </g>
      );
    default:
      return <circle cx="32" cy="32" r="20" fill="#8a9099" />;
  }
}

// ─────────────────────────── Avatar frames ───────────────────────────

/**
 * An avatar inside its frame. `children` is the avatar drawn at `size`; the
 * ring is drawn over its edge, so a framed and an unframed avatar take the
 * same space on every screen.
 */
export function FramedAvatar({ borderId, size, children }: { borderId?: string | null; size: number; children: ReactNode }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {children}
      {borderId && (
        <BorderRing id={borderId} size={size} />
      )}
    </div>
  );
}

export function BorderRing({ id, size = 64 }: { id: string; size?: number }) {
  const uid = safeId(useId());
  const g = (name: string) => `${name}-${uid}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={g("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#e8b923" />
          <stop offset="1" stopColor="#a67c00" />
        </linearGradient>
        <filter id={g("glow")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <RingBody id={id} g={g} />
    </svg>
  );
}

function RingBody({ id, g }: { id: string; g: (n: string) => string }) {
  const studs = (n: number, r: number, fill: string, rad = 2.6) =>
    Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return <circle key={i} cx={50 + r * Math.cos(a)} cy={50 + r * Math.sin(a)} r={rad} fill={fill} />;
    });
  switch (id) {
    case "border.felt":
      return (
        <g fill="none">
          <circle cx="50" cy="50" r="47" stroke="#1f6b45" strokeWidth="6" />
          <circle cx="50" cy="50" r="43.5" stroke="#0f3d26" strokeWidth="1.2" />
        </g>
      );
    case "border.oak":
      return (
        <g fill="none">
          <circle cx="50" cy="50" r="47" stroke="#8a5a2b" strokeWidth="7" />
          <circle cx="50" cy="50" r="47" stroke="#d9a066" strokeWidth="1.4" strokeDasharray="10 6 4 8" />
          {studs(6, 47, "#f4f1e8", 1.8)}
        </g>
      );
    case "border.chalk":
      return (
        <g fill="none">
          <circle cx="50" cy="50" r="47" stroke="#6fa8dc" strokeWidth="5" />
          <circle cx="50" cy="50" r="47" stroke="#e9f4ff" strokeWidth="2.4" strokeDasharray="1 5" strokeLinecap="round" />
        </g>
      );
    case "border.neon":
      return (
        <g fill="none" filter={`url(#${g("glow")})`}>
          <circle cx="50" cy="50" r="47.5" stroke="#e05a8a" strokeWidth="2.6" />
          <circle cx="50" cy="50" r="43.5" stroke="#12c2b0" strokeWidth="2" />
        </g>
      );
    case "border.brass":
      return (
        <g fill="none">
          <circle cx="50" cy="50" r="47" stroke={`url(#${g("gold")})`} strokeWidth="6" />
          {studs(12, 47, "#7a5a10", 2.2)}
          {studs(12, 47, "#fff1a8", 1)}
        </g>
      );
    case "border.velvet":
      return (
        <g fill="none">
          <circle cx="50" cy="50" r="47" stroke="#8b1426" strokeWidth="7" />
          <circle cx="50" cy="50" r="47" stroke="#e8b923" strokeWidth="2" strokeDasharray="6 4" />
        </g>
      );
    case "border.gold":
      return (
        <g fill="none" filter={`url(#${g("glow")})`}>
          <circle cx="50" cy="50" r="47" stroke={`url(#${g("gold")})`} strokeWidth="8" />
          <circle cx="50" cy="50" r="42.5" stroke="#a67c00" strokeWidth="1" />
          {[-90, -30, 30, 90, 150, 210].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const x = 50 + 47 * Math.cos(a);
            const y = 50 + 47 * Math.sin(a);
            return <path key={deg} d={starPath(x, y, 4.2)} fill="#fffaf0" />;
          })}
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="47" fill="none" stroke="#8a9099" strokeWidth="4" />;
  }
}

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** A frame shown on its own, around an empty felt disc, for the shop. */
export function BorderPreview({ id, size = 64 }: { id: string; size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        <circle cx="50" cy="50" r="44" fill="#16150f" />
        <circle cx="50" cy="50" r="30" fill="#1f6b45" opacity="0.35" />
      </svg>
      <BorderRing id={id} size={size} />
    </div>
  );
}

// ─────────────────────────── Emotes ───────────────────────────

/** An emote: a speech bubble with its words, in its rarity's colour. */
export function EmoteArt({ id, size = 64 }: { id: string; size?: number }) {
  const item = itemArt(id);
  const colour = item ? RARITY_COLOUR[item.rarity] : "#8a9099";
  const text = item?.name ?? "?";
  const long = text.length > 7;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`Emote: ${text}`} style={{ display: "block" }}>
      <path d="M8 10 H56 A6 6 0 0 1 62 16 V40 A6 6 0 0 1 56 46 H26 L14 58 L16 46 H8 A6 6 0 0 1 2 40 V16 A6 6 0 0 1 8 10 Z" fill="#fffaf0" stroke={colour} strokeWidth="3" />
      <EmoteMark id={id} colour={colour} />
      <text
        x="32"
        y={id === "emote.crown" || id === "emote.on-fire" || id === "emote.clutch" ? 40 : 33}
        textAnchor="middle"
        fontSize={long ? 9 : 12}
        fontWeight="900"
        fill="#16150f"
        fontFamily="system-ui, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}

function EmoteMark({ id, colour }: { id: string; colour: string }) {
  switch (id) {
    case "emote.crown":
      return <path d="M22 26 L24 16 L29 21 L32 14 L35 21 L40 16 L42 26 Z" fill="#e8b923" stroke="#a67c00" strokeWidth="1" />;
    case "emote.on-fire":
      return <path d="M32 14 C38 20 38 24 35 28 C35 25 33 23 32 22 C31 25 27 26 28 29 C25 26 26 19 32 14 Z" fill="#e0701b" />;
    case "emote.clutch":
      return <path d="M34 13 L27 23 H32 L29 30 L37 20 H32 Z" fill={colour} />;
    default:
      return null;
  }
}

/** The right drawing for any item. */
export function ItemArt({ id, size = 64 }: { id: string; size?: number }) {
  if (id.startsWith("border.")) return <BorderPreview id={id} size={size} />;
  if (id.startsWith("emote.")) return <EmoteArt id={id} size={size} />;
  return <ArtifactArt id={id} size={size} />;
}
