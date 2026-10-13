/**
 * The WTA Coin, drawn.
 *
 * An SVG rather than an image file so it stays sharp on a wall-mounted screen,
 * costs no request, and can be dropped in at any size from a 20px chip beside a
 * balance to a 200px hero.
 *
 * DESIGN NOTE: the face carries the same crown as the wordmark and the
 * favicon, so the coin reads as part of this product rather than as a borrowed
 * casino chip — which is precisely the association to avoid for a token that
 * has no cash value and must never be mistaken for one that does. Gold, struck
 * rim, no currency symbol, no numerals, nothing that suggests denomination.
 */
export function CoinMark({
  size = 32,
  title,
}: {
  size?: number;
  /** Supply when the coin is standing on its own as meaningful content. */
  title?: string;
}) {
  // One gradient pair per rendered size would collide if two coins shared ids
  // on a page, so the ids are scoped per instance.
  const uid = `wta-coin-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id={`${uid}-face`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE16A" />
          <stop offset="45%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#C8921B" />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF3B0" />
          <stop offset="100%" stopColor="#A9741A" />
        </linearGradient>
      </defs>

      {/* Rim, then an inset face, so it still reads as a struck coin at 20px. */}
      <circle cx="32" cy="32" r="30" fill={`url(#${uid}-rim)`} />
      <circle cx="32" cy="32" r="25" fill={`url(#${uid}-face)`} />
      <circle
        cx="32"
        cy="32"
        r="25"
        fill="none"
        stroke="#8C5E12"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {/* The wordmark's crown, struck into the face. */}
      <path
        d="M18 38L22 22L28.5 29L32 19L35.5 29L42 22L46 38H18Z"
        fill="#5A3A06"
        fillOpacity="0.9"
      />
      <path d="M18 40.5H46V43.5H18V40.5Z" fill="#5A3A06" fillOpacity="0.9" />
    </svg>
  );
}
