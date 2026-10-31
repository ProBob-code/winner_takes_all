import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  assessProof,
  compareAll,
  compareFixes,
  disputingTeams,
  formatCode,
  generateCode,
  keepsCoinAward,
  minimumSeconds,
  nightWinShare,
  normalizeCode,
  trophyWeight,
  type ProofInput,
} from "../src/lib/proof";

const bytes = (n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

// About 50 m apart, in Kochi.
const TABLE = { lat: 9.9312, lng: 76.2673, acc: 20 };
const NEXT_TO_IT = { lat: 9.9316, lng: 76.2674, acc: 25 };
const ACROSS_TOWN = { lat: 10.0159, lng: 76.3419, acc: 20 };

function game(over: Partial<ProofInput> = {}, sides: Partial<ProofInput["sides"][number]>[] = [{}, {}]): ProofInput {
  return {
    sport: "8BALL",
    scorerFix: null,
    venueNight: false,
    durationSeconds: 600,
    points: 0,
    ...over,
    sides: [
      { teamId: "a", userId: "u1", checkedIn: true, fix: null, ...sides[0] },
      { teamId: "b", userId: "u2", checkedIn: true, fix: null, ...sides[1] },
    ],
  };
}

describe("codes", () => {
  it("are six characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode(bytes);
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("never use characters people misread", () => {
    for (const ch of "0O1IL") expect(CODE_ALPHABET).not.toContain(ch);
  });

  it("accept what people actually type", () => {
    expect(normalizeCode("k7m-q2p")).toBe("K7MQ2P");
    expect(normalizeCode(" K7M Q2P ")).toBe("K7MQ2P");
    expect(normalizeCode("K7MQ2")).toBeNull();
    expect(normalizeCode("K7MQ0P")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });

  it("are shown in two halves", () => {
    expect(formatCode("K7MQ2P")).toBe("K7M-Q2P");
  });
});

describe("proximity", () => {
  it("knows the same table, and the other side of town", () => {
    expect(compareFixes(TABLE, NEXT_TO_IT)).toBe("near");
    expect(compareFixes(TABLE, ACROSS_TOWN)).toBe("far");
  });

  it("does not call a vague reading far", () => {
    const close = { lat: 9.9342, lng: 76.2673, acc: 300 }; // ~330 m, ±300 m
    expect(compareFixes(TABLE, close)).toBe("near");
    const vague = { lat: 9.9372, lng: 76.2673, acc: 400 }; // ~670 m, ±400 m
    expect(compareFixes(TABLE, vague)).toBe("unknown");
    const vaguer = { lat: 9.9412, lng: 76.2673, acc: 300 }; // ~1.1 km, ±300 m
    expect(compareFixes(TABLE, vaguer)).toBe("unknown");
  });

  it("needs every pair near, and any pair far is far", () => {
    expect(compareAll([TABLE, NEXT_TO_IT])).toBe("near");
    expect(compareAll([TABLE, NEXT_TO_IT, ACROSS_TOWN])).toBe("far");
    expect(compareAll([TABLE])).toBe("unknown");
  });
});

describe("the verdict", () => {
  it("is practice against a walk-in", () => {
    expect(assessProof(game({}, [{}, { userId: null, checkedIn: false }])).tier).toBe("PRACTICE");
  });

  it("is practice when a player never typed the code", () => {
    const v = assessProof(game({}, [{}, { checkedIn: false }]));
    expect(v).toEqual({ tier: "PRACTICE", reasons: ["not_checked_in"] });
  });

  it("is practice for a game against your own account", () => {
    expect(assessProof(game({}, [{}, { userId: "u1" }])).reasons).toEqual(["same_account"]);
  });

  it("is practice for a game too fast to have been played", () => {
    expect(assessProof(game({ durationSeconds: 30 })).reasons).toEqual(["too_fast"]);
    expect(assessProof(game({ sport: "BADMINTON", points: 40, durationSeconds: 120 })).reasons).toEqual(["too_fast"]);
    expect(assessProof(game({ sport: "BADMINTON", points: 40, durationSeconds: 400 })).tier).toBe("PARTLY");
  });

  it("is partly verified with the handshake and no location", () => {
    expect(assessProof(game())).toEqual({ tier: "PARTLY", reasons: ["no_location"] });
  });

  it("is verified when both phones were at the table", () => {
    expect(assessProof(game({}, [{ fix: TABLE }, { fix: NEXT_TO_IT }])).tier).toBe("VERIFIED");
  });

  it("is not verified on the scorer's location alone", () => {
    expect(assessProof(game({ scorerFix: TABLE }, [{ fix: NEXT_TO_IT }, {}])).tier).toBe("PARTLY");
  });

  it("is practice when the phones were across town from each other", () => {
    expect(assessProof(game({}, [{ fix: TABLE }, { fix: ACROSS_TOWN }])).reasons).toEqual(["far_apart"]);
    // Even at a venue: the phones say otherwise.
    expect(assessProof(game({ venueNight: true }, [{ fix: TABLE }, { fix: ACROSS_TOWN }])).tier).toBe("PRACTICE");
  });

  it("is verified at a venue's night without location", () => {
    expect(assessProof(game({ venueNight: true }))).toEqual({ tier: "VERIFIED", reasons: ["venue"] });
  });

  it("does not judge a game whose start is unknown as too fast", () => {
    expect(assessProof(game({ durationSeconds: null })).tier).toBe("PARTLY");
  });
});

describe("what a tier pays", () => {
  it("moves trophies fully, by half, or not at all", () => {
    expect(trophyWeight("VERIFIED")).toBe(1);
    expect(trophyWeight("PARTLY")).toBe(0.5);
    expect(trophyWeight("PRACTICE")).toBe(0);
  });

  it("keeps win bonuses only when verified", () => {
    expect(keepsCoinAward("VERIFIED", "FRAME_WON")).toBe(true);
    expect(keepsCoinAward("PARTLY", "FRAME_WON")).toBe(false);
    expect(keepsCoinAward("PARTLY", "CLEARANCE")).toBe(false);
    expect(keepsCoinAward("PARTLY", "NIGHT_PLAYED")).toBe(true);
    expect(keepsCoinAward("PRACTICE", "FRAME_PLAYED")).toBe(true);
    expect(keepsCoinAward("PRACTICE", "NIGHT_PLAYED")).toBe(false);
  });

  it("pays the night win on most games proven", () => {
    expect(nightWinShare([])).toBe(1);
    expect(nightWinShare(["VERIFIED", "VERIFIED", "PRACTICE"])).toBe(1);
    expect(nightWinShare(["VERIFIED", "PARTLY", "PRACTICE", "PRACTICE"])).toBe(0.5);
    expect(nightWinShare(["PRACTICE", "PRACTICE", "PARTLY"])).toBe(0);
  });
});

describe("who may object", () => {
  it("is the loser, or either side of a draw", () => {
    expect(disputingTeams("a", "b", "a")).toEqual(["b"]);
    expect(disputingTeams("a", "b", "b")).toEqual(["a"]);
    expect(disputingTeams("a", "b", null)).toEqual(["a", "b"]);
  });

  it("asks the minimum of the slowest sport", () => {
    expect(minimumSeconds("TENNIS", 100)).toBe(1000);
  });
});
