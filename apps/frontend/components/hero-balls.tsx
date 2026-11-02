"use client";

/**
 * Sports balls drifting through the homepage hero, as if in space.
 *
 * Each one floats on its own slow course, spinning, and bounces off the
 * hero's edges and off the words: the headline, description and buttons are
 * a solid block the balls never cross, so the text always reads clearly. Tap or click one and it is kicked off on a new course with a
 * burst of speed that eases back to a drift. Homepage hero only.
 *
 * Positions are written straight to each element's transform every frame, so
 * React never re-renders while they move. The loop stops when the hero is off
 * screen or the tab is hidden. With reduced motion asked for, the balls sit
 * still until one is clicked, then glide and come to rest.
 */

import { useEffect, useRef } from "react";

type Kind =
  | "eight" | "stripe" | "tennis" | "football" | "shuttle"
  | "cricket" | "pingpong" | "pickleball" | "paddle";

const KINDS: Array<{ kind: Kind; label: string }> = [
  { kind: "eight", label: "8-ball" },
  { kind: "tennis", label: "Tennis ball" },
  { kind: "football", label: "Football" },
  { kind: "shuttle", label: "Shuttlecock" },
  { kind: "cricket", label: "Cricket ball" },
  { kind: "pingpong", label: "Table tennis ball" },
  { kind: "stripe", label: "Pool ball" },
  { kind: "pickleball", label: "Pickleball" },
  { kind: "paddle", label: "Table tennis paddle" },
];

/** Cruising speed, in px a second, that a kicked ball eases back to. */
const CRUISE = 26;

