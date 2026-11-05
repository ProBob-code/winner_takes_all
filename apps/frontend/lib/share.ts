/**
 * Every message W.T.A hands to WhatsApp (or any other app), in one place.
 *
 * They follow the homepage: "Play the fight. Take the crown." and "Real tables.
 * Real rivals. Real bragging rights." Each one has the same shape so a group
 * chat learns to read them at a glance:
 *
 *   1. one bold headline that says what this is
 *   2. two or three short lines of detail, each led by one icon
 *   3. the link on its own line, so WhatsApp builds the preview card from it
 *   4. a quiet italic sign-off
 *
 * Formatting is WhatsApp's own: *bold*, _italic_, no markdown. Emoji lead the
 * lines; they are never strung together, which reads as spam in a group of
 * regulars. Links always point at the live domain, so a message sent from a
 * preview build or an old bookmark still sends people to the real site.
 */

import { SITE_URL } from "@/lib/page-metadata";
import { sportInfo } from "@/lib/sports";

export interface ShareMessage {
  /** Short title, used by the system share sheet and as the sheet's heading. */
  title: string;
  /** The whole message, link included, ready to paste. */
  text: string;
  /** The link the message is about. */
  url: string;
}

/** The public origin links should use: the live domain, except on a dev machine. */
export function shareOrigin(): string {
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return window.location.origin;
  }
  return SITE_URL;
}

/** A link on the public origin, whatever host built it. */
export function shareLink(path: string): string {
  return shareOrigin() + (path.startsWith("/") ? path : `/${path}`);
}

const b = (s: string) => `*${s}*`;
const i = (s: string) => `_${s}_`;
const SIGN_OFF = i("W.T.A · Winner Takes All — free to play");

