import { describe, it, expect } from "vitest";
import {
  CATALOGUE,
  COLLECTION_POINTS,
  EMOTE_DECK_SIZE,
  PRICES,
  SHOWCASE_SIZE,
  STARTER_IDS,
  checkLoadout,
  collectionPointsFor,
  dailyPicks,
  isForSale,
  itemById,
  playableEmotes,
  EMOTE_COOLDOWN_SECONDS,
  EMOTES_PER_NIGHT,
} from "../src/lib/shop";
import { COIN_RULES } from "../src/lib/coins";
import { levelInfo } from "../src/lib/progression";
import { ITEMS } from "../../frontend/lib/shop";

/**
 * The shop is where coins are spent, so these pin the properties that keep a
 * coin on the right side of lib/coins.ts: cosmetics only, fixed prices,
 * nothing random, nothing that can be passed on.
 */
describe("what is for sale", () => {
  it("is cosmetics only: artifacts, avatar frames and emotes", () => {
    for (const item of CATALOGUE) expect(["artifact", "border", "emote"]).toContain(item.kind);
  });

  it("has one fixed price per rarity, rising with it", () => {
    expect(PRICES.common).toBeLessThan(PRICES.rare);
    expect(PRICES.rare).toBeLessThan(PRICES.epic);
    expect(PRICES.epic).toBeLessThan(PRICES.legendary);
    for (const price of Object.values(PRICES)) expect(Number.isInteger(price) && price > 0).toBe(true);
  });

  it("never sells the starter emotes, which everyone already has", () => {
    expect(STARTER_IDS.length).toBe(6);
    for (const id of STARTER_IDS) expect(isForSale(itemById(id)!)).toBe(false);
  });

  it("has unique ids, each prefixed by its kind", () => {
    const ids = CATALOGUE.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of CATALOGUE) expect(item.id.startsWith(`${item.kind}.`)).toBe(true);
  });

  it("is published as spendable on cosmetics, and still not purchasable or transferable", () => {
    expect(COIN_RULES.spendableOn).toBe("cosmetics");
    expect(COIN_RULES.purchasable).toBe(false);
    expect(COIN_RULES.transferable).toBe(false);
    expect(COIN_RULES.wagerable).toBe(false);
  });

  it("matches the frontend's catalogue item for item", () => {
    const strip = (i: { id: string; kind: string; name: string; rarity: string; starter?: boolean }) => ({
      id: i.id, kind: i.kind, name: i.name, rarity: i.rarity, starter: !!i.starter,
    });
    expect(ITEMS.map(strip)).toEqual(CATALOGUE.map(strip));
  });
});

describe("today's picks", () => {
  it("are the same all day and for everyone: chosen by date, not chance", () => {
    expect(dailyPicks("2026-10-23")).toEqual(dailyPicks("2026-10-23"));
  });

  it("change from day to day", () => {
    const days = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"].map((d) => dailyPicks(d).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it("are six different items that are actually for sale", () => {
    const picks = dailyPicks("2026-10-23");
    expect(picks).toHaveLength(6);
    expect(new Set(picks).size).toBe(6);
    for (const id of picks) expect(isForSale(itemById(id)!)).toBe(true);
  });
});

describe("collection points", () => {
  it("add up by rarity, and starters count for nothing", () => {
    expect(collectionPointsFor([])).toBe(0);
    expect(collectionPointsFor(["artifact.chalk-cube"])).toBe(COLLECTION_POINTS.common);
    expect(collectionPointsFor(["artifact.golden-eight", "border.felt"])).toBe(COLLECTION_POINTS.legendary + COLLECTION_POINTS.common);
    expect(collectionPointsFor(STARTER_IDS)).toBe(0);
    expect(collectionPointsFor(["not.an-item"])).toBe(0);
  });

  it("raise the Collection Level, which spending can never lower", () => {
    const before = levelInfo(150_000).xp;
    const after = levelInfo(150_000, collectionPointsFor(["artifact.golden-eight"])).xp;
    expect(after).toBe(before + COLLECTION_POINTS.legendary);
  });
});

describe("what a player may have on show", () => {
  const owned = new Set(["artifact.chalk-cube", "artifact.rack", "artifact.bridge", "artifact.cue-tip", "border.neon", "emote.clutch"]);

  it("accepts owned items of the right kind", () => {
    const r = checkLoadout({ borderId: "border.neon", showcase: ["artifact.rack"], emoteDeck: ["emote.gg", "emote.clutch"] }, owned);
    expect(r).toEqual({ ok: true, borderId: "border.neon", showcase: ["artifact.rack"], emoteDeck: ["emote.gg", "emote.clutch"] });
  });

  it("lets anyone use the starter emotes without buying them", () => {
    expect(checkLoadout({ emoteDeck: STARTER_IDS }, new Set()).ok).toBe(true);
  });

  it("refuses an item not owned", () => {
    expect(checkLoadout({ borderId: "border.gold" }, owned)).toEqual({ ok: false, message: "You don't own Champion Gold yet." });
    expect(checkLoadout({ showcase: ["artifact.golden-eight"] }, owned).ok).toBe(false);
  });

  it("refuses an item of the wrong kind in a slot", () => {
    expect(checkLoadout({ borderId: "artifact.rack" }, owned).ok).toBe(false);
    expect(checkLoadout({ showcase: ["border.neon"] }, owned).ok).toBe(false);
    expect(checkLoadout({ emoteDeck: ["artifact.rack"] }, owned).ok).toBe(false);
  });

  it("holds the showcase to three and the deck to eight, with no repeats", () => {
    expect(SHOWCASE_SIZE).toBe(3);
    expect(EMOTE_DECK_SIZE).toBe(8);
    expect(checkLoadout({ showcase: ["artifact.chalk-cube", "artifact.rack", "artifact.bridge", "artifact.cue-tip"] }, owned).ok).toBe(false);
    expect(checkLoadout({ showcase: ["artifact.rack", "artifact.rack"] }, owned).ok).toBe(false);
  });

  it("treats a missing or empty frame as no frame", () => {
    expect(checkLoadout({ borderId: "" }, owned)).toMatchObject({ ok: true, borderId: null });
    expect(checkLoadout({}, owned)).toEqual({ ok: true, borderId: null, showcase: [], emoteDeck: [] });
  });
});

describe("emotes a player can fire at a night", () => {
  it("are their deck, when they have built one", () => {
    expect(playableEmotes(["emote.clutch", "emote.gg"], ["emote.clutch"])).toEqual(["emote.clutch", "emote.gg"]);
  });

  it("are the six starters, when they have not", () => {
    expect(playableEmotes([], [])).toEqual(STARTER_IDS);
  });

  it("drop anything no longer owned or not an emote", () => {
    expect(playableEmotes(["emote.crown", "artifact.rack", "emote.shot"], [])).toEqual(["emote.shot"]);
  });

  it("fall back to the starters if nothing in the deck is playable", () => {
    expect(playableEmotes(["emote.crown"], [])).toEqual(STARTER_IDS);
  });

  it("are limited to one every few seconds and a fair number a night", () => {
    expect(EMOTE_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(3);
    expect(EMOTES_PER_NIGHT).toBeLessThanOrEqual(100);
  });
});
