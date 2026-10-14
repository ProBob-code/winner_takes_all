"use client";

/**
 * The splash: a fuse burns in, detonates on the wordmark, and the wordmark
 * collapses from "Winner.Takes.All" to "W.T.A".
 *
 * SHOWN ON EVERY LOAD, EVERYWHERE.
 *
 * It used to be gated to once a session and skipped on the full-bleed routes,
 * which is why it seemed never to appear: sessionStorage survives a reload, so
 * after the first view in a tab it never ran again. Both gates are gone.
 *
 * It still does not replay on client-side navigation between pages — this runs
 * on mount of the layout, which happens once per document load. That is the
 * behaviour you want: it is an entrance to the app, not a transition between
 * its pages, and a 1.6s animation between every tap would make the app
 * unusable behind a bar.
 *
 * REDUCED MOTION gets a still version rather than nothing. The animation is a
 * detonation with a screen shake, which is exactly what that preference exists
 * to prevent, but the splash should still appear for everyone — so those
 * viewers get the wordmark, held and faded, with no movement.
 */

import { useEffect, useState } from "react";

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

export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* no matchMedia; treat as full motion */
    }

    setStill(reduced);
    setVisible(true);

    const done = window.setTimeout(() => setVisible(false), reduced ? 1200 : 1650);
    return () => window.clearTimeout(done);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`wta-splash${still ? " still" : ""}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="wta-splash-grid" />

      <div className="wta-splash-stage">
        {!still && (
          <>
            <span className="wta-fuse" />
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
          </>
        )}

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
