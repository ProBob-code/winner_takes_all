/**
 * The screen's idea of the order must be the engine's idea of the order.
 *
 * apps/frontend/lib/standings.ts ranks and places the table for every screen
 * that shows one — the big screen, the arena, the staff phone. The engine
 * ranks it too, for the bracket and the payout. Two copies of an ordering is
 * exactly the kind of drift that has the wall showing one leader and the
 * payout going to another.
 *
 * Like local-score-mirror, this lives in the API's suite because this is the
 * only place that can import both and compare them.
 */

import { describe, it, expect } from "vitest";
import * as Engine from "../src/lib/tournament-engine";
import { tableText } from "../src/lib/share-text";
import { rankStandings, placeStandings, anythingCounted } from "../../frontend/lib/standings";

interface Row {
  id: string;
  name: string;
  matches_played: number;
  group_points: number;
  total_score: number;
  bye_assigned: boolean;
}

const row = (id: string, won: number, score: number, played = won + 1): Row => ({
  id,
  name: id,
  matches_played: played,
  group_points: won,
  total_score: score,
  bye_assigned: false,
});

describe("rankStandings agrees with the engine", () => {
  it("orders on wins, then score, exactly as rankTeams does", () => {
    const teams = [row("a", 1, 40), row("b", 2, 10), row("c", 1, 90), row("d", 0, 200)];
    const mine = rankStandings(teams).map((t) => t.id);
    const theirs = Engine.rankTeams(teams as any).map((t: any) => t.id);
    expect(mine).toEqual(theirs);
  });

  it("agrees across a hundred shuffled tables", () => {
    // The tie-break on fewest played is the screen's alone — the engine stops
    // at score — so rows are built so that never has to decide.
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let round = 0; round < 100; round++) {
      const teams: Row[] = [];
      for (let i = 0; i < 6; i++) teams.push(row(`t${i}`, rand(4), i * 10 + rand(3) * 100));
      const mine = rankStandings(teams).map((t) => t.id);
      const theirs = Engine.rankTeams(teams as any).map((t: any) => t.id);
      expect(mine).toEqual(theirs);
    }
  });
});

describe("placeStandings", () => {
  it("gives level players the same position and skips the next", () => {
    // The screenshot that started this: three players on one win and 100
    // points each, handed gold, silver and bronze by nothing but row order.
    const ranked = rankStandings([row("a", 1, 100), row("b", 1, 100), row("c", 1, 100), row("d", 0, 60)]);
    const placed = placeStandings(ranked);
    expect(placed.map((p) => p.position)).toEqual([1, 1, 1, 4]);
  });

  it("withholds the medal from a shared place", () => {
    const ranked = rankStandings([row("a", 1, 100), row("b", 1, 100), row("c", 0, 60)]);
    const placed = placeStandings(ranked);
    // The two who are level take no medal between them. The player below
    // them is outright third, and third is a real place, so it stands.
    expect(placed.map((p) => p.medal)).toEqual([null, null, 3]);
    expect(placed.map((p) => p.shared)).toEqual([true, true, false]);
  });

  it("awards the medal when the place is outright", () => {
    const ranked = rankStandings([row("a", 3, 300), row("b", 2, 200), row("c", 1, 100), row("d", 0, 10)]);
    const placed = placeStandings(ranked);
    expect(placed.map((p) => p.medal)).toEqual([1, 2, 3, null]);
  });

  it("medals an outright third even when first and second are level", () => {
    const ranked = rankStandings([row("a", 2, 100), row("b", 2, 100), row("c", 1, 50)]);
    const placed = placeStandings(ranked);
    expect(placed.map((p) => p.position)).toEqual([1, 1, 3]);
    expect(placed.map((p) => p.medal)).toEqual([null, null, 3]);
  });

  it("places nobody at all while the table is empty", () => {
    const fresh = [row("a", 0, 0, 0), row("b", 0, 0, 0), row("c", 0, 0, 0)];
    const placed = placeStandings(rankStandings(fresh));
    expect(placed.every((p) => p.medal === null)).toBe(true);
    // Not "joint first on zero" — that is a fact about the sort, not the night.
    expect(placed.every((p) => p.shared === false)).toBe(true);
    expect(placed.map((p) => p.position)).toEqual([1, 1, 1]);
  });

  it("knows whether anything has counted", () => {
    expect(anythingCounted([row("a", 0, 0, 0)])).toBe(false);
    expect(anythingCounted([row("a", 0, 0, 1)])).toBe(true);
    expect(anythingCounted([row("a", 1, 0, 0)])).toBe(true);
    expect(anythingCounted([])).toBe(false);
  });

  it("handles a one-player table without inventing a tie", () => {
    const placed = placeStandings(rankStandings([row("a", 1, 100)]));
    expect(placed).toEqual([{ position: 1, shared: false, medal: 1 }]);
  });
});

describe("the WhatsApp table agrees with the screens", () => {
  // share-text.ts carries its own copy of the placing rule, the way
  // local-score.ts carries its own copy of the scoring rules. This is what
  // stops the two drifting, so the message and the wall never disagree about
  // who is leading.
  const NEWLINE = String.fromCharCode(10);
  const MEDALS = [0x1f947, 0x1f948, 0x1f949].map((cp) => String.fromCodePoint(cp));

  const tables: Row[][] = [
    [row("ava", 1, 100), row("ben", 1, 100), row("cal", 1, 100), row("dee", 0, 60)],
    [row("ava", 3, 300), row("ben", 2, 200), row("cal", 1, 100), row("dee", 0, 10)],
    [row("ava", 2, 100), row("ben", 2, 100), row("cal", 1, 50)],
    [row("ava", 1, 100)],
  ];

  const lineFor = (text: string, name: string) =>
    text.split(NEWLINE).find((l) => l.includes(name));

  it("marks exactly the places the screens mark as shared", () => {
    for (const teams of tables) {
      const ranked = rankStandings(teams);
      const placed = placeStandings(ranked);
      const text = tableText("Friday night", ranked);

      placed.forEach((p, i) => {
        const line = lineFor(text, ranked[i].name);
        expect(line).toBeDefined();
        expect(line!.startsWith("=" + p.position + ".")).toBe(p.shared);
      });
    }
  });

  it("puts a medal in the message only where the screens put one", () => {
    for (const teams of tables) {
      const ranked = rankStandings(teams);
      const placed = placeStandings(ranked);
      const text = tableText("Friday night", ranked);

      placed.forEach((p, i) => {
        const line = lineFor(text, ranked[i].name)!;
        expect(MEDALS.some((m) => line.includes(m))).toBe(p.medal !== null);
        if (p.medal) expect(line.includes(MEDALS[p.medal - 1])).toBe(true);
      });
    }
  });

  it("says so in the message when a place is shared", () => {
    const ranked = rankStandings(tables[0]);
    expect(tableText("Friday night", ranked)).toContain("A place marked = is shared");
  });

  it("leaves that note out when nobody is level", () => {
    const ranked = rankStandings(tables[1]);
    expect(tableText("Friday night", ranked)).not.toContain("is shared");
  });
});
