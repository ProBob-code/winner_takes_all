/**
 * The avatar a player can save, and the screen's idea of the same parts.
 *
 * The frontend draws parts from apps/frontend/lib/avatar.ts and the API
 * accepts parts from src/lib/avatar.ts. If the two drift, the editor offers a
 * part the server refuses, or the server accepts one nothing can draw. Like
 * the other mirror tests, this lives here because only this suite can import
 * both.
 */

import { describe, it, expect } from "vitest";
import { AVATAR_PARTS, checkAvatar, parseStoredAvatar } from "../src/lib/avatar";
import {
  AVATAR_LAYERS,
  defaultAvatar,
  partCatalogue,
  randomAvatar,
  resolveAvatar,
} from "../../frontend/lib/avatar";

describe("the frontend and the API agree on the parts", () => {
  it("lists the same layers, parts and unlock levels", () => {
    expect(partCatalogue()).toEqual(AVATAR_PARTS);
  });

  it("gives every colour layer a swatch to show", () => {
    for (const key of ["skin", "hairColour", "headwearColour", "outfitColour", "background"]) {
      const layer = AVATAR_LAYERS.find((l) => l.key === key)!;
      for (const part of layer.parts) expect(part.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("makes every layer usable from the first day", () => {
    for (const [layer, parts] of Object.entries(AVATAR_PARTS)) {
      const free = parts.filter(([, level]) => level <= 1);
      expect(free.length, layer).toBeGreaterThanOrEqual(3);
    }
  });

  it("offers headwear for every faith that wears it", () => {
    const headwear = AVATAR_PARTS.headwear.map(([id]) => id);
    for (const id of ["turban", "patka", "hijab"]) {
      expect(headwear).toContain(id);
      expect(AVATAR_PARTS.headwear.find(([p]) => p === id)![1]).toBe(1);
    }
  });
});

describe("the generated default", () => {
  it("is the same every time for the same player", () => {
    expect(defaultAvatar("WTA-JTYPHC")).toEqual(defaultAvatar("WTA-JTYPHC"));
  });

  it("differs between players", () => {
    const faces = new Set(
      Array.from({ length: 40 }, (_, i) => JSON.stringify(defaultAvatar(`user_${i}`)))
    );
    expect(faces.size).toBeGreaterThan(35);
  });

  it("can always be saved by a brand-new player", () => {
    for (let i = 0; i < 200; i++) {
      const result = checkAvatar(defaultAvatar(`player-${i}`), 1);
      expect(result.ok).toBe(true);
    }
  });

  it("fills a stale or partial save from the default", () => {
    const seed = "user_abc";
    const resolved = resolveAvatar({ hair: "not-a-hair", skin: "tone-3" }, seed);
    expect(resolved.skin).toBe("tone-3");
    expect(resolved.hair).toBe(defaultAvatar(seed).hair);
    expect(checkAvatar(resolved, 1).ok).toBe(true);
  });

  it("shuffles only to parts the player has opened", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      expect(checkAvatar(randomAvatar(1, rand), 1).ok).toBe(true);
    }
  });
});

describe("saving an avatar", () => {
  const base = defaultAvatar("someone");

  it("refuses a part above the player's level", () => {
    const result = checkAvatar({ ...base, headwear: "crown" }, 27);
    expect(result).toEqual({ ok: false, message: "That headwear opens at level 28." });
    expect(checkAvatar({ ...base, headwear: "crown" }, 28).ok).toBe(true);
  });

  it("refuses a part that does not exist", () => {
    expect(checkAvatar({ ...base, hair: "wig" }, 99).ok).toBe(false);
  });

  it("refuses a layer that does not exist, rather than dropping it", () => {
    expect(checkAvatar({ ...base, cape: "red" }, 99).ok).toBe(false);
  });

  it("refuses an avatar missing a layer", () => {
    const { mouth: _mouth, ...rest } = base;
    expect(checkAvatar(rest, 99).ok).toBe(false);
  });

  it("refuses things that are not an avatar at all", () => {
    for (const bad of [null, undefined, "felt", 7, [], { hair: 3 }]) {
      expect(checkAvatar(bad, 99).ok).toBe(false);
    }
  });

  it("reads back what it stored, and nothing on a broken row", () => {
    expect(parseStoredAvatar(JSON.stringify(base))).toEqual(base);
    expect(parseStoredAvatar(null)).toBeNull();
    expect(parseStoredAvatar("{not json")).toBeNull();
    expect(parseStoredAvatar("[1,2]")).toBeNull();
  });
});
