import type { Metadata } from "next";

export const SITE_URL = "https://winnertakesall.live";

/**
 * The public pages that search engines should know about, with each one's title and
 * description. Their pages are client components, so a small layout.tsx beside each
 * exports `pageMetadata(path)`; app/sitemap.ts lists the same paths.
 */
export const PUBLIC_PAGES: Record<string, { title: string; description: string }> = {
  "/about": { title: "About", description: "Why Winner Takes All exists: tournament software for the pool rooms, clubs, bars and gaming cafés that host game nights." },
  "/run": { title: "Run a night", description: "Set up an 8-ball or football night in about a minute: pick the game, the number of players and frames, and put the table on the wall." },
  "/tournaments": { title: "Tournaments", description: "Pool and football tournaments run on Winner Takes All. Free to enter; any prize is set and awarded by the venue." },
  "/series": { title: "Series", description: "Tournament series that run across several nights, with standings carried from one night to the next." },
  "/venues": { title: "Venues", description: "Pool rooms, clubs, bars and gaming cafés that host nights on Winner Takes All." },
  "/leaderboard": { title: "Rankings", description: "Player rankings from pool and football nights on Winner Takes All." },
  "/screening": { title: "Live screening", description: "The live table for the room: scores, the clock and standings on any spare screen as frames finish." },
  "/playbook": { title: "Host playbook", description: "How to host a pool or football night with Winner Takes All, from setting it up to crowning the winner." },
  "/games": { title: "Games", description: "The games you can run nights for on Winner Takes All, including 8-ball pool and football." },
  "/coins": { title: "WTA Coins", description: "How players earn WTA Coins for frames played and won. Coins are a record of play with no cash value." },
  "/shop": { title: "Shop", description: "The Winner Takes All shop." },
  "/contact": { title: "Contact", description: "Get in touch with the Winner Takes All team about hosting nights at your venue." },
  "/terms": { title: "Terms & Conditions", description: "The terms for using Winner Takes All." },
  "/privacy": { title: "Privacy Policy", description: "How Winner Takes All collects, uses and protects your data." },
  "/refund": { title: "Refund & Cancellation", description: "Winner Takes All's refund and cancellation policy." },
  "/community-guidelines": { title: "Community Guidelines", description: "How players and hosts are expected to behave on Winner Takes All." },
  "/skill-based-policy": { title: "No-Stakes Policy", description: "Winner Takes All takes no entry fees, holds no player funds and pools no prize money." },
  "/kyc-aml": { title: "KYC/AML", description: "Winner Takes All's know-your-customer and anti-money-laundering policy." },
  "/responsible-gaming": { title: "Responsible Gaming", description: "Winner Takes All's commitment to responsible, no-stakes play." },
};

export function pageMetadata(path: keyof typeof PUBLIC_PAGES): Metadata {
  const { title, description } = PUBLIC_PAGES[path];
  return { title, description, alternates: { canonical: path } };
}
