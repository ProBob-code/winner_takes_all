/**
 * Imposter, the party game: the rules that do not need a room, and the
 * Worker's side of its sockets.
 *
 * Everyone in a room gets a secret word; the imposters get a slightly
 * different one. Each player describes their word in turn without saying it,
 * for a few rounds, then everyone votes for who they think the imposters are.
 * Catch every imposter and the innocents win; miss one and the imposters do.
 *
 * The room itself (durable-objects/imposter-rooms.ts) runs the game on the
 * server: it deals the words, so no screen ever sees anyone else's word until
 * the result, it keeps the clock, it plays the bots, it counts the votes, and
 * it pays the coins. The pure parts live here so they can be tested.
 */

import type { Env } from "../types";
import { getAccessSession, getRefreshSession, parseCookies } from "./kv-sessions";
import { D1Store } from "./d1-store";

// ── The words ────────────────────────────────────────────────────────────────

/** Close enough to describe alike, different enough to give someone away. */
export const WORD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Ice", "Water"], ["Gym", "Prison"], ["Pav Bhaji", "Vada Pav"], ["Tea", "Coffee"], ["Cricket", "Football"],
  ["Doctor", "Nurse"], ["Mumbai", "Delhi"], ["Instagram", "Snapchat"], ["Pizza", "Burger"], ["Rain", "Snow"],
  ["Netflix", "YouTube"], ["Lion", "Tiger"], ["Wedding", "Birthday"], ["Train", "Metro"], ["Samosa", "Kachori"],
  ["Beach", "Swimming pool"], ["Diwali", "Holi"], ["Biryani", "Pulao"], ["Shah Rukh Khan", "Salman Khan"],
  ["Goa", "Manali"], ["iPhone", "Android"], ["WhatsApp", "Telegram"], ["Chess", "Ludo"], ["Dosa", "Idli"],
  ["Auto rickshaw", "Taxi"], ["Cinema", "Theatre"], ["Teacher", "Principal"], ["Laptop", "Tablet"],
  ["Mango", "Papaya"], ["Guitar", "Violin"], ["Moon", "Sun"], ["Dog", "Wolf"], ["Ice cream", "Kulfi"],
  ["Hospital", "Clinic"], ["Library", "Bookstore"], ["Pen", "Pencil"], ["Spotify", "Radio"], ["Uber", "Ola"],
  ["Paneer", "Tofu"], ["Hotel", "Hostel"], ["Gold", "Silver"], ["Airport", "Railway station"],
  ["Wifi", "Bluetooth"], ["Football", "Basketball"], ["Lassi", "Buttermilk"], ["Selfie", "Passport photo"],
];

