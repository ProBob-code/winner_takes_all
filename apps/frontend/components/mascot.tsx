/**
 * The WTA Tiger, the mascot.
 *
 * Poses are cut from the mascot sheet into public/mascot (listed in
 * _routes.json, or Pages hands them to the app and they 404). Each pose has
 * a job, from the sheet's "Use for" notes: the champion for wins, the coin
 * king for coins, the sulk for losses and dead ends, and so on.
 *
 * The scene poses carry their own dark backgrounds, so they sit in a framed
 * tile; "flat-*" are cut-outs with no background and float on any theme.
 */

import type { ReactNode } from "react";
import "@/components/mascot.css";

export const MASCOT = {
  champion: { src: "/mascot/champion.webp", alt: "The WTA Tiger holding a trophy aloft" },
  hustler: { src: "/mascot/hustler.webp", alt: "The WTA Tiger spinning an 8-ball on one finger" },
  break: { src: "/mascot/break.webp", alt: "The WTA Tiger lining up a break shot" },
  imposter: { src: "/mascot/imposter.webp", alt: "The WTA Tiger in a hood, finger to its lips" },
  roar: { src: "/mascot/roar.webp", alt: "The WTA Tiger roaring in celebration" },
  taunt: { src: "/mascot/taunt.webp", alt: "The WTA Tiger, arms folded: too easy" },
  sulk: { src: "/mascot/sulk.webp", alt: "The WTA Tiger sulking under a rain cloud" },
  "coin-king": { src: "/mascot/coin-king.webp", alt: "The WTA Tiger lounging on a pile of WTA Coins" },
  athlete: { src: "/mascot/athlete.webp", alt: "The WTA Tiger playing football, badminton and more" },
  gamer: { src: "/mascot/gamer.webp", alt: "The WTA Tiger in a gaming chair with a controller" },
  logo: { src: "/mascot/logo.webp", alt: "The WTA Tiger badge" },
  chibi: { src: "/mascot/chibi.webp", alt: "A chibi WTA Tiger winking" },
  "flat-pool": { src: "/mascot/flat-pool.webp", alt: "The WTA Tiger with a cue and an 8-ball" },
  "flat-trophy": { src: "/mascot/flat-trophy.webp", alt: "The WTA Tiger with a trophy and gear from every sport" },
} as const;

export type MascotPose = keyof typeof MASCOT;

/** The tiger on its own. Decorative by default: pass `label` when it says something. */
export function Mascot({
  pose,
  size = 160,
  className = "",
  label,
}: {
  pose: MascotPose;
  size?: number;
  className?: string;
  label?: string;
}) {
  const m = MASCOT[pose];
  const flat = pose.startsWith("flat-");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={m.src}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={size}
      height={flat ? Math.round(size * 1.1) : Math.round(size * 0.9)}
      loading="lazy"
      decoding="async"
      className={`wta-mascot${flat ? " flat" : ""} ${className}`.trim()}
      style={{ width: size, height: "auto" }}
    />
  );
}

/**
 * The tiger with a line to say: a framed strip used near the top of a page.
 * Still, never animated.
 */
export function MascotBanner({
  pose,
  title,
  children,
  action,
  tone = "gold",
}: {
  pose: MascotPose;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "gold" | "red" | "violet";
}) {
  return (
    <aside className={`mascot-banner tone-${tone}`}>
      <div className="mascot-banner-art">
        <Mascot pose={pose} size={180} />
      </div>
      <div className="mascot-banner-copy">
        <span className="mascot-banner-kicker">THE TIGER SAYS</span>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
        {action && <div className="mascot-banner-action">{action}</div>}
      </div>
    </aside>
  );
}