function BallArt({ kind, id }: { kind: Kind; id: string }) {
  const shade = (
    <radialGradient id={`${id}-shade`} cx="35%" cy="30%" r="75%">
      <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
      <stop offset="45%" stopColor="#fff" stopOpacity="0" />
      <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
    </radialGradient>
  );
  const gloss = <circle cx="32" cy="32" r="30" fill={`url(#${id}-shade)`} />;

  switch (kind) {
    case "eight":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>{shade}</defs>
          <circle cx="32" cy="32" r="30" fill="#111" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
          <circle cx="32" cy="30" r="12" fill="#fff" />
          <text x="32" y="35.5" textAnchor="middle" fontSize="15" fontWeight="900" fontFamily="Arial, sans-serif" fill="#111">8</text>
          {gloss}
        </svg>
      );
    case "stripe":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>
            {shade}
            <clipPath id={`${id}-c`}><circle cx="32" cy="32" r="30" /></clipPath>
          </defs>
          <circle cx="32" cy="32" r="30" fill="#f4f1ea" />
          <rect x="0" y="17" width="64" height="30" fill="#c8102e" clipPath={`url(#${id}-c)`} />
          <circle cx="32" cy="32" r="10" fill="#f4f1ea" />
          <text x="32" y="36.5" textAnchor="middle" fontSize="12" fontWeight="900" fontFamily="Arial, sans-serif" fill="#111">11</text>
          {gloss}
        </svg>
      );
    case "tennis":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>{shade}</defs>
          <circle cx="32" cy="32" r="30" fill="#c9e43a" />
          <path d="M8 14 C24 24 24 40 8 50" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M56 14 C40 24 40 40 56 50" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
          {gloss}
        </svg>
      );
    case "football":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>
            {shade}
            <clipPath id={`${id}-c`}><circle cx="32" cy="32" r="30" /></clipPath>
          </defs>
          <circle cx="32" cy="32" r="30" fill="#fafafa" />
          <g fill="#151515" clipPath={`url(#${id}-c)`}>
            <polygon points="32,20 43,28 39,41 25,41 21,28" />
            <polygon points="32,0 40,6 32,11 24,6" />
            <polygon points="60,22 64,34 56,36 52,26" />
            <polygon points="4,22 12,26 8,36 0,34" />
            <polygon points="46,56 52,48 58,54 52,62" />
            <polygon points="18,56 12,62 6,54 12,48" />
          </g>
          <g stroke="#151515" strokeWidth="1.6" clipPath={`url(#${id}-c)`}>
            <line x1="32" y1="20" x2="32" y2="11" />
            <line x1="43" y1="28" x2="52" y2="26" />
            <line x1="21" y1="28" x2="12" y2="26" />
            <line x1="39" y1="41" x2="47" y2="50" />
            <line x1="25" y1="41" x2="17" y2="50" />
          </g>
          {gloss}
        </svg>
      );
    case "shuttle":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path d="M22 26 L6 6 L58 6 L42 26 Z" fill="#f7f7f2" stroke="#d6d6cc" strokeWidth="1.5" strokeLinejoin="round" />
          <g stroke="#cfcfc4" strokeWidth="1.2">
            <line x1="25" y1="26" x2="14" y2="6" />
            <line x1="29" y1="26" x2="25" y2="6" />
            <line x1="35" y1="26" x2="39" y2="6" />
            <line x1="39" y1="26" x2="50" y2="6" />
          </g>
          <rect x="21" y="25" width="22" height="5" rx="1.5" fill="#e23b3b" />
          <path d="M21 30 H43 V40 A11 11 0 0 1 21 40 Z" fill="#f2e6cf" />
          <path d="M24 33 H40 V40 A8 8 0 0 1 24 40 Z" fill="#fff" opacity="0.35" />
        </svg>
      );
    case "cricket":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>{shade}</defs>
          <circle cx="32" cy="32" r="30" fill="#9b1b1b" />
          <path d="M14 8 C26 22 26 42 14 56" fill="none" stroke="#f3e9d2" strokeWidth="1.6" />
          <path d="M19 6 C31 21 31 43 19 58" fill="none" stroke="#f3e9d2" strokeWidth="1.6" />
          <path d="M16.5 7 C28.5 21.5 28.5 42.5 16.5 57" fill="none" stroke="#f3e9d2" strokeWidth="3" strokeDasharray="1.5 3" />
          {gloss}
        </svg>
      );
    case "pingpong":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>{shade}</defs>
          <circle cx="32" cy="32" r="30" fill="#ff8a1f" />
          {gloss}
        </svg>
      );
    case "pickleball":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>{shade}</defs>
          <circle cx="32" cy="32" r="30" fill="#f2d13a" />
          <g fill="#b9981a">
            <circle cx="32" cy="14" r="4" />
            <circle cx="16" cy="26" r="4" />
            <circle cx="48" cy="26" r="4" />
            <circle cx="22" cy="44" r="4" />
            <circle cx="42" cy="44" r="4" />
            <circle cx="32" cy="31" r="4" />
          </g>
          {gloss}
        </svg>
      );
    case "paddle":
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <defs>
            <radialGradient id={`${id}-blade`} cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#ff5a5a" />
              <stop offset="100%" stopColor="#a8121a" />
            </radialGradient>
          </defs>
          <rect x="28" y="40" width="9" height="22" rx="4" fill="#c58b4f" transform="rotate(-35 32 40)" />
          <rect x="28" y="40" width="9" height="6" rx="2" fill="#8a5a2b" transform="rotate(-35 32 40)" />
          <circle cx="28" cy="26" r="22" fill={`url(#${id}-blade)`} stroke="#3a0d0d" strokeWidth="2" />
        </svg>
      );
  }
}

interface Body {
  x: number; y: number; vx: number; vy: number;
  angle: number; spin: number; size: number;
  pop: number;
}

