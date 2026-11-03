/**
 * Loading placeholders: the shape of the page, shimmering, instead of a blank
 * screen or a line of "Loading…".
 *
 * Built on the `.skeleton` / `.shimmer` styles in globals.css, so they follow
 * the theme. Use <PageSkeleton> where a whole page is waiting, and <Skeleton>
 * or <SkeletonRows> for one part of a page that is.
 */

import type { CSSProperties } from "react";

type Size = number | string;
const px = (v: Size | undefined) => (typeof v === "number" ? `${v}px` : v);

/** One shimmering block. Never put text inside it. */
export function Skeleton({
  w = "100%",
  h = 14,
  r,
  style,
  className = "",
}: {
  w?: Size;
  h?: Size;
  r?: Size;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`skeleton ${className}`}
      style={{ display: "block", width: px(w), height: px(h), borderRadius: px(r) ?? "8px", ...style }}
    />
  );
}

/** A few lines of text, the last one shorter. */
export function SkeletonText({ lines = 3, style }: { lines?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: "grid", gap: 10, ...style }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={i === lines - 1 ? "55%" : i % 2 ? "85%" : "95%"} h={12} />
      ))}
    </div>
  );
}

/** Rows of a list or table: a round mark, a line, a short value. */
export function SkeletonRows({ rows = 5, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="panel shimmer subtle"
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}
        >
          {avatar && <Skeleton w={40} h={40} r="50%" style={{ flex: "none" }} />}
          <div style={{ flex: 1, display: "grid", gap: 8 }}>
            <Skeleton w={`${55 + ((i * 17) % 30)}%`} h={13} />
            <Skeleton w="30%" h={10} />
          </div>
          <Skeleton w={56} h={22} r={11} style={{ flex: "none" }} />
        </div>
      ))}
    </div>
  );
}

/** A grid of cards: a picture band, a title, two lines, a button. */
export function SkeletonCards({ cards = 6, min = 260 }: { cards?: number; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: 20 }}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="panel shimmer subtle" style={{ padding: 18, display: "grid", gap: 12 }}>
          <Skeleton h={120} r={12} />
          <Skeleton w="70%" h={18} />
          <SkeletonText lines={2} />
          <Skeleton w="45%" h={36} r={10} />
        </div>
      ))}
    </div>
  );
}

/** A row of stat tiles, as on the dashboard and venue pages. */
export function SkeletonStats({ tiles = 4 }: { tiles?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: 16 }}>
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="panel shimmer subtle" style={{ padding: 18, display: "grid", gap: 10, justifyItems: "end" }}>
          <Skeleton w={54} h={30} />
          <Skeleton w="60%" h={10} />
        </div>
      ))}
    </div>
  );
}

export type PageSkeletonVariant = "cards" | "list" | "detail" | "form" | "profile";

/**
 * What a page looks like before its data arrives: a heading, then the body in
 * the shape that page will have. `label` is read to screen readers.
 */
export function PageSkeleton({
  variant = "detail",
  label = "Loading",
  bare = false,
}: {
  variant?: PageSkeletonVariant;
  label?: string;
  /** Skip the page/shell wrapper, for a page that already has one. */
  bare?: boolean;
}) {
  const body = (
    <div role="status" aria-live="polite" aria-busy="true" style={{ display: "grid", gap: 24, width: "100%" }}>
      <span className="sr-only">{label}…</span>

      {variant === "profile" ? (
        <div className="panel shimmer subtle" style={{ display: "flex", alignItems: "center", gap: 20, padding: 24 }}>
          <Skeleton w={88} h={88} r="50%" style={{ flex: "none" }} />
          <div style={{ flex: 1, display: "grid", gap: 10 }}>
            <Skeleton w="45%" h={26} />
            <Skeleton w="30%" h={12} />
            <Skeleton w="60%" h={12} />
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <Skeleton w="min(420px, 70%)" h={36} r={10} />
          <Skeleton w="min(560px, 90%)" h={14} />
        </div>
      )}

      {variant === "cards" && <SkeletonCards />}
      {variant === "list" && <SkeletonRows rows={6} />}
      {(variant === "detail" || variant === "profile") && (
        <>
          <SkeletonStats />
          <div className="panel shimmer subtle" style={{ padding: 24, display: "grid", gap: 16 }}>
            <Skeleton w="35%" h={20} />
            <SkeletonText lines={3} />
            <Skeleton h={44} r={10} />
          </div>
          <SkeletonRows rows={3} />
        </>
      )}
      {variant === "form" && (
        <div className="panel shimmer subtle" style={{ padding: 24, display: "grid", gap: 18, maxWidth: 640 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ display: "grid", gap: 8 }}>
              <Skeleton w="25%" h={10} />
              <Skeleton h={44} r={10} />
            </div>
          ))}
          <Skeleton w="40%" h={46} r={12} />
        </div>
      )}
    </div>
  );

  if (bare) return body;
  return (
    <main className="page">
      <div className="shell">{body}</div>
    </main>
  );
}
