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

import type { PhName } from "@/components/ph-icon";

export interface NavItem {
  label: string;
  /** What the bottom bar calls it, where there is room for about six characters. */
  short?: string;
  href: string;
  /** A Phosphor icon (components/ph-icon.tsx), drawn in `color`. */
  icon: PhName;
  color: string;
  /** The bottom bar's icon, where it differs from the sidebar's. */
  barIcon?: PhName;
  /**
   * Earns one of the bottom bar's five slots. Reserved for what someone opens
   * the app on a phone to do: see their night, start one, check their coins.
   */
  primary?: boolean;
}

/** Signed in. */
export const MEMBER_NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/dashboard", icon: "squares-four-duotone", color: "#2ecf5a", primary: true },
  { label: "Run a Night", short: "Run", href: "/run", icon: "lightning-duotone", color: "#ffc93c", primary: true },
  { label: "Tournaments", short: "Play", href: "/tournaments", icon: "game-controller-duotone", color: "#8b7bff", primary: true },
  { label: "WTA Coins", short: "Coins", href: "/coins", icon: "crown-simple-fill", color: "#ffb21f", barIcon: "coin-fill", primary: true },
  { label: "Shop", short: "Shop", href: "/shop", icon: "shopping-bag-duotone", color: "#3fa0ff" },
  { label: "Venues", short: "Venues", href: "/venues", icon: "storefront-duotone", color: "#ff8a3d" },
  { label: "Live Screening", short: "Live", href: "/screening", icon: "television-duotone", color: "#ff5a8a" },
  { label: "Games", short: "Games", href: "/games", icon: "joystick-duotone", color: "#ff4d6d" },
  { label: "Rankings", short: "Ranks", href: "/leaderboard", icon: "trophy-duotone", color: "#ffb21f" },
  { label: "Playbook", short: "Guide", href: "/playbook", icon: "book-open-duotone", color: "#6fb6ff" },
  { label: "Profile", short: "Me", href: "/profile", icon: "user-circle-duotone", color: "#c084fc" },
  // The wallet is deliberately absent. It is the wind-down surface — real
  // rupees, a withdrawal queue, a top-up path that returns 410 — and with
  // every balance zeroed and signup no longer minting one, it is a page about
  // money that no longer exists. The route still resolves for an admin and for
  // any link already in the wild.
];

/** Signed out. */
export const GUEST_NAV: NavItem[] = [
  { label: "Games", short: "Games", href: "/games", icon: "joystick-duotone", color: "#ff4d6d", primary: true },
  { label: "Tournaments", short: "Play", href: "/tournaments", icon: "game-controller-duotone", color: "#8b7bff", primary: true },
  { label: "WTA Coins", short: "Coins", href: "/coins", icon: "crown-simple-fill", color: "#ffb21f", barIcon: "coin-fill", primary: true },
  { label: "Playbook", short: "Guide", href: "/playbook", icon: "book-open-duotone", color: "#6fb6ff", primary: true },
  { label: "Shop", short: "Shop", href: "/shop", icon: "shopping-bag-duotone", color: "#3fa0ff" },
  { label: "Live Screening", short: "Live", href: "/screening", icon: "television-duotone", color: "#ff5a8a" },
  { label: "Rankings", short: "Ranks", href: "/leaderboard", icon: "trophy-duotone", color: "#ffb21f" },
];

export function navFor(signedIn: boolean): NavItem[] {
  return signedIn ? MEMBER_NAV : GUEST_NAV;
}

/** Whether a link should look active for the current path. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}
