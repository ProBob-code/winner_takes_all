"use client";

/**
 * A player's avatar, drawn from its parts.
 *
 * One 120×120 SVG, painted back to front: background, cue, hair that falls
 * behind the head, body and outfit, hijab, head, face, hair over the head,
 * headwear, extras. Every size uses the same drawing, so the 32px dot in a
 * leaderboard row and the large one on a profile are the same face.
 *
 * The parts are listed in lib/avatar.ts. Anything unknown falls back to the
 * player's generated default (resolveAvatar), so a bad row never draws a
 * broken face.
 */

import { useId, type ReactElement } from "react";
import {
  BACKGROUNDS,
  CLOTH_COLOURS,
  HAIR_COLOURS,
  SKIN_TONES,
  resolveAvatar,
  type AvatarConfig,
} from "@/lib/avatar";

const INK = "#231a15";

/** Darken or lighten a hex colour by `amount` (−1 to 1). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) =>
    Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** A five-pointed star centred on (cx, cy). */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** Headwear that covers the hair entirely, and headwear that hides only the top. */
const COVERS_ALL = new Set(["turban", "patka", "hijab"]);
const COVERS_TOP = new Set(["cap", "backwards-cap", "beanie", "bandana"]);

export function Avatar({
  avatar,
  seed,
  size = 48,
  title,
  className,
}: {
  /** The saved avatar, or null for the default generated from `seed`. */
  avatar?: AvatarConfig | null;
  /** The player's id: what the default is generated from. */
  seed: string;
  size?: number;
  /** Accessible name. Omit when the name is printed beside it. */
  title?: string;
  className?: string;
}) {
  // React ids can carry ":" or "«»"; keep only what is safe inside url(#…).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const a = resolveAvatar(avatar, seed);
  const skin = SKIN_TONES[a.skin] ?? SKIN_TONES["tone-4"];
  const skinShade = shade(skin, -0.18);
  const hair = HAIR_COLOURS[a.hairColour] ?? HAIR_COLOURS.black;
  const hat = CLOTH_COLOURS[a.headwearColour] ?? CLOTH_COLOURS.red;
  const top = CLOTH_COLOURS[a.outfitColour] ?? CLOTH_COLOURS.navy;
  const hidesAllHair = COVERS_ALL.has(a.headwear);
  const hidesTopHair = hidesAllHair || COVERS_TOP.has(a.headwear);
  const hijab = a.headwear === "hijab";

  const clip = `av-clip-${uid}`;
  const grad = `av-grad-${uid}`;

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
        <Background id={grad} kind={a.background} />
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect width="120" height="120" fill={`url(#${grad})`} />
        {a.background === "legend" && <LegendRays />}

        {a.accessory === "cue" && (
          <g>
            <line x1="92" y1="128" x2="110" y2="10" stroke="#c48a4a" strokeWidth="4.5" strokeLinecap="round" />
            <line x1="92" y1="128" x2="97" y2="94" stroke="#4a2c17" strokeWidth="5" strokeLinecap="round" />
            <line x1="109.4" y1="14" x2="110" y2="10" stroke="#f2f2ee" strokeWidth="4.5" strokeLinecap="round" />
            <circle cx="110.2" cy="8.5" r="2.4" fill="#4a90d9" />
          </g>
        )}

        {/* Hair that falls behind the head and shoulders. */}
        {!hidesAllHair && <HairBack style={a.hair} colour={hair} />}

        {/* Neck and body. */}
        {!hijab && <rect x="51" y="74" width="18" height="20" rx="4" fill={skinShade} />}
        <Outfit style={a.outfit} colour={top} skin={skin} />

        {hijab && (
          <path
            d="M20 120 Q20 98 30 86 Q22 66 27 46 Q32 15 60 15 Q88 15 93 46 Q98 66 90 86 Q100 98 100 120 Z"
            fill={hat}
          />
        )}

        {/* Ears, under the hijab when there is one. */}
        {!hijab && (
          <>
            <circle cx="35" cy="59" r="5.5" fill={skinShade} />
            <circle cx="85" cy="59" r="5.5" fill={skinShade} />
          </>
        )}

        <Head shape={a.face} skin={skin} />

        {hijab && (
          <path d="M33 50 Q34 25 60 25 Q86 25 87 50 Q76 34 60 34 Q44 34 33 50 Z" fill={shade(hat, -0.12)} />
        )}

        <Eyes style={a.eyes} brow={a.hair === "none" || hidesTopHair ? INK : shade(hair, -0.2)} />
        <FacialHair style={a.facialHair} colour={hair} />
        <Mouth style={a.mouth} />

        {!hidesTopHair && <HairFront style={a.hair} colour={hair} />}
        <Headwear style={a.headwear} colour={hat} />
        <Extra style={a.accessory} hidden={hijab} />
      </g>
      {title && <title>{title}</title>}
    </svg>
  );
}

