/**
 * The shop: cosmetics bought with WTA Coins.
 *
 * See docs/progression-and-cosmetics-plan.md §2 and §6. What is sold here is
 * kept on the right side of lib/coins.ts and the Online Gaming Act 2025:
 *
 *   - Only cosmetics: artifacts to show, frames around an avatar, emotes.
 *     Nothing that changes a score, a trophy or what anything pays.
 *   - Fixed prices, and nothing random: no boxes, no chests, no "mystery"
 *     item. Paying coins for a chance at something better is staking, which
 *     is the one thing a coin must never be.
 *   - Owned for good, and never sold on, traded or gifted: a gift would make
 *     coins transferable by the back door.
 *   - Closed whenever stakesEnabled() is true, so "pay money to enter, win
 *     coins, spend coins on goods" can never all be switched on together.
 *
 * Buying raises the Collection Level: every item owned adds collection
 * points by rarity (lib/progression.ts takes them as XP).
 *
 * The art for each item is in the frontend (components/shop-art.tsx); the
 * shop-mirror test holds apps/frontend/lib/shop.ts to this list.
 */

export type ItemKind = "artifact" | "border" | "emote";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  /** True for the emotes every player has from the start. Never sold. */
  starter?: boolean;
}

/** What each rarity costs, in coins. A common is about a night's turning up. */
export const PRICES: Record<Rarity, number> = {
  common: 25_000,
  rare: 75_000,
  epic: 200_000,
  legendary: 500_000,
};

/** What each rarity adds to the Collection Level, in XP. */
export const COLLECTION_POINTS: Record<Rarity, number> = {
  common: 5,
  rare: 15,
  epic: 40,
  legendary: 100,
};

/** At most this many artifacts on show at once, and emotes in the deck. */
export const SHOWCASE_SIZE = 3;
export const EMOTE_DECK_SIZE = 8;

export const CATALOGUE: ShopItem[] = [
  // ── Artifacts: shown on a profile, three at a time ──
  { id: "artifact.chalk-cube", kind: "artifact", name: "Chalk Cube", rarity: "common" },
  { id: "artifact.cue-tip", kind: "artifact", name: "Fresh Cue Tip", rarity: "common" },
  { id: "artifact.bridge", kind: "artifact", name: "Bridge Rest", rarity: "common" },
  { id: "artifact.rack", kind: "artifact", name: "Wooden Rack", rarity: "common" },
  { id: "artifact.pocket-net", kind: "artifact", name: "Pocket Net", rarity: "rare" },
  { id: "artifact.scoreboard", kind: "artifact", name: "Bead Scoreboard", rarity: "rare" },
  { id: "artifact.cue-case", kind: "artifact", name: "Leather Cue Case", rarity: "rare" },
  { id: "artifact.neon-sign", kind: "artifact", name: "Neon Sign", rarity: "epic" },
  { id: "artifact.diamond-cue", kind: "artifact", name: "Diamond Inlay Cue", rarity: "epic" },
  { id: "artifact.golden-eight", kind: "artifact", name: "Golden Eight", rarity: "legendary" },
  { id: "artifact.crown-rack", kind: "artifact", name: "Crown Rack", rarity: "legendary" },

  // ── Avatar frames: a ring around the avatar ──
  { id: "border.felt", kind: "border", name: "Felt Ring", rarity: "common" },
  { id: "border.oak", kind: "border", name: "Oak Rail", rarity: "common" },
  { id: "border.chalk", kind: "border", name: "Chalk Dust", rarity: "rare" },
  { id: "border.neon", kind: "border", name: "Neon Glow", rarity: "rare" },
  { id: "border.brass", kind: "border", name: "Brass Studs", rarity: "epic" },
  { id: "border.velvet", kind: "border", name: "Velvet Rope", rarity: "epic" },
  { id: "border.gold", kind: "border", name: "Champion Gold", rarity: "legendary" },

  // ── Emotes: six to start with, more to buy ──
  { id: "emote.gg", kind: "emote", name: "GG", rarity: "common", starter: true },
  { id: "emote.shot", kind: "emote", name: "Shot!", rarity: "common", starter: true },
  { id: "emote.unlucky", kind: "emote", name: "Unlucky", rarity: "common", starter: true },
  { id: "emote.rack-em", kind: "emote", name: "Rack 'em", rarity: "common", starter: true },
  { id: "emote.respect", kind: "emote", name: "Respect", rarity: "common", starter: true },
  { id: "emote.oops", kind: "emote", name: "Oops", rarity: "common", starter: true },
  { id: "emote.nice-break", kind: "emote", name: "Nice break", rarity: "common" },
  { id: "emote.too-easy", kind: "emote", name: "Too easy", rarity: "rare" },
  { id: "emote.kiss", kind: "emote", name: "Kiss shot", rarity: "rare" },
  { id: "emote.clutch", kind: "emote", name: "Clutch", rarity: "epic" },
  { id: "emote.on-fire", kind: "emote", name: "On fire", rarity: "epic" },
  { id: "emote.crown", kind: "emote", name: "Bow down", rarity: "legendary" },
];