/** What a bot says for its word. A bot never repeats a clue already given. */
export const BOT_CLUES: Readonly<Record<string, readonly string[]>> = {
  Ice: ["Cold and solid", "Goes in drinks", "Melts in the sun"], Water: ["You drink it daily", "Comes from a tap", "Clear and wet"],
  Gym: ["Heavy lifting", "Sweat and mirrors", "Monthly membership"], Prison: ["Locked behind bars", "You serve time", "Guards everywhere"],
  "Pav Bhaji": ["Buttery and spicy", "Mashed veggies", "Eaten with bread"], "Vada Pav": ["Mumbai street snack", "Fried potato inside", "Spicy chutney sandwich"],
  Tea: ["Hot morning drink", "Leaves in hot water", "Chai time"], Coffee: ["Caffeine kick", "Brewed from beans", "Cafe order"],
  Cricket: ["Bat and ball", "Eleven per side", "Sixes and wickets"], Football: ["Kick it into the net", "Ninety minutes", "World Cup fever"],
  Doctor: ["Writes prescriptions", "Wears a stethoscope", "Years of medical school"], Nurse: ["Works in hospitals", "Takes care of patients", "Night shifts"],
  Mumbai: ["City by the sea", "Local trains", "Bollywood home"], Delhi: ["Capital city", "Cold winters", "Historic monuments"],
  Instagram: ["Photo sharing app", "Reels and stories", "Likes and followers"], Snapchat: ["Disappearing messages", "Funny filters", "Streaks"],
  Pizza: ["Cheesy and round", "Sliced into triangles", "Italian favourite"], Burger: ["Patty between buns", "Fast food classic", "Goes with fries"],
  Rain: ["Falls from clouds", "Need an umbrella", "Monsoon"], Snow: ["White and cold", "Falls in winter", "Build a man out of it"],
  Netflix: ["Binge watching", "Monthly subscription", "Series and movies"], YouTube: ["Free videos", "Subscribe and like", "Creators everywhere"],
  Lion: ["King of the jungle", "Has a big mane", "Roars loudly"], Tiger: ["Orange with stripes", "Big wild cat", "National animal"],
  Wedding: ["Two families meet", "Lots of dancing", "Bride and groom"], Birthday: ["Cake and candles", "Once a year", "Gifts and wishes"],
  Train: ["Runs on tracks", "Long journeys", "Sleeper coaches"], Metro: ["City rail", "Underground stations", "Swipe a card"],
  Samosa: ["Triangle snack", "Potato filling", "Fried and crispy"], Kachori: ["Round and puffy", "Stuffed with dal", "Fried snack"],
  Beach: ["Sand and waves", "Sunset by the sea", "Seashells"], "Swimming pool": ["Chlorine smell", "Diving board", "Swim laps"],
  Diwali: ["Festival of lights", "Crackers and sweets"], Holi: ["Colours everywhere", "Water balloons"],
  Biryani: ["Layered rice and meat", "Dum cooked"], Pulao: ["Mild rice dish", "Peas and spices"],
  "Shah Rukh Khan": ["King of romance", "Arms wide open"], "Salman Khan": ["Bhai of Bollywood", "Shirtless hero"],
  Goa: ["Beaches and parties", "Feni and sunsets"], Manali: ["Snowy mountains", "Himachal getaway"],
  iPhone: ["Fruit logo", "Pricey and sleek"], Android: ["Green robot", "Many brands"],
  WhatsApp: ["Blue ticks", "Family groups"], Telegram: ["Channels and bots", "Paper plane"],
  Chess: ["Checkmate", "Kings and queens"], Ludo: ["Roll the dice", "Four colours"],
  Dosa: ["Crispy and thin", "Sambar on the side"], Idli: ["Soft and steamed", "Round and white"],
  "Auto rickshaw": ["Three wheels", "Meter se chalo"], Taxi: ["Yellow top", "Hail on the street"],
  Cinema: ["Big screen", "Popcorn break"], Theatre: ["Live on stage", "Curtain call"],
  Teacher: ["Checks homework", "Chalk and board"], Principal: ["Head of school", "Office summons"],
  Laptop: ["Keyboard attached", "Folds shut"], Tablet: ["Touch screen slab", "Bigger than a phone"],
  Mango: ["King of fruits", "Summer favourite"], Papaya: ["Orange inside", "Black seeds"],
  Guitar: ["Six strings", "Strum it"], Violin: ["Bow and strings", "Under the chin"],
  Moon: ["Shines at night", "Has phases"], Sun: ["Very hot star", "Rises daily"],
  Dog: ["Loyal pet", "Wags its tail"], Wolf: ["Howls at night", "Wild pack"],
  "Ice cream": ["Cold scoop", "Cone or cup"], Kulfi: ["Frozen on a stick", "Desi dessert"],
  Hospital: ["Emergency ward", "Many floors"], Clinic: ["Small practice", "Quick checkup"],
  Library: ["Quiet please", "Borrow and return"], Bookstore: ["Buy new reads", "Shelves of novels"],
  Pen: ["Ink inside", "Click to write"], Pencil: ["Needs sharpening", "Has an eraser"],
  Spotify: ["Green music app", "Playlists"], Radio: ["Tune the dial", "FM stations"],
  Uber: ["Ride app", "Black and white logo"], Ola: ["Desi ride app", "Green and yellow"],
  Paneer: ["Cottage cheese", "Butter masala"], Tofu: ["Soy block", "Vegan protein"],
  Hotel: ["Room service", "Check in"], Hostel: ["Shared dorms", "Budget stay"],
  Gold: ["Yellow metal", "Jewellery"], Silver: ["Shiny grey metal", "Second place"],
  Airport: ["Boarding pass", "Security check"], "Railway station": ["Platform number", "Chai wala"],
  Wifi: ["Password please", "Internet signal"], Bluetooth: ["Pair devices", "Wireless earbuds"],
  Basketball: ["Hoops", "Dribble"], Lassi: ["Sweet and thick", "Punjabi drink"], Buttermilk: ["Thin and salty", "Chaas"],
  Selfie: ["Front camera", "Pout and click"], "Passport photo": ["White background", "No smiling"],
};

