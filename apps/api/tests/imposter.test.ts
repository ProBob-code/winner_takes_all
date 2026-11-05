import { describe, expect, it } from "vitest";
import {
  BOT_CLUES,
  ROOM_CODE,
  TAUNT_KEYS,
  WORD_PAIRS,
  clueProblem,
  innocentsWin,
  leaks,
  maxImposters,
  newRoomCode,
  tally,
} from "../src/lib/imposter";
import {
  COIN_AWARDS,
  IMPOSTER_MIN_PLAYERS_FOR_COINS,
  ONLINE_REASONS,
  awardsForImposter,
} from "../src/lib/coins";

describe("clues", () => {
  it("refuses a clue that says the word or any real part of it", () => {
    expect(leaks("Ice cream", "a cold cream treat")).toBe(true);
    expect(leaks("Pav Bhaji", "bhaji with butter")).toBe(true);
    expect(leaks("Tea", "TEA time")).toBe(true);
    expect(leaks("Ice", "cold and solid")).toBe(false);
  });

  it("ignores short fragments, so 'Ola' does not ban every clue with 'ola' in it... unless it is the word", () => {
    expect(leaks("Auto rickshaw", "three wheels")).toBe(false);
    expect(leaks("Ola", "cola ride")).toBe(true);
  });

  it("explains a refused clue", () => {
    expect(clueProblem("Tea", " ")).toMatch(/short clue/);
    expect(clueProblem("Tea", "x".repeat(61))).toMatch(/60/);
    expect(clueProblem("Tea", "green tea")).toMatch(/describe/);
    expect(clueProblem("Tea", "hot morning drink")).toBeNull();
  });

  it("gives every word in every pair a bot clue that does not leak it", () => {
    for (const pair of WORD_PAIRS) {
      for (const word of pair) {
        const clues = BOT_CLUES[word];
        expect(clues?.length, word).toBeGreaterThan(0);
        for (const c of clues) expect(leaks(word, c), `${word}: ${c}`).toBe(false);
      }
    }
  });
});

describe("the room", () => {
  it("keeps imposters a minority", () => {
    expect(maxImposters(3)).toBe(1);
    expect(maxImposters(4)).toBe(1);
    expect(maxImposters(5)).toBe(2);
    expect(maxImposters(10)).toBe(4);
  });

  it("makes readable codes", () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(ROOM_CODE);
    expect(ROOM_CODE.test("AB0O1")).toBe(false);
  });

  it("relays only the twenty known taunts", () => {
    expect(TAUNT_KEYS.size).toBe(20);
    expect(TAUNT_KEYS.has("e11")).toBe(true);
    expect(TAUNT_KEYS.has("s8")).toBe(false);
  });
});

describe("counting votes", () => {
  const pool = ["a", "b", "c", "d"];

  it("puts out whoever got the most votes", () => {
    const t = tally({ pool, need: 1, votes: { a: ["b"], b: ["c"], c: ["b"], d: ["b"] }, revote: null });
    expect(t).toMatchObject({ kind: "done", out: ["b"], tiedAgain: false });
  });

  it("sends a tie across the cut line to a runoff of just the tied players", () => {
    const t = tally({ pool, need: 1, votes: { a: ["b"], b: ["c"], c: ["b"], d: ["c"] }, revote: null });
    expect(t.kind).toBe("revote");
    if (t.kind !== "revote") return;
    expect(t.revote.candidates.sort()).toEqual(["b", "c"]);
    expect(t.revote.seats).toBe(1);
    expect(t.revote.fixed).toEqual([]);
  });

  it("keeps a clear leader out while the rest go to the runoff", () => {
    const t = tally({
      pool,
      need: 2,
      votes: { a: ["b", "c"], b: ["c", "d"], c: ["b", "a"], d: ["c", "a"] },
      revote: null,
    });
    // c: 3, b: 2, a: 2, d: 1 -> c is out, a and b tie for the last seat.
    expect(t.kind).toBe("revote");
    if (t.kind !== "revote") return;
    expect(t.revote.fixed).toEqual(["c"]);
    expect(t.revote.candidates.sort()).toEqual(["a", "b"]);
    expect(t.revote.seats).toBe(1);
  });

  it("lets a second tie go: only the players already clear are out", () => {
    const revote = { id: "r", candidates: ["a", "b"], seats: 1, fixed: ["c"] };
    const t = tally({ pool: ["a", "b"], need: 1, votes: { c: ["a"], d: ["b"] }, revote });
    expect(t).toMatchObject({ kind: "done", out: ["c"], tiedAgain: true });
  });

  it("never puts out someone nobody voted for", () => {
    const t = tally({ pool, need: 2, votes: { a: ["b"] }, revote: null });
    expect(t).toMatchObject({ kind: "done", out: ["b"] });
  });

  it("puts nobody out when nobody voted", () => {
    const t = tally({ pool, need: 1, votes: {}, revote: null });
    expect(t).toMatchObject({ kind: "done", out: [] });
  });

  it("gives innocents the win only for catching every imposter", () => {
    expect(innocentsWin(["b"], ["b"], false)).toBe(true);
    expect(innocentsWin(["b", "c"], ["b"], false)).toBe(false);
    expect(innocentsWin(["b"], ["b"], true)).toBe(false);
  });
});

describe("what Imposter pays", () => {
  it("pays winners only, imposters more", () => {
    expect(awardsForImposter({ won: false, imposter: true })).toEqual([]);
    const caught = awardsForImposter({ won: true, imposter: false });
    const escaped = awardsForImposter({ won: true, imposter: true });
    expect(caught[0].amount).toBe(COIN_AWARDS.IMPOSTER_CAUGHT);
    expect(escaped[0].amount).toBe(COIN_AWARDS.IMPOSTER_ESCAPED);
    expect(escaped[0].amount).toBeGreaterThan(caught[0].amount);
  });

  it("stays below a venue frame and inside the online cap", () => {
    expect(COIN_AWARDS.IMPOSTER_ESCAPED).toBeLessThan(COIN_AWARDS.FRAME_PLAYED + COIN_AWARDS.FRAME_WON);
    expect(ONLINE_REASONS).toEqual(expect.arrayContaining(["IMPOSTER_CAUGHT", "IMPOSTER_ESCAPED"]));
  });

  it("needs a real game of three", () => {
    expect(IMPOSTER_MIN_PLAYERS_FOR_COINS).toBe(3);
  });
});