export function itemById(id: string): ShopItem | undefined {
  return CATALOGUE.find((item) => item.id === id);
}

export function priceOf(item: ShopItem): number {
  return PRICES[item.rarity];
}

/** On sale: everything but the starter emotes, which every player has. */
export function isForSale(item: ShopItem): boolean {
  return !item.starter;
}

/** Owned by everyone without buying. */
export const STARTER_IDS = CATALOGUE.filter((item) => item.starter).map((item) => item.id);

/** Collection points for a set of owned ids (starters count for nothing). */
export function collectionPointsFor(ownedIds: Iterable<string>): number {
  let points = 0;
  for (const id of ownedIds) {
    const item = itemById(id);
    if (item && !item.starter) points += COLLECTION_POINTS[item.rarity];
  }
  return points;
}

/**
 * Today's picks: six items from what is for sale, the same for everyone all
 * day, different tomorrow. A reason to open the app; never a discount and
 * never a surprise, since every item and its price is always listed in full.
 */
export function dailyPicks(date: string, count = 6): string[] {
  const forSale = CATALOGUE.filter(isForSale).map((item) => item.id);
  let seed = 0;
  for (const ch of date) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const pool = [...forSale];
  const picks: string[] = [];
  while (picks.length < count && pool.length > 0) {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 3266489917) >>> 0;
    picks.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picks;
}

export type LoadoutCheck =
  | { ok: true; borderId: string | null; showcase: string[]; emoteDeck: string[] }
  | { ok: false; message: string };

/**
 * Whether a loadout is one this player may wear: every id real, of the right
 * kind, owned (or a starter), within the size limits, and no repeats.
 */
export function checkLoadout(
  input: { borderId?: unknown; showcase?: unknown; emoteDeck?: unknown },
  owned: Set<string>
): LoadoutCheck {
  const has = (id: string) => owned.has(id) || STARTER_IDS.includes(id);

  let borderId: string | null = null;
  if (input.borderId !== undefined && input.borderId !== null && input.borderId !== "") {
    if (typeof input.borderId !== "string") return { ok: false, message: "That is not a frame." };
    const item = itemById(input.borderId);
    if (!item || item.kind !== "border") return { ok: false, message: "That is not a frame." };
    if (!has(item.id)) return { ok: false, message: `You don't own ${item.name} yet.` };
    borderId = item.id;
  }

  const list = (value: unknown, kind: ItemKind, max: number, what: string): string[] | string => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return `${what} is a list.`;
    if (value.length > max) return `At most ${max} in ${what.toLowerCase()}.`;
    const out: string[] = [];
    for (const id of value) {
      const item = typeof id === "string" ? itemById(id) : undefined;
      if (!item || item.kind !== kind) return `Something in ${what.toLowerCase()} is not ${kind === "emote" ? "an emote" : "an artifact"}.`;
      if (!has(item.id)) return `You don't own ${item.name} yet.`;
      if (out.includes(item.id)) return `${item.name} is in ${what.toLowerCase()} twice.`;
      out.push(item.id);
    }
    return out;
  };

  const showcase = list(input.showcase, "artifact", SHOWCASE_SIZE, "The showcase");
  if (typeof showcase === "string") return { ok: false, message: showcase };
  const emoteDeck = list(input.emoteDeck, "emote", EMOTE_DECK_SIZE, "The emote deck");
  if (typeof emoteDeck === "string") return { ok: false, message: emoteDeck };

  return { ok: true, borderId, showcase, emoteDeck };
}

// ── Emotes at a live night ──

/** Seconds a player waits between emotes, and the most one player fires a night. */
export const EMOTE_COOLDOWN_SECONDS = 4;
export const EMOTES_PER_NIGHT = 60;

/**
 * The emotes a player can fire: their deck, keeping only what they still own
 * (or the starters), or the six starters when they have never built one.
 */
export function playableEmotes(deck: string[], owned: Iterable<string>): string[] {
  const have = new Set([...owned, ...STARTER_IDS]);
  const fromDeck = deck.filter((id) => itemById(id)?.kind === "emote" && have.has(id));
  return fromDeck.length > 0 ? fromDeck : [...STARTER_IDS];
}