export const BOT_NAMES = ["Rocky", "Pixel", "Maya", "Zara", "Kabir", "Neo", "Tara", "Chintu", "Rhea", "Vikram"];

/** Taunt keys the room relays: twelve emotes (e0–e11) and eight stickers (s0–s7). */
export const TAUNT_KEYS: ReadonlySet<string> = new Set([
  ...Array.from({ length: 12 }, (_, i) => `e${i}`),
  ...Array.from({ length: 8 }, (_, i) => `s${i}`),
]);

// ── The rules ────────────────────────────────────────────────────────────────

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const MAX_ROUNDS = 5;
export const CLUE_MAX = 60;

/** How long each part of a game lasts. */
export const T_REVEAL = 6_000;
export const T_CLUE = 45_000;
export const T_VOTE = 30_000;

/** Imposters must stay a minority: at most one fewer than half the room. */
export function maxImposters(players: number): number {
  return Math.max(1, Math.floor((players - 1) / 2));
}

/** Does a clue give the word away? Any part of it three letters or longer counts. */
export function leaks(word: string, text: string): boolean {
  const t = text.toLowerCase();
  const w = word.toLowerCase();
  return t.includes(w) || w.split(/\s+/).filter((part) => part.length >= 3).some((part) => t.includes(part));
}

/** Why a clue is refused, or null if it is fine. */
export function clueProblem(word: string, text: string): string | null {
  const t = text.trim();
  if (t.length < 2) return "Write a short clue.";
  if (t.length > CLUE_MAX) return "Keep it under 60 characters.";
  if (leaks(word, t)) return "Don't say the word — describe it.";
  return null;
}

/** A runoff after a tied vote: only the tied players can be picked. */
export type Revote = {
  id: string;
  /** The tied players, the only ones on the ballot. */
  candidates: string[];
  /** How many of them still have to go. */
  seats: number;
  /** Players whose count was clear of the tie, out whatever the runoff says. */
  fixed: string[];
};

export type Tally =
  | { kind: "revote"; revote: Omit<Revote, "id">; counts: Record<string, number> }
  | { kind: "done"; out: string[]; tiedAgain: boolean; counts: Record<string, number> };

/**
 * Count one round of votes.
 *
 * The top `need` players go out. A tie across the cut line on the first vote
 * sends just the tied players to a runoff; a tie on the runoff means nobody
 * else goes out, which lets the imposters slip away. A player nobody voted
 * for is never out, even if fewer than `need` players got any votes.
 */
