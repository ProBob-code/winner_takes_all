/**
 * Every destination in the app, in one place.
 *
 * WHY THIS EXISTS
 * The sidebar and the bottom bar each kept their own hand-written list, and
 * they drifted: the desktop sidebar grew to ten destinations while the phone
 * still showed six, so Venues, Live Screening, Games, Rankings and the
 * organiser account were simply unreachable on a phone. Nobody decided that —
 * it happened because adding a link meant remembering two files.
 *
 * Both now render from this. A destination added here appears in both, and
 * `primary` decides which few earn a slot in the bottom bar; everything else
 * is reached from "More" rather than being dropped.
 */

export interface NavItem {
  label: string;
  /** What the bottom bar calls it, where there is room for about six characters. */
  short?: string;
  href: string;
  icon: string;
  /**
   * Earns one of the bottom bar's five slots. Reserved for what someone opens
   * the app on a phone to do: see their night, start one, check their coins.
   */
  primary?: boolean;
}

/** Signed in. */
export const MEMBER_NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/dashboard", icon: "📊", primary: true },
  { label: "Run a Night", short: "Run", href: "/run", icon: "⚡", primary: true },
  { label: "Tournaments", short: "Play", href: "/tournaments", icon: "🎮", primary: true },
  { label: "WTA Coins", short: "Coins", href: "/coins", icon: "🪙", primary: true },
  { label: "Shop", short: "Shop", href: "/shop", icon: "🛍️" },
  { label: "Venues", short: "Venues", href: "/venues", icon: "🏠" },
  { label: "Live Screening", short: "Live", href: "/screening", icon: "📺" },
  { label: "Games", short: "Games", href: "/games", icon: "🕹️" },
  { label: "Rankings", short: "Ranks", href: "/leaderboard", icon: "🏆" },
  { label: "Playbook", short: "Guide", href: "/playbook", icon: "📖" },
  { label: "Profile", short: "Me", href: "/profile", icon: "👤" },
  // The wallet is deliberately absent. It is the wind-down surface — real
  // rupees, a withdrawal queue, a top-up path that returns 410 — and with
  // every balance zeroed and signup no longer minting one, it is a page about
  // money that no longer exists. The route still resolves for an admin and for
  // any link already in the wild.
];

/** Signed out. */
export const GUEST_NAV: NavItem[] = [
  { label: "Games", short: "Games", href: "/games", icon: "🕹️", primary: true },
  { label: "Tournaments", short: "Play", href: "/tournaments", icon: "🎮", primary: true },
  { label: "WTA Coins", short: "Coins", href: "/coins", icon: "🪙", primary: true },
  { label: "Playbook", short: "Guide", href: "/playbook", icon: "📖", primary: true },
  { label: "Shop", short: "Shop", href: "/shop", icon: "🛍️" },
  { label: "Live Screening", short: "Live", href: "/screening", icon: "📺" },
  { label: "Rankings", short: "Ranks", href: "/leaderboard", icon: "🏆" },
];

export function navFor(signedIn: boolean): NavItem[] {
  return signedIn ? MEMBER_NAV : GUEST_NAV;
}

/** Whether a link should look active for the current path. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}
