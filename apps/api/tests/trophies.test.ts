import { describe, it, expect } from "vitest";
import {
  ARENAS,
  BASE_TROPHIES,
  GUEST_DAILY_GAIN,
  GUEST_WEIGHT,
  MAX_SWING,
  TROPHY_TRACKS,
  aiTrophies,
  applyTrophies,
  arenaFor,
  capGain,
  isTrack,
  pairWeight,
  trackSummary,
  trophyDelta,
} from "../src/lib/trophies";
import { LEVEL_BANDS } from "../src/lib/progression";
import { ARENA_STYLE, TRACKS, arenaProgress, signedTrophies } from "../../frontend/lib/trophies";

describe("trophies for a game", () => {
  it("is ±30 between equals", () => {
    expect(trophyDelta({ mine: 800, theirs: 800, won: true })).toBe(BASE_TROPHIES);
    expect(trophyDelta({ mine: 800, theirs: 800, won: false })).toBe(-BASE_TROPHIES);
  });

  it("pays more for beating someone higher, and costs more losing to someone lower", () => {
    const upset = trophyDelta({ mine: 500, theirs: 750, won: true });
    const expected = trophyDelta({ mine: 750, theirs: 500, won: true });
    expect(upset).toBe(40);
    expect(expected).toBe(20);
    expect(trophyDelta({ mine: 750, theirs: 500, won: false })).toBe(-40);
    expect(trophyDelta({ mine: 500, theirs: 750, won: false })).toBe(-20);
  });

  it("never swings a full-weight game outside 20–40", () => {
    for (const [mine, theirs] of [[0, 9000], [9000, 0], [1200, 1210], [3000, 2999]]) {
      for (const won of [true, false]) {
        const d = Math.abs(trophyDelta({ mine, theirs, won }));
        expect(d).toBeGreaterThanOrEqual(BASE_TROPHIES - MAX_SWING);
        expect(d).toBeLessThanOrEqual(BASE_TROPHIES + MAX_SWING);
      }
    }
  });

  it("is zero-sum between two equal players at full weight", () => {
    for (const [a, b] of [[600, 600], [600, 900], [1500, 1100]]) {
      const winner = trophyDelta({ mine: a, theirs: b, won: true });
      const loser = trophyDelta({ mine: b, theirs: a, won: false });
      expect(winner + loser).toBe(0);
    }
  });

  it("weights a walk-in at half, and a third game against the same player at nothing", () => {
    expect(trophyDelta({ mine: 700, theirs: 700, won: true, weight: GUEST_WEIGHT })).toBe(15);
    expect(pairWeight(0)).toBe(1);
    expect(pairWeight(1)).toBe(0.5);
    expect(pairWeight(2)).toBe(0);
    expect(pairWeight(9)).toBe(0);
    expect(trophyDelta({ mine: 700, theirs: 700, won: true, weight: 0 })).toBe(0);
  });
});

describe("arenas, floors and the first arena", () => {
  it("starts everyone at the first arena, and climbs in order", () => {
    expect(arenaFor(0).from).toBe(0);
    for (let i = 1; i < ARENAS.length; i++) {
      expect(ARENAS[i].from).toBeGreaterThan(ARENAS[i - 1].from);
      expect(arenaFor(ARENAS[i].from).id).toBe(ARENAS[i].id);
      expect(arenaFor(ARENAS[i].from - 1).id).toBe(ARENAS[i - 1].id);
    }
  });

  it("costs nothing to lose in the first arena", () => {
    expect(applyTrophies(0, -30)).toEqual({ after: 0, delta: 0, floor: 0 });
    expect(applyTrophies(299, -40)).toEqual({ after: 299, delta: 0, floor: 0 });
  });

  it("never drops a player out of an arena they have reached", () => {
    expect(applyTrophies(310, -30)).toEqual({ after: 300, delta: -10, floor: 300 });
    expect(applyTrophies(300, -30)).toEqual({ after: 300, delta: 0, floor: 300 });
    expect(applyTrophies(1100, -30)).toEqual({ after: 1070, delta: -30, floor: 1000 });
  });

  it("adds a win in full, across an arena line", () => {
    expect(applyTrophies(290, 30)).toEqual({ after: 320, delta: 30, floor: 0 });
  });

  it("does not use a level band's name for an arena", () => {
    const bands = new Set(LEVEL_BANDS.map((b) => b.name));
    for (const arena of ARENAS) expect(bands.has(arena.name)).toBe(false);
  });

  it("summarises a player nobody has played yet", () => {
    const s = trackSummary(undefined);
    expect(s.trophies).toBe(0);
    expect(s.arena.name).toBe("Practice Table");
    expect(s.nextArena).toEqual({ name: "Corner Pub", at: 300 });
    expect(trackSummary({ trophies: 6000, peak: 6100, games: 1, wins: 1, losses: 0 }).nextArena).toBeNull();
  });
});

describe("caps", () => {
  it("trims a gain to what the day still allows, and never trims a loss", () => {
    expect(capGain(15, 0, GUEST_DAILY_GAIN)).toBe(15);
    expect(capGain(15, 80, GUEST_DAILY_GAIN)).toBe(10);
    expect(capGain(15, 90, GUEST_DAILY_GAIN)).toBe(0);
    expect(capGain(15, 500, GUEST_DAILY_GAIN)).toBe(0);
    expect(capGain(-30, 500, GUEST_DAILY_GAIN)).toBe(-30);
  });

  it("values the AI by difficulty, clamped to the levels that exist", () => {
    expect(aiTrophies(1)).toBe(300);
    expect(aiTrophies(2)).toBe(1500);
    expect(aiTrophies(3)).toBe(3000);
    expect(aiTrophies(9)).toBe(3000);
    expect(aiTrophies(undefined)).toBe(300);
  });
});

describe("the frontend and the API agree", () => {
  it("on the tracks", () => {
    expect(TRACKS).toEqual(TROPHY_TRACKS);
    for (const t of TROPHY_TRACKS) expect(isTrack(t.id)).toBe(true);
    expect(isTrack("offline:CHESS")).toBe(false);
  });

  it("on every arena's name and start", () => {
    expect(Object.keys(ARENA_STYLE)).toEqual(ARENAS.map((a) => a.id));
    for (const a of ARENAS) {
      expect(ARENA_STYLE[a.id].name).toBe(a.name);
      expect(ARENA_STYLE[a.id].from).toBe(a.from);
    }
  });

  it("writes a change the way a scoreboard does", () => {
    expect(signedTrophies(28)).toBe("+28");
    expect(signedTrophies(-30)).toBe("−30");
    expect(signedTrophies(0)).toBe("±0");
    expect(arenaProgress({ trophies: 450, arena: { id: "corner-pub", name: "Corner Pub", from: 300 }, nextArena: { name: "Back Room", at: 600 } })).toBe(50);
  });
});
