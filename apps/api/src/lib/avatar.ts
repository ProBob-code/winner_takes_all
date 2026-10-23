/**
 * The avatar a player builds from parts, as far as the server needs to know.
 *
 * See docs/progression-and-cosmetics-plan.md §7b. The art lives in the
 * frontend (apps/frontend/lib/avatar.ts and components/avatar.tsx); all the
 * server holds is which part ids exist and the level each one opens at, so it
 * can refuse a part a player has not reached. The avatar-mirror test fails if
 * the two lists drift apart.
 *
 * Built from parts rather than uploaded as a photo, deliberately: a parts
 * avatar needs no moderation and no file storage, puts no face photograph in
 * the database, and lets a part be something a level earns.
 *
 * A stored avatar is a small JSON object of layer → part id. A player who has
 * never saved one stores nothing, and the frontend draws a default generated
 * from their user id.
 */

/** Layer → [part id, level it opens at]. Level 1 means free from the start. */
export const AVATAR_PARTS: Record<string, Array<[string, number]>> = {
  background: [
    ["felt", 1], ["midnight", 1], ["chalk", 1], ["ember", 1], ["plum", 1], ["sand", 1],
    ["gold", 6], ["neon", 11], ["sunset", 18], ["legend", 28],
  ],
  skin: [
    ["tone-1", 1], ["tone-2", 1], ["tone-3", 1], ["tone-4", 1], ["tone-5", 1],
    ["tone-6", 1], ["tone-7", 1], ["tone-8", 1], ["tone-9", 1], ["tone-10", 1],
  ],
  face: [["round", 1], ["oval", 1], ["square", 1], ["heart", 1]],
  eyes: [
    ["open", 1], ["smile", 1], ["focus", 1], ["sleepy", 1], ["wink", 1], ["wide", 1],
    ["starry", 11],
  ],
  mouth: [
    ["smile", 1], ["grin", 1], ["flat", 1], ["smirk", 1], ["open", 1],
    ["gold-tooth", 18],
  ],
  hair: [
    ["none", 1], ["buzz", 1], ["short", 1], ["side-part", 1], ["curly", 1], ["afro", 1],
    ["long", 1], ["bun", 1], ["ponytail", 1], ["top-knot", 1], ["mohawk", 6],
  ],
  hairColour: [
    ["black", 1], ["dark-brown", 1], ["brown", 1], ["auburn", 1], ["blonde", 1],
    ["grey", 1], ["white", 1], ["electric-blue", 3], ["cherry", 3],
  ],
  facialHair: [
    ["none", 1], ["stubble", 1], ["moustache", 1], ["beard", 1], ["goatee", 1],
    ["handlebar", 11],
  ],
  headwear: [
    ["none", 1], ["cap", 1], ["backwards-cap", 1], ["beanie", 1], ["turban", 1],
    ["patka", 1], ["hijab", 1], ["bandana", 1], ["visor", 3], ["crown", 28],
  ],
  headwearColour: [
    ["red", 1], ["gold", 1], ["navy", 1], ["green", 1], ["black", 1],
    ["white", 1], ["purple", 1], ["orange", 1], ["teal", 1], ["pink", 1],
  ],
  outfit: [
    ["tee", 1], ["polo", 1], ["hoodie", 1], ["jersey", 1], ["waistcoat", 3], ["tuxedo", 18],
  ],
  outfitColour: [
    ["red", 1], ["gold", 1], ["navy", 1], ["green", 1], ["black", 1],
    ["white", 1], ["purple", 1], ["orange", 1], ["teal", 1], ["pink", 1],
  ],
  accessory: [
    ["none", 1], ["glasses", 1], ["earring", 1], ["chalk", 1], ["shades", 3],
    ["cue", 6], ["medal", 11],
  ],
};

export type AvatarConfig = Record<string, string>;

export type AvatarCheck =
  | { ok: true; avatar: AvatarConfig }
  | { ok: false; message: string };

/**
 * Whether `input` is a complete avatar this player may wear.
 *
 * Every layer must be present, every part must exist, and no part may open
 * above `level`. Unknown layers are refused rather than dropped, so a client
 * that thinks a layer exists finds out instead of silently losing it.
 */
export function checkAvatar(input: unknown, level: number): AvatarCheck {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "An avatar is a set of parts." };
  }
  const given = input as Record<string, unknown>;

  for (const key of Object.keys(given)) {
    if (!(key in AVATAR_PARTS)) {
      return { ok: false, message: `There is no "${key}" part.` };
    }
  }

  const avatar: AvatarConfig = {};
  for (const [layer, parts] of Object.entries(AVATAR_PARTS)) {
    const value = given[layer];
    if (typeof value !== "string") {
      return { ok: false, message: `Choose a ${layer}.` };
    }
    const part = parts.find(([id]) => id === value);
    if (!part) {
      return { ok: false, message: `"${value}" is not a ${layer}.` };
    }
    if (part[1] > level) {
      return { ok: false, message: `That ${layer} opens at level ${part[1]}.` };
    }
    avatar[layer] = value;
  }

  return { ok: true, avatar };
}

/**
 * A stored avatar, read back. Null when there is none or it no longer parses,
 * so the frontend falls back to the generated default rather than breaking a
 * page over one bad row.
 */
export function parseStoredAvatar(raw: string | null | undefined): AvatarConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const out: AvatarConfig = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && k in AVATAR_PARTS) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}