function compose(lines: Array<string | false | null | undefined>): string {
  // Drop empty optional lines, but keep deliberate blank lines, and never two in a row.
  const out: string[] = [];
  for (const l of lines) {
    if (l === false || l == null) continue;
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Thousands as K, the way the app shows coins. */
function k(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}K`.replace(".0K", "K");
  return String(n);
}

// ─── The platform ────────────────────────────────────────────────────────────

/** Bring someone to W.T.A: the general invite. */
export function platformInvite(from?: string): ShareMessage {
  const url = shareLink("/");
  return {
    title: "Winner Takes All",
    url,
    text: compose([
      `👑 ${b("Play the fight. Take the crown.")}`,
      from ? `${from} wants you on W.T.A — real tables, real rivals, real bragging rights.` : "Real tables. Real rivals. Real bragging rights.",
      "",
      "🎱 8-ball, ⚽ football and party games",
      "🏆 A trophy ladder for every sport",
      "🪙 WTA Coins for every game you win",
      "✅ Wins verified at the table",
      "",
      "Free to join. Play 8-ball in your browser right now 👇",
      url,
      "",
      SIGN_OFF,
    ]),
  };
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export interface TournamentShareInfo {
  id: string;
  name: string;
  sport?: string;
  maxPlayers?: number;
  joinedPlayers?: number;
  venueName?: string;
  host?: string;
  /** A join code, if the host has one open: the link then goes straight to it. */
  joinCode?: string;
  status?: string;
}

/** "Come and play in my tournament." */
export function tournamentInvite(t: TournamentShareInfo): ShareMessage {
  const url = t.joinCode ? shareLink(`/join/${t.joinCode}`) : shareLink(`/tournaments/${t.id}`);
  const sp = t.sport ? sportInfo(t.sport) : null;
  const open = t.maxPlayers && t.joinedPlayers != null ? Math.max(0, t.maxPlayers - t.joinedPlayers) : null;
  const done = String(t.status || "").toLowerCase() === "completed";
  return {
    title: t.name,
    url,
    text: compose([
      done ? `🏆 ${b(`${t.name} — it's decided`)}` : `🏆 ${b(`Join the fight: ${t.name}`)}`,
      sp ? `${sp.icon} ${sp.label} fight${t.maxPlayers ? ` · ${plural(t.maxPlayers, "player")}` : ""}` : null,
      t.venueName ? `📍 ${t.venueName}` : null,
      t.host ? `🎤 Hosted by ${t.host}` : null,
      !done && open != null ? (open > 0 ? `🔥 ${plural(open, "spot")} left` : "🔥 Full house") : null,
      "",
      done ? "See who took the crown 👇" : open === 0 ? "Watch it live 👇" : "Tap to take your seat 👇",
      url,
      "",
      i("Free to enter · live scores on W.T.A"),
    ]),
  };
}

/** "Watch it live": the spectator link for a running arena. */
export function liveArena(a: { name: string; url: string; sport?: string }): ShareMessage {
  const sp = a.sport ? sportInfo(a.sport) : null;
  return {
    title: `LIVE: ${a.name}`,
    url: a.url,
    text: compose([
      `🔴 ${b(`LIVE NOW — ${a.name}`)}`,
      sp ? `${sp.icon} ${sp.label} on W.T.A` : null,
      "Scores, the clock and the table, updating as every frame finishes.",
      "",
      `👀 Watch live: ${a.url}`,
      "",
      SIGN_OFF,
    ]),
  };
}

// ─── Players ─────────────────────────────────────────────────────────────────

export function playerBrag(p: { id: string; name: string; trophies?: number; coins?: number; title?: string; mine?: boolean }): ShareMessage {
  const url = shareLink(`/players/${encodeURIComponent(p.id)}`);
  const stats = [
    p.trophies != null ? `🏆 ${p.trophies.toLocaleString("en-IN")} trophies` : null,
    p.coins != null ? `🪙 ${k(p.coins)} WTA Coins` : null,
  ].filter(Boolean).join(" · ");
  return {
    title: `${p.name} on Winner Takes All`,
    url,
    text: compose([
      `👑 ${b(p.mine ? `My W.T.A card — ${p.name}` : `${p.name} on W.T.A`)}`,
      p.title ? `🎖️ ${p.title}` : null,
      stats || null,
      "",
      p.mine ? "Think you can take my crown? 👇" : "See the record 👇",
      url,
      "",
      SIGN_OFF,
    ]),
  };
}

// ─── Eight Ball ──────────────────────────────────────────────────────────────

export interface EightBallShare {
  /** Who was beaten: "the Machine (Legend)", a player's name, or player 2's name. */
  opponent: string;
  mode: "system" | "online" | "pvp";
  won: boolean;
  coins?: number;
  combos?: number;
  bestCombo?: number;
}

/** After a game: a win to brag about, or a loss to avenge. */
export function eightBallResult(r: EightBallShare): ShareMessage {
  const url = shareLink("/play/8ball");
  const line2 = [
    r.won && r.coins ? `🪙 +${k(r.coins)} WTA Coins` : null,
    r.combos ? `🔥 ${plural(r.combos, "combo")}${r.bestCombo && r.bestCombo > 1 ? ` · best ×${r.bestCombo}` : ""}` : null,
  ].filter(Boolean).join(" · ");
  return {
    title: r.won ? "I won at W.T.A Eight Ball" : "Rematch on W.T.A Eight Ball",
    url,
    text: compose([
      r.won ? `🎱 ${b(`I just beat ${r.opponent} at W.T.A Eight Ball!`)}` : `🎱 ${b(`${r.opponent} beat me at W.T.A Eight Ball.`)}`,
      line2 || null,
      r.mode === "online" ? "Live online, refereed by the table." : null,
      "",
      r.won ? "Think you can beat me? Free, in your browser 👇" : "Help me get revenge — free, in your browser 👇",
      url,
      "",
      SIGN_OFF,
    ]),
  };
}

/** "Play me": a challenge to a game of online 8-ball. */
export function eightBallChallenge(from?: string): ShareMessage {
  const url = shareLink("/play/8ball");
  return {
    title: "8-ball challenge",
    url,
    text: compose([
      `🎱 ${b(from ? `${from} challenges you to 8-ball` : "8-ball challenge: you vs me")}`,
      "Live online, in your browser — no download.",
      "🪙 Winner takes +5K WTA Coins, plus combos",
      "",
      "Open it and tap *vs Online* — we get matched 👇",
      url,
      "",
      SIGN_OFF,
    ]),
  };
}

// ─── Venues ──────────────────────────────────────────────────────────────────

export function venueInvite(v: { id: string; name: string; city?: string }): ShareMessage {
  const url = shareLink(`/venues/${encodeURIComponent(v.id)}`);
  return {
    title: v.name,
    url,
    text: compose([
      `🏟️ ${b(`${v.name} runs fights on W.T.A`)}`,
      v.city ? `📍 ${v.city}` : null,
      "Brackets, a live table on the wall and coins for every win.",
      "",
      `See the next fight 👇`,
      url,
      "",
      SIGN_OFF,
    ]),
  };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/** The `wa.me` link that opens WhatsApp with the message written; WhatsApp asks who to send it to. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Whether this device has a system share sheet. */
export function canSystemShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * The system share sheet, with the link inside the text rather than beside it:
 * given both, several apps (WhatsApp among them) paste the link twice.
 */
export async function systemShare(m: ShareMessage): Promise<boolean> {
  if (!canSystemShare()) return false;
  try {
    await navigator.share({ title: m.title, text: m.text });
    return true;
  } catch {
    // Cancelling the sheet lands here as well; it is not an error.
    return false;
  }
}
