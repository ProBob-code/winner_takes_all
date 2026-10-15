"use client";

/**
 * A card that turns over when tapped: something short on the front, the
 * detail on the back.
 *
 * A button, so it works from the keyboard and a screen reader hears whether it
 * is turned (`aria-pressed`). Both faces are spans — a button may only hold
 * phrasing content — and are styled by .flip-* and .wta-card in globals.css.
 */

import { useState, type ReactNode } from "react";

export type CardTone = "ink" | "gold" | "red";

const toneClass = (tone: CardTone) => (tone === "ink" ? "wta-card" : `wta-card ${tone}`);

export function FlipCard({
  front,
  back,
  frontTone = "ink",
  backTone = "red",
  label,
  minHeight,
}: {
  front: ReactNode;
  back: ReactNode;
  frontTone?: CardTone;
  backTone?: CardTone;
  /** What a screen reader hears for the card as a whole. */
  label: string;
  minHeight?: string;
}) {
  const [turned, setTurned] = useState(false);

  return (
    <button
      type="button"
      className="flip-card"
      aria-pressed={turned}
      aria-label={label}
      onClick={() => setTurned((t) => !t)}
      style={minHeight ? { minHeight } : undefined}
    >
      <span className="flip-inner" style={minHeight ? { minHeight } : undefined}>
        <span className={`flip-face front ${toneClass(frontTone)}`}>
          {front}
          <span className="hint">Tap to turn over ↻</span>
        </span>
        <span className={`flip-face back ${toneClass(backTone)}`}>{back}</span>
      </span>
    </button>
  );
}
