"use client";

/**
 * The splash: a fuse burns in, detonates on the wordmark, and the wordmark
 * collapses from "Winner.Takes.All" to "W.T.A".
 *
 * Lifted from the reference design (WTA Platform.dc.html) and rebuilt as a
 * component. The timing is the reference's: the whole thing runs 1.6s, the
 * impact lands at 60% of 1.3s, and the overlay fades out over the last 18%.
 *
 * SHOWN ONCE A SESSION, not once a page. A splash that replays on every
 * navigation stops being an entrance and becomes an obstacle, and this app is
 * used by someone standing at a pool table who wants the scoreboard now. It is
 * also skipped entirely for anyone who has asked not to be moved, and for the
 * full-bleed routes — the big screen, staff mode and the join page are all
 * things people look at mid-night, where a splash would be an interruption
 * rather than a welcome.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SESSION_KEY = "wta-splash-seen";

/** Where the particles fly. Eight, alternating amber and red. */
const PARTICLES = [
  { tx: "54px", ty: "-40px", color: "oklch(85% 0.17 92)" },
  { tx: "-62px", ty: "-28px", color: "oklch(62% 0.2 25)" },
  { tx: "70px", ty: "22px", color: "oklch(80% 0.16 92)" },
  { tx: "-48px", ty: "44px", color: "oklch(70% 0.15 25)" },
  { tx: "18px", ty: "-58px", color: "oklch(85% 0.17 92)" },
  { tx: "-24px", ty: "-52px", color: "oklch(62% 0.2 25)" },
  { tx: "40px", ty: "52px", color: "oklch(80% 0.16 92)" },
  { tx: "-70px", ty: "6px", color: "oklch(70% 0.15 25)" },
];

/** Routes that never get a splash. Matches the layout's bare routes. */
const NEVER = ["/display/", "/staff/", "/join/", "/play/"];

export function SplashScreen() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (NEVER.some((prefix) => pathname?.startsWith(prefix))) return;

    // Respect a reduced-motion preference: this animation is nothing but
    // motion, so the honest response is to skip it rather than soften it.
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch {
      /* no matchMedia; carry on */
    }

    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private windows and blocked site data throw here. Showing the splash
      // once per load is a better failure than crashing the app over it.
    }

    setVisible(true);
    const done = window.setTimeout(() => setVisible(false), 1650);
    return () => window.clearTimeout(done);
    // Deliberately on mount only: this is a session entrance, not a route one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div className="wta-splash" role="presentation" aria-hidden="true">
      <div className="wta-splash-grid" />

      <div className="wta-splash-stage">
        {/* The fuse, travelling in from the lower left. */}
        <span className="wta-fuse" />
        {/* The impact, at 60%. */}
        <span className="wta-shockwave" />
        <span className="wta-flash" />

        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="wta-particle"
            style={
              { "--tx": p.tx, "--ty": p.ty, background: p.color } as React.CSSProperties
            }
          />
        ))}

        <span className="wta-wordmark-full">
          <i>Winner</i>
          <b>.</b>
          <u>Takes</u>
          <b>.</b>
          <i>All</i>
        </span>

        <span className="wta-wordmark-short">
          <i>W</i>
          <b>.</b>
          <u>T</u>
          <b>.</b>
          <i>A</i>
        </span>
      </div>

      <div className="wta-splash-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