function Background({ id, kind }: { id: string; kind: string }) {
  if (kind === "gold") {
    return (
      <radialGradient id={id} cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="#ffe27a" />
        <stop offset="100%" stopColor="#b8860b" />
      </radialGradient>
    );
  }
  if (kind === "neon") {
    return (
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#12c2b0" />
        <stop offset="100%" stopColor="#6b3fa0" />
      </linearGradient>
    );
  }
  if (kind === "sunset") {
    return (
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffb347" />
        <stop offset="55%" stopColor="#e05a8a" />
        <stop offset="100%" stopColor="#5a2d6e" />
      </linearGradient>
    );
  }
  const hex = BACKGROUNDS[kind] ?? BACKGROUNDS.felt;
  return (
    <radialGradient id={id} cx="50%" cy="35%" r="75%">
      <stop offset="0%" stopColor={shade(hex, 0.12)} />
      <stop offset="100%" stopColor={shade(hex, -0.15)} />
    </radialGradient>
  );
}

function LegendRays() {
  return (
    <g stroke="#e8b923" strokeWidth="5" opacity="0.35">
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (Math.PI / 6) * i;
        return (
          <line
            key={i}
            x1="60"
            y1="56"
            x2={60 + 90 * Math.cos(angle)}
            y2={56 + 90 * Math.sin(angle)}
          />
        );
      })}
    </g>
  );
}

function Head({ shape, skin }: { shape: string; skin: string }) {
  switch (shape) {
    case "oval":
      return <ellipse cx="60" cy="56" rx="23" ry="28" fill={skin} />;
    case "square":
      return <rect x="36" y="29" width="48" height="54" rx="17" fill={skin} />;
    case "heart":
      return <path d="M35 50 Q35 28 60 28 Q85 28 85 50 Q85 72 60 84 Q35 72 35 50 Z" fill={skin} />;
    default:
      return <circle cx="60" cy="56" r="26" fill={skin} />;
  }
}

function Eyes({ style, brow }: { style: string; brow: string }) {
  const brows =
    style === "focus" ? (
      <g stroke={brow} strokeWidth="2.6" strokeLinecap="round">
        <line x1="44" y1="46" x2="55" y2="49.5" />
        <line x1="76" y1="46" x2="65" y2="49.5" />
      </g>
    ) : (
      <g stroke={brow} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M44 48 Q49.5 44.5 55 47.5" />
        <path d="M65 47.5 Q70.5 44.5 76 48" />
      </g>
    );

  let eyes: ReactElement;
  switch (style) {
    case "smile":
      eyes = (
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M45.5 57.5 Q50 52.5 54.5 57.5" />
          <path d="M65.5 57.5 Q70 52.5 74.5 57.5" />
        </g>
      );
      break;
    case "sleepy":
      eyes = (
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M45.5 56 Q50 59.5 54.5 56" />
          <path d="M65.5 56 Q70 59.5 74.5 56" />
        </g>
      );
      break;
    case "wink":
      eyes = (
        <g>
          <circle cx="50" cy="56" r="3.2" fill={INK} />
          <path d="M65.5 57 Q70 52.5 74.5 57" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </g>
      );
      break;
    case "wide":
      eyes = (
        <g>
          <circle cx="50" cy="56" r="5.2" fill="#fff" />
          <circle cx="70" cy="56" r="5.2" fill="#fff" />
          <circle cx="50.8" cy="56.6" r="2.7" fill={INK} />
          <circle cx="70.8" cy="56.6" r="2.7" fill={INK} />
        </g>
      );
      break;
    case "focus":
      eyes = (
        <g fill={INK}>
          <ellipse cx="50" cy="56.5" rx="3.4" ry="2.4" />
          <ellipse cx="70" cy="56.5" rx="3.4" ry="2.4" />
        </g>
      );
      break;
    case "starry":
      eyes = (
        <g fill="#f5c518" stroke="#a67c00" strokeWidth="0.8">
          <polygon points={star(50, 56, 5.5)} />
          <polygon points={star(70, 56, 5.5)} />
        </g>
      );
      break;
    default:
      eyes = (
        <g fill={INK}>
          <circle cx="50" cy="56" r="3.2" />
          <circle cx="70" cy="56" r="3.2" />
        </g>
      );
  }

  return (
    <g>
      {brows}
      {eyes}
    </g>
  );
}

