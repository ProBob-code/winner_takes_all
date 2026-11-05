import type { Metadata } from "next";
import { SITE_API_URL } from "@/lib/api-config";
import { SITE_URL } from "@/lib/page-metadata";
import { sportInfo } from "@/lib/sports";

/**
 * Link previews: the card WhatsApp, Telegram and iMessage draw from a shared link.
 *
 * Every card uses the homepage artwork, so a link from W.T.A looks like W.T.A in any
 * chat, with a title that says what the link is: this tournament, this invite.
 */

const IMAGE = {
  url: `${SITE_URL}/og-image.jpg`,
  width: 1200,
  height: 630,
  alt: "Winner Takes All — play the fight, take the crown",
  type: "image/jpeg",
};

export function previewMetadata(opts: { title: string; description: string; path: string }): Metadata {
  const url = `${SITE_URL}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: { title: opts.title, description: opts.description, url, siteName: "Winner Takes All", images: [IMAGE], type: "website" },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description, images: [IMAGE.url] },
  };
}

/** The public facts about one tournament, for its preview card. Never throws; a slow API just means a plainer card. */
export async function tournamentFacts(id: string): Promise<{ name: string; sport?: string; maxPlayers?: number; joinedPlayers?: number; status?: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${SITE_API_URL}/api/tournaments/${encodeURIComponent(id)}`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json();
    const t = data?.tournament;
    return t?.name ? { name: String(t.name), sport: t.sport, maxPlayers: t.maxPlayers, joinedPlayers: t.joinedPlayers, status: t.status } : null;
  } catch {
    return null;
  }
}

export function tournamentPreview(id: string, t: Awaited<ReturnType<typeof tournamentFacts>>): Metadata {
  if (!t) {
    return previewMetadata({
      title: "Join the fight on Winner Takes All",
      description: "Free to enter. Brackets, scoring and a live table on W.T.A.",
      path: `/tournaments/${id}`,
    });
  }
  const sp = t.sport ? sportInfo(t.sport) : null;
  const done = String(t.status || "").toLowerCase() === "completed";
  const left = t.maxPlayers && t.joinedPlayers != null ? Math.max(0, t.maxPlayers - t.joinedPlayers) : null;
  const bits = [
    sp ? `${sp.icon} ${sp.label} fight` : "A fight",
    t.maxPlayers ? `${t.maxPlayers} players` : null,
    done ? "see who took the crown" : left != null ? (left > 0 ? `${left} ${left === 1 ? "spot" : "spots"} left` : "full · watch it live") : null,
  ].filter(Boolean);
  return previewMetadata({
    title: done ? `🏆 ${t.name} — the results` : `🏆 ${t.name} · join the fight`,
    description: `${bits.join(" · ")}. Free to enter, live scores on Winner Takes All.`,
    path: `/tournaments/${id}`,
  });
}
