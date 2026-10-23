/**
 * The parts an avatar is built from, and the default every player starts with.
 *
 * The API holds the same part ids and unlock levels in
 * apps/api/src/lib/avatar.ts and refuses anything not listed there; the
 * avatar-mirror test in the API suite fails if the two drift apart. The art
 * that draws these parts is components/avatar.tsx.
 *
 * Pure data and pure functions, no React, so the API's tests can import it.
 */

export type AvatarConfig = Record<string, string>;

export interface AvatarPart {
  id: string;
  label: string;
  /** The level this part opens at. 1 = free from the start. */
  level: number;
  /** A colour to show on the picker, for the colour layers. */
  swatch?: string;
}

export interface AvatarLayer {
  key: string;
  label: string;
  parts: AvatarPart[];
}

const part = (id: string, label: string, level = 1, swatch?: string): AvatarPart => ({
  id,
  label,
  level,
  ...(swatch ? { swatch } : {}),
});

export const SKIN_TONES: Record<string, string> = {
  "tone-1": "#f8d9c0",
  "tone-2": "#f1c6a1",
  "tone-3": "#e5b08a",
  "tone-4": "#d39b6f",
  "tone-5": "#c08457",
  "tone-6": "#a86e43",
  "tone-7": "#8d5734",
  "tone-8": "#714427",
  "tone-9": "#55331d",
  "tone-10": "#3d2416",
};

export const HAIR_COLOURS: Record<string, string> = {
  black: "#1f1a17",
  "dark-brown": "#3b2a20",
  brown: "#6b4428",
  auburn: "#8e3b1e",
  blonde: "#d9b25f",
  grey: "#8c8c8c",
  white: "#e9e6df",
  "electric-blue": "#2f6fe0",
  cherry: "#c0263a",
};

export const CLOTH_COLOURS: Record<string, string> = {
  red: "#c8102e",
  gold: "#e8b923",
  navy: "#1f3a68",
  green: "#1f7a4a",
  black: "#1b1b1b",
  white: "#f2f2ee",
  purple: "#6b3fa0",
  orange: "#e0701b",
  teal: "#138a8a",
  pink: "#e05a8a",
};

export const BACKGROUNDS: Record<string, string> = {
  felt: "#1f6b45",
  midnight: "#141a2e",
  chalk: "#6fa8dc",
  ember: "#b8452f",
  plum: "#5a2d6e",
  sand: "#d9c39a",
  gold: "#e8b923",
  neon: "#138a8a",
  sunset: "#e0701b",
  legend: "#16150f",
};

const cloth = (level = 1) =>
  Object.entries(CLOTH_COLOURS).map(([id, hex]) => part(id, id[0].toUpperCase() + id.slice(1), level, hex));

export const AVATAR_LAYERS: AvatarLayer[] = [
  {
    key: "background",
    label: "Background",
    parts: [
      part("felt", "Felt", 1, BACKGROUNDS.felt),
      part("midnight", "Midnight", 1, BACKGROUNDS.midnight),
      part("chalk", "Chalk", 1, BACKGROUNDS.chalk),
      part("ember", "Ember", 1, BACKGROUNDS.ember),
      part("plum", "Plum", 1, BACKGROUNDS.plum),
      part("sand", "Sand", 1, BACKGROUNDS.sand),
      part("gold", "Gold", 6, BACKGROUNDS.gold),
      part("neon", "Neon", 11, BACKGROUNDS.neon),
      part("sunset", "Sunset", 18, BACKGROUNDS.sunset),
      part("legend", "Legend", 28, BACKGROUNDS.legend),
    ],
  },
  {
    key: "skin",
    label: "Skin",
    parts: Object.entries(SKIN_TONES).map(([id, hex], i) => part(id, `Tone ${i + 1}`, 1, hex)),
  },
  {
    key: "face",
    label: "Face",
    parts: [part("round", "Round"), part("oval", "Oval"), part("square", "Square"), part("heart", "Heart")],
  },
  {
    key: "eyes",
    label: "Eyes",
    parts: [
      part("open", "Open"),
      part("smile", "Smiling"),
      part("focus", "Focused"),
      part("sleepy", "Sleepy"),
      part("wink", "Wink"),
      part("wide", "Wide"),
      part("starry", "Starry", 11),
    ],
  },
  {
    key: "mouth",
    label: "Mouth",
    parts: [
      part("smile", "Smile"),
      part("grin", "Grin"),
      part("flat", "Straight"),
      part("smirk", "Smirk"),
      part("open", "Open"),
      part("gold-tooth", "Gold tooth", 18),
    ],
  },
  {
    key: "hair",
    label: "Hair",
    parts: [
      part("none", "None"),
      part("buzz", "Buzz"),
      part("short", "Short"),
      part("side-part", "Side part"),
      part("curly", "Curly"),
      part("afro", "Afro"),
      part("long", "Long"),
      part("bun", "Bun"),
      part("ponytail", "Ponytail"),
      part("top-knot", "Top knot"),
      part("mohawk", "Mohawk", 6),
    ],
  },
  {
    key: "hairColour",
    label: "Hair colour",
    parts: [
      part("black", "Black", 1, HAIR_COLOURS.black),
      part("dark-brown", "Dark brown", 1, HAIR_COLOURS["dark-brown"]),
      part("brown", "Brown", 1, HAIR_COLOURS.brown),
      part("auburn", "Auburn", 1, HAIR_COLOURS.auburn),
      part("blonde", "Blonde", 1, HAIR_COLOURS.blonde),
      part("grey", "Grey", 1, HAIR_COLOURS.grey),
      part("white", "White", 1, HAIR_COLOURS.white),
      part("electric-blue", "Electric blue", 3, HAIR_COLOURS["electric-blue"]),
      part("cherry", "Cherry", 3, HAIR_COLOURS.cherry),
    ],
  },
  {
    key: "facialHair",
    label: "Facial hair",
    parts: [
      part("none", "None"),
      part("stubble", "Stubble"),
      part("moustache", "Moustache"),
      part("beard", "Beard"),
      part("goatee", "Goatee"),
      part("handlebar", "Handlebar", 11),
    ],
  },
  {
    key: "headwear",
    label: "Headwear",
    parts: [
      part("none", "None"),
      part("cap", "Cap"),
      part("backwards-cap", "Cap, backwards"),
      part("beanie", "Beanie"),
      part("turban", "Turban"),
      part("patka", "Patka"),
      part("hijab", "Hijab"),
      part("bandana", "Bandana"),
      part("visor", "Visor", 3),
      part("crown", "Crown", 28),
    ],
  },
  { key: "headwearColour", label: "Headwear colour", parts: cloth() },
  {
    key: "outfit",
    label: "Outfit",
    parts: [
      part("tee", "T-shirt"),
      part("polo", "Polo"),
      part("hoodie", "Hoodie"),
      part("jersey", "Jersey"),
      part("waistcoat", "Waistcoat", 3),
      part("tuxedo", "Tuxedo", 18),
    ],
  },
  { key: "outfitColour", label: "Outfit colour", parts: cloth() },
  {
    key: "accessory",
    label: "Extra",
    parts: [
      part("none", "None"),
      part("glasses", "Glasses"),
      part("earring", "Earring"),
      part("chalk", "Chalk"),
      part("shades", "Shades", 3),
      part("cue", "Cue", 6),
      part("medal", "Medal", 11),
    ],
  },
];