export function tally(args: {
  pool: string[];
  need: number;
  votes: Record<string, string[]>;
  revote: Revote | null;
}): Tally {
  const { pool, need, votes, revote } = args;
  const counts: Record<string, number> = {};
  for (const id of pool) counts[id] = 0;
  for (const picks of Object.values(votes)) for (const id of picks) if (id in counts) counts[id]++;

  const sorted = [...pool].sort((a, b) => counts[b] - counts[a]);
  const cut = counts[sorted[need - 1]] ?? 0;
  const tie = need < sorted.length && cut > 0 && counts[sorted[need]] === cut;

  if (tie && !revote) {
    const fixed = sorted.filter((id) => counts[id] > cut);
    const candidates = sorted.filter((id) => counts[id] === cut);
    return { kind: "revote", revote: { candidates, seats: need - fixed.length, fixed }, counts };
  }
  if (tie && revote) return { kind: "done", out: [...revote.fixed], tiedAgain: true, counts };
  const out = [...(revote?.fixed ?? []), ...sorted.slice(0, need).filter((id) => counts[id] > 0)];
  return { kind: "done", out, tiedAgain: false, counts };
}

/** Innocents win only by voting out every imposter, and never on a second tie. */
export function innocentsWin(imposters: string[], out: string[], tiedAgain: boolean): boolean {
  return !tiedAgain && imposters.every((id) => out.includes(id));
}

/** A clean room code: no 0/O or 1/I to misread off a friend's screen. */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

// ── Sockets ──────────────────────────────────────────────────────────────────
//
// Routed before the Hono app, like online 8-ball (see lib/pool.ts): its
// middleware rebuilds responses and a rebuilt 101 loses the socket. The
// session cookie authenticates, and the Origin is checked against the CORS
// allow-list so another site cannot open a socket as the visitor.

export type ImposterUser = { userId: string; name: string };

function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

async function userFrom(request: Request, env: Env): Promise<ImposterUser | null> {
  const kv = env.SESSIONS;
  if (!kv) return null;
  const cookies = parseCookies(request.headers.get("Cookie") ?? undefined);
  let userId: string | null = null;
  if (cookies["wta_access_token"]) userId = await getAccessSession(kv, cookies["wta_access_token"]);
  if (!userId && cookies["wta_refresh_token"]) userId = await getRefreshSession(kv, cookies["wta_refresh_token"]);
  if (!userId) return null;
  const user: any = await new D1Store(env.DB).getUserById(userId);
  return user ? { userId: user.id, name: String(user.name || "Player").trim().slice(0, 18) || "Player" } : null;
}

export function isImposterSocket(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/imposter/") && request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

/**
 * /api/imposter/create      a new room, with a fresh code; the creator hosts.
 * /api/imposter/room/CODE   join (or rejoin) an existing room.
 */
export async function handleImposterSocket(request: Request, env: Env, allowed: string[]): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (!origin || !allowed.includes(origin)) return refuse(4403, "Origin not allowed");

  const user = await userFrom(request, env).catch(() => null);
  if (!user) return refuse(4401, "Sign in to play Imposter");

  const headers = new Headers(request.headers);
  headers.set("x-imposter-user", JSON.stringify(user));
  const url = new URL(request.url);

  if (url.pathname === "/api/imposter/create") {
    headers.set("x-imposter-create", "1");
    // 32^5 codes, so a clash is rare; a live room answers 409 and we roll again.
    for (let i = 0; i < 6; i++) {
      const code = newRoomCode();
      const stub = env.IMPOSTER_ROOMS.get(env.IMPOSTER_ROOMS.idFromName(`room:${code}`));
      const res = await stub.fetch(`https://imposter/join?code=${code}`, { method: "GET", headers });
      if (res.status !== 409) return res;
    }
    return refuse(4503, "Could not open a room. Try again.");
  }

  const code = decodeURIComponent(url.pathname.slice("/api/imposter/room/".length)).toUpperCase();
  if (!url.pathname.startsWith("/api/imposter/room/") || !ROOM_CODE.test(code)) {
    return refuse(4404, "That is not a room code.");
  }
  const stub = env.IMPOSTER_ROOMS.get(env.IMPOSTER_ROOMS.idFromName(`room:${code}`));
  return stub.fetch(`https://imposter/join?code=${code}`, { method: "GET", headers });
}
