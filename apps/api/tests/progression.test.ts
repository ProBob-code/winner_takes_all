import { describe, it, expect } from "vitest";
import {
  LEVEL_BANDS,
  bandFor,
  coinsForLevel,
  levelForXp,
  levelInfo,
  xpForLevel,
  xpFromCoins,
} from "../src/lib/progression";
import { COIN_TITLES, COIN_UNIT, titleFor } from "../src/lib/coins";
import { LEVEL_BAND_IDS, levelProgress } from "../../frontend/lib/progression";

describe("the level curve", () => {
  it("matches the figures in the plan", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(3)).toBe(150);
    expect(xpForLevel(5)).toBe(500);
    expect(xpForLevel(10)).toBe(2_250);
    expect(xpForLevel(20)).toBe(9_500);
  });

  it("costs 50 XP more for each level than the one before", () => {
    for (let n = 2; n < 80; n++) {
      const cost = xpForLevel(n + 1) - xpForLevel(n);
      const previous = xpForLevel(n) - xpForLevel(n - 1);
      expect(cost - previous).toBe(50);
    }
  });

  it("puts a player exactly on a threshold at the higher level", () => {
    for (let n = 1; n < 200; n++) {
      expect(levelForXp(xpForLevel(n))).toBe(n);
      if (n > 1) expect(levelForXp(xpForLevel(n) - 1)).toBe(n - 1);
    }
  });

  it("never goes down as experience grows", () => {
    let last = 1;
    for (let xp = 0; xp <= 100_000; xp += 37) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it("starts everyone at level 1, whatever nonsense it is handed", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-500)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelInfo(0).level).toBe(1);
  });
});

describe("experience from coins", () => {
  it("is one XP per coin unit, and partial units wait", () => {
    expect(xpFromCoins(0)).toBe(0);
    expect(xpFromCoins(COIN_UNIT - 1)).toBe(0);
    expect(xpFromCoins(COIN_UNIT)).toBe(1);
    expect(xpFromCoins(50 * COIN_UNIT)).toBe(50);
  });

  it("turns one night turned up for into level 2", () => {
    // Turning up (10k) and four frames, two won (2 × 5k + 2 × 15k), is 50k.
    expect(levelInfo(50 * COIN_UNIT).level).toBe(2);
  });

  it("adds collection points on top of coins", () => {
    expect(levelInfo(0, 150).level).toBe(3);
    expect(levelInfo(100 * COIN_UNIT, 50).level).toBe(3);
  });

  it("reports progress that adds up", () => {
    const info = levelInfo(1_234 * COIN_UNIT);
    expect(info.xp).toBe(1_234);
    expect(info.levelXp).toBeLessThanOrEqual(info.xp);
    expect(info.nextXp).toBeGreaterThan(info.xp);
    expect(info.toNext).toBe(info.nextXp - info.xp);
    expect(levelProgress(info)).toBeGreaterThanOrEqual(0);
    expect(levelProgress(info)).toBeLessThanOrEqual(100);
  });
});

describe("level names", () => {
  it("names every level, from the first band", () => {
    expect(LEVEL_BANDS[0].from).toBe(1);
    expect(bandFor(1).name).toBe("New in");
    expect(bandFor(500).name).toBe("Hall of Fame");
  });

  it("counts pips through a band and leaves the last one open", () => {
    const contender = levelInfo(coinsForLevel(6));
    expect(contender.band.name).toBe("Contender");
    expect(contender.pip).toBe(1);
    expect(contender.pips).toBe(5);
    expect(contender.nextBand).toEqual({ name: "Shark", level: 11 });

    const top = levelInfo(coinsForLevel(60));
    expect(top.band.name).toBe("Hall of Fame");
    expect(top.pips).toBeNull();
    expect(top.nextBand).toBeNull();
  });

  it("publishes the same ladder as the coin titles", () => {
    // COIN_TITLES is written out as plain numbers for the rules page; it must
    // be exactly the bands, at the coins each band's first level needs.
    expect(COIN_TITLES.map((t) => t.title)).toEqual(LEVEL_BANDS.map((b) => b.name));
    for (const band of LEVEL_BANDS) {
      const title = COIN_TITLES.find((t) => t.title === band.name)!;
      expect(title.at).toBe(coinsForLevel(band.from));
      expect(titleFor(title.at)).toBe(band.name);
      expect(levelInfo(title.at).band.name).toBe(band.name);
    }
  });

  it("cost nobody the title they held under the old balance thresholds", () => {
    const old: Array<[string, number]> = [
      ["Regular", 250_000],
      ["Contender", 1_000_000],
      ["Shark", 3_000_000],
      ["Hustler", 8_000_000],
      ["Legend", 20_000_000],
    ];
    for (const [name, at] of old) {
      const now = COIN_TITLES.find((t) => t.title === name)!;
      expect(now.at).toBeLessThanOrEqual(at);
    }
  });

  it("draws a badge for every band the API can send", () => {
    expect([...LEVEL_BAND_IDS]).toEqual(LEVEL_BANDS.map((b) => b.id));
  });
});