/** Layer key → [id, level] pairs, in the API's shape, for the mirror test. */
export function partCatalogue(): Record<string, Array<[string, number]>> {
  return Object.fromEntries(AVATAR_LAYERS.map((l) => [l.key, l.parts.map((p) => [p.id, p.level] as [string, number])]));
}

/** FNV-1a: a small, stable hash so the same id always draws the same face. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a seeded sequence of numbers in [0, 1). */
function sequence(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Layers that look better left empty most of the time. A generated crowd where
 * everyone wears a hat and glasses looks like a costume party.
 */
const MOSTLY_NONE: Record<string, number> = { headwear: 0.65, accessory: 0.6, facialHair: 0.6 };

/**
 * The avatar a player has before they build one: generated from their id, so
 * it is the same on every screen and every visit, and built only from free
 * parts, so saving it unchanged is always allowed.
 */
export function defaultAvatar(seed: string): AvatarConfig {
  const next = sequence(hash(seed || "wta"));
  const avatar: AvatarConfig = {};
  for (const layer of AVATAR_LAYERS) {
    const free = layer.parts.filter((p) => p.level <= 1);
    const noneShare = MOSTLY_NONE[layer.key];
    if (noneShare !== undefined && next() < noneShare) {
      avatar[layer.key] = "none";
      continue;
    }
    const pool = noneShare !== undefined ? free.filter((p) => p.id !== "none") : free;
    avatar[layer.key] = pool[Math.floor(next() * pool.length)].id;
  }
  return avatar;
}

/**
 * The avatar to draw: what was saved, with any missing or unknown part filled
 * from the default, so one stale row can never draw a broken face.
 */
export function resolveAvatar(saved: AvatarConfig | null | undefined, seed: string): AvatarConfig {
  const base = defaultAvatar(seed);
  if (!saved) return base;
  const out: AvatarConfig = { ...base };
  for (const layer of AVATAR_LAYERS) {
    const value = saved[layer.key];
    if (value && layer.parts.some((p) => p.id === value)) out[layer.key] = value;
  }
  return out;
}

/** A random avatar from the parts open at `level`, for the editor's dice. */
export function randomAvatar(level: number, rand: () => number = Math.random): AvatarConfig {
  const avatar: AvatarConfig = {};
  for (const layer of AVATAR_LAYERS) {
    const open = layer.parts.filter((p) => p.level <= level);
    const noneShare = MOSTLY_NONE[layer.key];
    if (noneShare !== undefined && rand() < noneShare) {
      avatar[layer.key] = "none";
      continue;
    }
    const pool = noneShare !== undefined ? open.filter((p) => p.id !== "none") : open;
    avatar[layer.key] = pool[Math.floor(rand() * pool.length)].id;
  }
  return avatar;
}
