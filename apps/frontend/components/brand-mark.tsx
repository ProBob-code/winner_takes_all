/**
 * The W.T.A mark, in one place.
 *
 * Gold and red: the crown is gold with a red band and a red centre jewel, and
 * the T of the wordmark ("Takes", when it is spelt out) is red. The top bar and
 * the sidebar each used to carry their own copy of the crown, all gold.
 */

export function CrownLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5Z" fill="#FFD700" />
      <path d="M19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z" fill="var(--wta-red)" />
      <circle cx="12" cy="12.5" r="1.6" fill="var(--wta-red)" />
    </svg>
  );
}

/** "W.T.A", with the T in red. */
export function WordmarkShort() {
  return (
    <>
      W.<span className="wta-t">T</span>.A
    </>
  );
}

/** "Winner.Takes.All", with Takes in red. */
export function WordmarkFull() {
  return (
    <>
      Winner.<span className="wta-t">Takes</span>.All
    </>
  );
}