function Mouth({ style }: { style: string }) {
  switch (style) {
    case "grin":
    case "gold-tooth":
      return (
        <g>
          <path d="M50 67 Q60 80 70 67 Z" fill="#5a1f1f" />
          <path d="M51.5 67.5 L68.5 67.5 L67 70.5 L53 70.5 Z" fill="#fff" />
          {style === "gold-tooth" && <rect x="61" y="67.5" width="3.6" height="3" fill="#f5c518" />}
        </g>
      );
    case "flat":
      return <line x1="53" y1="70" x2="67" y2="70" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />;
    case "smirk":
      return <path d="M52 70 Q61 73.5 68 66.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
    case "open":
      return <ellipse cx="60" cy="70" rx="5" ry="4.2" fill="#5a1f1f" />;
    default:
      return <path d="M51.5 67.5 Q60 75.5 68.5 67.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  }
}

function FacialHair({ style, colour }: { style: string; colour: string }) {
  const moustache = <path d="M49.5 65.5 Q55 61.5 60 64.5 Q65 61.5 70.5 65.5 Q65 67.5 60 66.5 Q55 67.5 49.5 65.5 Z" fill={colour} />;
  switch (style) {
    case "stubble":
      return (
        <path
          d="M37 61 Q39 84 60 86 Q81 84 83 61 Q75 76 60 76 Q45 76 37 61 Z"
          fill={colour}
          opacity="0.28"
        />
      );
    case "moustache":
      return moustache;
    case "beard":
      return (
        <g>
          <path d="M35 56 Q35 89 60 91 Q85 89 85 56 Q81 72 70 75 Q60 71 50 75 Q39 72 35 56 Z" fill={colour} />
          {moustache}
        </g>
      );
    case "goatee":
      return (
        <g>
          <path d="M53.5 74.5 Q60 87 66.5 74.5 Q60 77.5 53.5 74.5 Z" fill={colour} />
          {moustache}
        </g>
      );
    case "handlebar":
      return (
        <path
          d="M44 61 Q46 69 53 66 Q57 63.5 60 65 Q63 63.5 67 66 Q74 69 76 61"
          stroke={colour}
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />
      );
    default:
      return null;
  }
}

function HairBack({ style, colour }: { style: string; colour: string }) {
  switch (style) {
    case "long":
      return <path d="M32 46 Q32 19 60 19 Q88 19 88 46 L90 96 Q60 104 30 96 Z" fill={shade(colour, -0.1)} />;
    case "afro":
      return <circle cx="60" cy="46" r="37" fill={colour} />;
    case "bun":
      return <circle cx="60" cy="21" r="10" fill={colour} />;
    case "top-knot":
      return <circle cx="60" cy="22" r="7.5" fill={colour} />;
    case "ponytail":
      return <ellipse cx="88" cy="64" rx="7" ry="17" transform="rotate(-14 88 64)" fill={shade(colour, -0.1)} />;
    default:
      return null;
  }
}

function HairFront({ style, colour }: { style: string; colour: string }) {
  switch (style) {
    case "buzz":
    case "top-knot":
      return <path d="M35 47 Q35 27 60 27 Q85 27 85 47 Q73 37 60 37 Q47 37 35 47 Z" fill={colour} opacity="0.92" />;
    case "short":
    case "bun":
    case "ponytail":
      return <path d="M33 51 Q31 23 60 22 Q89 23 87 51 Q81 35 64 34 Q45 34 33 51 Z" fill={colour} />;
    case "long":
      return <path d="M33 54 Q30 21 60 21 Q90 21 87 54 Q82 36 70 32 Q56 40 40 37 Q35 44 33 54 Z" fill={colour} />;
    case "side-part":
      return <path d="M34 52 Q31 22 60 22 Q90 23 86 52 Q84 38 72 33 Q58 40 40 38 Q36 44 34 52 Z" fill={colour} />;
    case "curly":
      return (
        <g fill={colour}>
          <circle cx="38" cy="43" r="8" />
          <circle cx="44" cy="33" r="9" />
          <circle cx="55" cy="27.5" r="9" />
          <circle cx="66" cy="27.5" r="9" />
          <circle cx="77" cy="33" r="9" />
          <circle cx="83" cy="43" r="8" />
        </g>
      );
    case "afro":
      return <path d="M35 46 Q60 31 85 46 Q85 29 60 27 Q35 29 35 46 Z" fill={shade(colour, -0.08)} />;
    case "mohawk":
      return (
        <g>
          <path d="M35 47 Q35 29 60 29 Q85 29 85 47 Q73 38 60 38 Q47 38 35 47 Z" fill={colour} opacity="0.35" />
          <path d="M53.5 42 Q51 8 60 6 Q69 8 66.5 42 Z" fill={colour} />
        </g>
      );
    default:
      return null;
  }
}

function Headwear({ style, colour }: { style: string; colour: string }) {
  const dark = shade(colour, -0.22);
  switch (style) {
    case "cap":
      return (
        <g>
          <path d="M32 47 Q32 21 60 21 Q88 21 88 47 Z" fill={colour} />
          <ellipse cx="60" cy="47" rx="32" ry="5.5" fill={dark} />
          <circle cx="60" cy="22" r="2.2" fill={dark} />
        </g>
      );
    case "backwards-cap":
      return (
        <g>
          <ellipse cx="60" cy="23" rx="15" ry="4" fill={dark} />
          <path d="M32 47 Q32 21 60 21 Q88 21 88 47 Z" fill={colour} />
          <rect x="52" y="40" width="16" height="7" rx="3" fill={dark} />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M32 48 Q32 17 60 17 Q88 17 88 48 Z" fill={colour} />
          <rect x="31" y="41" width="58" height="9" rx="4" fill={dark} />
          <circle cx="60" cy="15" r="5.5" fill="#f2f2ee" />
        </g>
      );
    case "turban":
      return (
        <g>
          <path d="M29 51 Q27 13 60 11 Q93 13 91 51 Q60 41 29 51 Z" fill={colour} />
          <g stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M33 41 Q60 23 87 41" />
            <path d="M39 30 Q62 18 83 31" />
          </g>
          <path d="M55.5 47 L60 35 L64.5 47 Z" fill={dark} />
        </g>
      );
    case "patka":
      return (
        <g>
          <circle cx="60" cy="23" r="10" fill={colour} />
          <path d="M33 48 Q33 23 60 23 Q87 23 87 48 Q60 41 33 48 Z" fill={colour} />
          <path d="M33 48 Q60 41 87 48" stroke={dark} strokeWidth="2" fill="none" />
        </g>
      );
    case "bandana":
      return (
        <g>
          <path d="M33 45 Q33 23 60 23 Q87 23 87 45 Q60 38 33 45 Z" fill={colour} />
          <path d="M85 41 L99 35 L95 47 Z" fill={dark} />
          <g fill="#fff" opacity="0.7">
            <circle cx="48" cy="33" r="1.4" />
            <circle cx="60" cy="29" r="1.4" />
            <circle cx="72" cy="33" r="1.4" />
          </g>
        </g>
      );
    case "visor":
      return (
        <g>
          <rect x="33" y="37" width="54" height="7" rx="3.5" fill={colour} />
          <ellipse cx="60" cy="45" rx="31" ry="5" fill={dark} />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M37 33 L41 13 L50.5 25 L60 9 L69.5 25 L79 13 L83 33 Z" fill="#f5c518" stroke="#a67c00" strokeWidth="1.5" />
          <circle cx="60" cy="27" r="2.8" fill="#c8102e" />
          <circle cx="47" cy="29" r="2" fill="#138a8a" />
          <circle cx="73" cy="29" r="2" fill="#138a8a" />
        </g>
      );
    default:
      return null;
  }
}

function Outfit({ style, colour, skin }: { style: string; colour: string; skin: string }) {
  const body = "M14 120 C14 98 34 90 60 90 C86 90 106 98 106 120 Z";
  const dark = shade(colour, -0.25);
  switch (style) {
    case "polo":
      return (
        <g>
          <path d={body} fill={colour} />
          <path d="M51 90.5 Q60 99 69 90.5 Z" fill={skin} />
          <path d="M49 90 L58 99 L53 90 Z" fill={dark} />
          <path d="M71 90 L62 99 L67 90 Z" fill={dark} />
          <circle cx="60" cy="104" r="1.4" fill={dark} />
          <circle cx="60" cy="110" r="1.4" fill={dark} />
        </g>
      );
    case "hoodie":
      return (
        <g>
          <path d={body} fill={colour} />
          <path d="M38 93 Q60 82 82 93 Q60 101 38 93 Z" fill={dark} />
          <path d="M51 91 Q60 97 69 91 Z" fill={skin} />
          <g stroke="#f2f2ee" strokeWidth="1.6" strokeLinecap="round">
            <line x1="55" y1="97" x2="54" y2="108" />
            <line x1="65" y1="97" x2="66" y2="108" />
          </g>
        </g>
      );
    case "jersey":
      return (
        <g>
          <path d={body} fill={colour} />
          <path d="M14 120 C14 106 18 99 26 95 L30 120 Z" fill="#f2f2ee" opacity="0.85" />
          <path d="M106 120 C106 106 102 99 94 95 L90 120 Z" fill="#f2f2ee" opacity="0.85" />
          <path d="M50 90.5 Q60 101 70 90.5 Z" fill={skin} />
          <text x="60" y="116" textAnchor="middle" fontSize="14" fontWeight="900" fill="#f2f2ee" fontFamily="system-ui, sans-serif">
            8
          </text>
        </g>
      );
    case "waistcoat":
      return (
        <g>
          <path d={body} fill="#f2f2ee" />
          <path d="M14 120 C14 98 34 90 50 90 L60 120 Z" fill={colour} />
          <path d="M106 120 C106 98 86 90 70 90 L60 120 Z" fill={colour} />
          <path d="M53 90.5 L60 98 L67 90.5 Z" fill={skin} />
          <circle cx="57" cy="106" r="1.4" fill={dark} />
          <circle cx="58.5" cy="113" r="1.4" fill={dark} />
        </g>
      );
    case "tuxedo":
      return (
        <g>
          <path d={body} fill="#1b1b1b" />
          <path d="M50 90 L60 120 L70 90 Z" fill="#f2f2ee" />
          <path d="M52.5 92 L60 95.5 L52.5 99 Z M67.5 92 L60 95.5 L67.5 99 Z" fill={colour} />
          <circle cx="60" cy="95.5" r="1.8" fill={dark} />
        </g>
      );
    default:
      return (
        <g>
          <path d={body} fill={colour} />
          <path d="M51 90.5 Q60 99 69 90.5 Z" fill={skin} />
        </g>
      );
  }
}

function Extra({ style, hidden }: { style: string; hidden: boolean }) {
  switch (style) {
    case "glasses":
      return (
        <g stroke={INK} strokeWidth="2" fill="rgba(255,255,255,0.18)">
          <rect x="42.5" y="51" width="15" height="11" rx="4" />
          <rect x="62.5" y="51" width="15" height="11" rx="4" />
          <line x1="57.5" y1="55" x2="62.5" y2="55" />
        </g>
      );
    case "shades":
      return (
        <g>
          <rect x="41.5" y="50.5" width="16.5" height="11" rx="4.5" fill="#111" />
          <rect x="62" y="50.5" width="16.5" height="11" rx="4.5" fill="#111" />
          <line x1="58" y1="54" x2="62" y2="54" stroke="#111" strokeWidth="2" />
          <path d="M44 53 L49 53" stroke="#fff" strokeWidth="1.4" opacity="0.6" strokeLinecap="round" />
          <path d="M64.5 53 L69.5 53" stroke="#fff" strokeWidth="1.4" opacity="0.6" strokeLinecap="round" />
        </g>
      );
    case "earring":
      return hidden ? null : <circle cx="35" cy="65.5" r="2.4" fill="#f5c518" stroke="#a67c00" strokeWidth="0.8" />;
    case "chalk":
      return (
        <g>
          <rect x="86" y="99" width="12" height="12" rx="1.5" fill="#3f7fc8" />
          <rect x="86" y="99" width="12" height="4" rx="1.5" fill="#7fb2ea" />
        </g>
      );
    case "medal":
      return (
        <g>
          <path d="M53 90 L60 104 L67 90 L63 90 L60 97 L57 90 Z" fill="#c8102e" />
          <circle cx="60" cy="108" r="6.5" fill="#f5c518" stroke="#a67c00" strokeWidth="1.2" />
          <polygon points={star(60, 108, 3.4)} fill="#a67c00" />
        </g>
      );
    default:
      return null;
  }
}