export function HeroBalls() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const ballRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const bodies = useRef<Body[]>([]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    let w = field.clientWidth;
    let h = field.clientHeight;
    const small = w < 640;

    // The words: one box around everything in the hero but the balls, a
    // little larger, measured against the field. Remeasured when anything
    // resizes (web fonts arriving change the headline's size).
    const PAD = small ? 8 : 14;
    let block = { l: 0, t: 0, r: 0, b: 0 };
    function measure() {
      const hero = field!.parentElement;
      if (!hero) return;
      const f = field!.getBoundingClientRect();
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const child of Array.from(hero.children)) {
        if (child === field || child.tagName === "STYLE") continue;
        const rc = child.getBoundingClientRect();
        if (rc.width === 0 || rc.height === 0) continue;
        l = Math.min(l, rc.left); t = Math.min(t, rc.top); r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
      }
      if (l === Infinity) return;
      block = { l: l - f.left - PAD, t: t - f.top - PAD, r: r - f.left + PAD, b: b - f.top + PAD };
    }
    measure();

    const overlapsBlock = (x: number, y: number, size: number) =>
      x + size > block.l && x < block.r && y + size > block.t && y < block.b;

    bodies.current = KINDS.map(() => {
      const size = small ? rand(30, 42) : rand(48, 72);
      const dir = rand(0, Math.PI * 2);
      const speed = still ? 0 : rand(CRUISE * 0.6, CRUISE * 1.3);
      // Somewhere clear of the words.
      let x = 0, y = 0;
      for (let tries = 0; tries < 80; tries++) {
        x = rand(0, Math.max(1, w - size));
        y = rand(0, Math.max(1, h - size));
        if (!overlapsBlock(x, y, size)) break;
      }
      return {
        x,
        y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        angle: rand(0, 360),
        spin: still ? 0 : rand(-25, 25),
        size,
        pop: 0,
      };
    });
    bodies.current.forEach((b, i) => {
      const el = ballRefs.current[i];
      if (el) { el.style.width = `${b.size}px`; el.style.height = `${b.size}px`; }
    });

    /** A ball against the words: pushed back out, and bounced like off a wall. */
    function bounceOffBlock(b: Body) {
      const r = b.size / 2;
      const cx = b.x + r, cy = b.y + r;
      const px = Math.max(block.l, Math.min(cx, block.r));
      const py = Math.max(block.t, Math.min(cy, block.b));
      let dx = cx - px, dy = cy - py;
      const d = Math.hypot(dx, dy);
      if (d >= r) return;
      let nx: number, ny: number;
      if (d === 0) {
        // Centre inside the block (a resize moved the words onto it): out by
        // the nearest side.
        const gaps = [cx - block.l, block.r - cx, cy - block.t, block.b - cy];
        const m = gaps.indexOf(Math.min(...gaps));
        nx = m === 0 ? -1 : m === 1 ? 1 : 0;
        ny = m === 2 ? -1 : m === 3 ? 1 : 0;
        const edgeX = m === 0 ? block.l : m === 1 ? block.r : cx;
        const edgeY = m === 2 ? block.t : m === 3 ? block.b : cy;
        dx = 0; dy = 0;
        b.x = edgeX + nx * r - r;
        b.y = edgeY + ny * r - r;
      } else {
        nx = dx / d; ny = dy / d;
        b.x = px + nx * r - r;
        b.y = py + ny * r - r;
      }
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
    }

    /** Balls bounce off each other like balls: equal mass, elastic. */
    function collide() {
      const list = bodies.current;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], c = list[j];
          const ra = a.size / 2, rc = c.size / 2;
          const dx = (c.x + rc) - (a.x + ra), dy = (c.y + rc) - (a.y + ra);
          const d = Math.hypot(dx, dy), min = (ra + rc) * 0.92;
          if (d === 0 || d >= min) continue;
          const nx = dx / d, ny = dy / d;
          // Apart, half each.
          const push = (min - d) / 2;
          a.x -= nx * push; a.y -= ny * push;
          c.x += nx * push; c.y += ny * push;
          // Swap the speed along the line between them, if closing.
          const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (rel <= 0) continue;
          a.vx -= rel * nx; a.vy -= rel * ny;
          c.vx += rel * nx; c.vy += rel * ny;
          a.spin = -a.spin; c.spin = -c.spin;
          // A ball at rest that is hit (reduced motion) is now moving.
          a.pop = Math.max(a.pop, 0.01); c.pop = Math.max(c.pop, 0.01);
        }
      }
    }

    let raf = 0;
    let last = performance.now();
    let visible = true;
    let running = false;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let moving = false;
      bodies.current.forEach((b, i) => {
        const speed = Math.hypot(b.vx, b.vy);
        // A kick eases back to cruising (or to rest, with reduced motion).
        const target = still ? 0 : CRUISE;
        if (speed > 0.01) {
          const next = speed + (target - speed) * Math.min(1, dt * 0.9);
          const k = speed > 0 ? next / speed : 0;
          b.vx *= k; b.vy *= k;
        }
        b.spin += ((still ? 0 : Math.sign(b.spin || 1) * 18) - b.spin) * Math.min(1, dt * 0.6);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.spin * dt;
        b.pop = Math.max(0, b.pop - dt * 3);
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        if (b.x > w - b.size) { b.x = w - b.size; b.vx = -Math.abs(b.vx); }
        if (b.y > h - b.size) { b.y = h - b.size; b.vy = -Math.abs(b.vy); }
        bounceOffBlock(b);
        if (Math.hypot(b.vx, b.vy) > 0.5 || b.pop > 0) moving = true;
        const el = ballRefs.current[i];
        if (el) {
          el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.angle}deg) scale(${1 + b.pop * 0.25})`;
        }
      });
      collide();
      if (visible && !document.hidden && (moving || !still)) raf = requestAnimationFrame(frame);
      else running = false;
    }

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    // Draw once in place, then move.
    running = true;
    raf = requestAnimationFrame(frame);

    const onResize = () => {
      w = field.clientWidth;
      h = field.clientHeight;
      measure();
      start();
    };
    const ro = new ResizeObserver(onResize);
    if (field.parentElement) ro.observe(field.parentElement);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(field);
    const onVisibility = () => { if (!document.hidden) start(); };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    (field as any).__kick = (i: number) => {
      const b = bodies.current[i];
      if (!b) return;
      const dir = Math.random() * Math.PI * 2;
      const speed = 260 + Math.random() * 220;
      b.vx = Math.cos(dir) * speed;
      b.vy = Math.sin(dir) * speed;
      b.spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 360);
      b.pop = 1;
      start();
    };

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const kick = (i: number) => (fieldRef.current as any)?.__kick?.(i);

  return (
    <div ref={fieldRef} className="hero-balls" aria-label="Sports balls: tap one to send it flying">
      <style>{`
        .hero-balls {
          position: absolute;
          inset: -56px 0 0 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .hero-ball {
          position: absolute;
          top: 0;
          left: 0;
          width: 56px;
          height: 56px;
          padding: 0;
          border: 0;
          background: none;
          cursor: pointer;
          pointer-events: auto;
          opacity: 0.88;
          filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35));
          transform: translate3d(-200px, -200px, 0);
          will-change: transform;
          -webkit-tap-highlight-color: transparent;
          border-radius: 50%;
        }
        .hero-ball:hover { opacity: 1; }
        .hero-ball:focus-visible { outline: 2px solid var(--accent, #f5c518); outline-offset: 3px; }
        .hero-ball svg { width: 100%; height: 100%; display: block; }
        /* The hero's words sit over the balls but let a click through to
           them; only its buttons and links still take the click. */
        .hero > :not(.hero-balls) { position: relative; z-index: 1; pointer-events: none; }
        /* On a phone the words fill the width, so the balls fly above and
           below them: room above the chip, where it is seen first. */
        @media (max-width: 640px) {
          .hero { padding-top: 9rem; padding-bottom: 3rem; }
        }
        .hero a, .hero button:not(.hero-ball) { pointer-events: auto; }
      `}</style>
      {KINDS.map((k, i) => (
        <button
          key={k.kind}
          type="button"
          className="hero-ball"
          ref={(el) => { ballRefs.current[i] = el; }}
          aria-label={`${k.label}: send it flying`}
          onClick={() => kick(i)}
        >
          <BallArt kind={k.kind} id={`hb-${k.kind}`} />
        </button>
      ))}
    </div>
  );
}
