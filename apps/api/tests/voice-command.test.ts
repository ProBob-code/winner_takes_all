/**
 * Voice scoring: what a scorer says must become exactly the taps they meant.
 *
 * The parser lives in the frontend (apps/frontend/lib/voice-command.ts) and is
 * tested here for the same reason local-score is: this is the suite CI runs.
 * The inputs are written the way recognisers and Handy actually emit them —
 * "to balls", "fowl", "2balls", a trailing full stop — not the way a person
 * would type them.
 */

import { describe, it, expect } from "vitest";
import {
  parseVoiceCommand,
  parseBestAlternative,
  findWakePhrase,
  describeVoiceEvents,
  inverseOf,
  normaliseSpeech,
} from "../../frontend/lib/voice-command";

const players = [
  { id: "a", name: "Asha Rao" },
  { id: "b", name: "Ravi Kumar" },
];

const types = (text: string, sport: "POOL" | "FOOTBALL" = "POOL", who = players) =>
  parseVoiceCommand(text, who, sport).events.map((e) => `${e.teamId}:${e.type}`);

describe("wake phrase", () => {
  it("finds it however the recogniser spells it", () => {
    for (const said of [
      "Bob note the points",
      "bob, note the points.",
      "Bob notes the point",
      "Bob not the points",
      "Bob know the points",
      "BOB NOTE THE POINTS!",
    ]) {
      expect(findWakePhrase(said).found, said).toBe(true);
    }
  });

  it("does not fire on a player called Bob being scored", () => {
    expect(findWakePhrase("Bob two balls").found).toBe(false);
  });

  it("parses what follows it, and never reads its own 'points' as a score", () => {
    const parsed = parseVoiceCommand("Bob note the points, Asha two balls", players, "POOL");
    expect(parsed.wake).toBe(true);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.problems).toEqual([]);
  });

  it("on its own, scores nothing and complains about nothing", () => {
    const parsed = parseVoiceCommand("Bob note the points", players, "POOL");
    expect(parsed.wake).toBe(true);
    expect(parsed.events).toEqual([]);
    expect(parsed.problems).toEqual([]);
  });
});

describe("pool", () => {
  it("the example from the brief: two balls one foul", () => {
    expect(types("Asha 2balls 1 foul")).toEqual(["a:BALL", "a:BALL", "a:FOUL"]);
  });

  it("number words and recogniser homophones", () => {
    expect(types("Ravi two balls")).toEqual(["b:BALL", "b:BALL"]);
    expect(types("Ravi to balls")).toEqual(["b:BALL", "b:BALL"]);
    expect(types("Ravi a fowl")).toEqual(["b:FOUL"]);
    expect(types("Asha three bowls")).toEqual(["a:BALL", "a:BALL", "a:BALL"]);
  });

  it("'point' is a ball at pool", () => {
    expect(types("Asha point")).toEqual(["a:BALL"]);
    expect(types("Asha 2 points")).toEqual(["a:BALL", "a:BALL"]);
  });

  it("several players in one breath", () => {
    expect(types("Asha two balls, Ravi a foul")).toEqual(["a:BALL", "a:BALL", "b:FOUL"]);
  });

  it("the name may come after, and 'to' before a name is not a number", () => {
    expect(types("two balls to Asha")).toEqual(["a:BALL", "a:BALL"]);
    expect(types("one foul for Ravi")).toEqual(["b:FOUL"]);
  });

  it("first name, surname, full name and possessive all work", () => {
    expect(types("Rao ball")).toEqual(["a:BALL"]);
    expect(types("Ravi Kumar ball")).toEqual(["b:BALL"]);
    expect(types("undo Ravi's foul")).toEqual(["b:REMOVE_FOUL"]);
  });

  it("a name one letter off still lands", () => {
    expect(types("Ashaa ball")).toEqual(["a:BALL"]);
    expect(types("Ravy ball")).toEqual(["b:BALL"]);
  });

  it("the black, and '8 ball' meaning the black", () => {
    expect(types("Asha the black")).toEqual(["a:BLACK"]);
    expect(types("Asha 8 ball")).toEqual(["a:BLACK"]);
    expect(types("Asha eight ball")).toEqual(["a:BLACK"]);
  });

  it("undo words", () => {
    expect(types("remove a ball from Asha")).toEqual(["a:REMOVE_BALL"]);
    expect(types("Asha take back two balls")).toEqual(["a:REMOVE_BALL", "a:REMOVE_BALL"]);
  });

  it("'scratch that' and 'undo' alone take back the last batch", () => {
    for (const said of ["scratch that", "undo", "cancel that", "Bob note the points undo"]) {
      const parsed = parseVoiceCommand(said, players, "POOL");
      expect(parsed.undoLast, said).toBe(true);
      expect(parsed.events, said).toEqual([]);
    }
  });

  it("refuses the black as an undo, and goals at pool", () => {
    const black = parseVoiceCommand("undo Asha black", players, "POOL");
    expect(black.events).toEqual([]);
    expect(black.problems.length).toBe(1);
    expect(parseVoiceCommand("Asha goal", players, "POOL").events).toEqual([]);
  });
});

describe("what it will not guess", () => {
  it("a score with no name is reported, not given to anyone", () => {
    const parsed = parseVoiceCommand("two balls", players, "POOL");
    expect(parsed.events).toEqual([]);
    expect(parsed.problems[0]).toMatch(/whose/i);
  });

  it("a name both players share is not a name", () => {
    const twins = [
      { id: "a", name: "Rahul Shah" },
      { id: "b", name: "Rahul Mehta" },
    ];
    expect(types("Rahul ball", "POOL", twins)).toEqual([]);
    expect(parseVoiceCommand("Rahul ball", twins, "POOL").problems[0]).toMatch(/both/i);
    expect(types("Shah ball, Mehta foul", "POOL", twins)).toEqual(["a:BALL", "b:FOUL"]);
  });

  it("an impossible count scores nothing", () => {
    const parsed = parseVoiceCommand("Asha nine balls", players, "POOL");
    expect(parsed.events).toEqual([]);
    expect(parsed.problems.length).toBe(1);
  });

  it("chatter is not a score", () => {
    const parsed = parseVoiceCommand("another round of drinks please", players, "POOL");
    expect(parsed.events).toEqual([]);
  });

  it("a side named with a scoring word is only reachable by its other words", () => {
    const teams = [
      { id: "a", name: "Black" },
      { id: "b", name: "Blue Shirts" },
    ];
    expect(types("Blue ball", "POOL", teams)).toEqual(["b:BALL"]);
  });
});

describe("football", () => {
  it("goal and point are goals; pool words are not", () => {
    expect(types("Asha goal", "FOOTBALL")).toEqual(["a:GOAL"]);
    expect(types("Ravi point", "FOOTBALL")).toEqual(["b:GOAL"]);
    expect(types("undo Ravi goal", "FOOTBALL")).toEqual(["b:REMOVE_GOAL"]);
    expect(types("Asha two balls", "FOOTBALL")).toEqual([]);
  });
});

describe("helpers", () => {
  it("picks the recogniser alternative that actually scored", () => {
    const parsed = parseBestAlternative(["ask a two bowls", "Asha two balls"], players, "POOL");
    expect(parsed.events).toHaveLength(2);
  });

  it("describes a batch for the screen", () => {
    const parsed = parseVoiceCommand("Asha two balls one foul, Ravi ball", players, "POOL");
    const name = (id: string) => (id === "a" ? "Asha" : "Ravi");
    expect(describeVoiceEvents(parsed.events, name)).toBe("Asha: 2 balls, 1 foul · Ravi: 1 ball");
  });

  it("every tap but the black has an inverse", () => {
    expect(inverseOf("BALL")).toBe("REMOVE_BALL");
    expect(inverseOf("REMOVE_FOUL")).toBe("FOUL");
    expect(inverseOf("BLACK")).toBeNull();
  });

  it("normalises the way recognisers punctuate", () => {
    expect(normaliseSpeech("Asha: 2balls, 1-foul.")).toBe("asha 2 balls 1 foul");
  });
});

describe("on-device audio", () => {
  it("brings 48 kHz down to 16 kHz without losing or inventing samples across chunks", async () => {
    const { Downsampler } = await import("../../frontend/lib/speech/on-device");
    const down = new Downsampler(48000);
    let produced = 0;
    // One second of 48 kHz, in uneven chunks as an AudioWorklet delivers it.
    const sizes = [128, 2048, 500, 4096, 7, 41221];
    for (const size of sizes) produced += down.process(new Float32Array(size).fill(0.5)).length;
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(48000);
    expect(Math.abs(produced - 16000)).toBeLessThanOrEqual(1);
  });

  it("keeps the level of the signal", async () => {
    const { Downsampler } = await import("../../frontend/lib/speech/on-device");
    const out = new Downsampler(44100).process(new Float32Array(44100).fill(0.25));
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
    expect(out.every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
  });
});

describe("what the on-device model actually wrote", () => {
  // Moonshine-tiny transcripts of synthesised speech, from the end-to-end run
  // of the built worker. These are the mishearings a real phone will produce.
  it("'Asher two balls one fell' is Asha, two balls, a foul", () => {
    expect(types("Asher two balls one fell")).toEqual(["a:BALL", "a:BALL", "a:FOUL"]);
  });

  it("'Two balls for Esha.' is Asha's", () => {
    expect(types("Two balls for Esha.")).toEqual(["a:BALL", "a:BALL"]);
  });

  it("generous matching still refuses a word that fits both players", () => {
    const close = [
      { id: "a", name: "Asha" },
      { id: "b", name: "Asher" },
    ];
    expect(types("Ashe ball", "POOL", close)).toEqual([]);
  });
});

describe("a score never goes to the wrong player", () => {
  it("an unrecognised name stops the score instead of giving it to the last name", () => {
    // Was: Asha got the foul, because "Bertie" was not a name it knew.
    const parsed = parseVoiceCommand("Asha one ball, Bertie one foul", players, "POOL");
    expect(parsed.events.map((e) => `${e.teamId}:${e.type}`)).toEqual(["a:BALL"]);
    expect(parsed.problems[0]).toMatch(/bertie/i);
  });

  it("so does a name both players share", () => {
    const twins = [
      { id: "a", name: "Rahul Shah" },
      { id: "b", name: "Rahul Mehta" },
    ];
    expect(types("Shah ball, Rahul foul", "POOL", twins)).toEqual(["a:BALL"]);
  });

  it("filler between a name and a score is not mistaken for a name", () => {
    expect(types("Asha umm two balls")).toEqual(["a:BALL", "a:BALL"]);
    expect(types("Asha also one foul")).toEqual(["a:FOUL"]);
  });

  it("'potted' is a verb: two balls are two", () => {
    expect(types("Asha potted two balls")).toEqual(["a:BALL", "a:BALL"]);
  });

  it("names by sound: Robbie is Ravi, and 'a foul' run together still counts", () => {
    expect(types("Robbie three balls")).toEqual(["b:BALL", "b:BALL", "b:BALL"]);
    expect(types("Asha one ball, robbie one foul")).toEqual(["a:BALL", "b:FOUL"]);
    expect(types("Ravi afel")).toEqual(["b:FOUL"]);
  });

  it("words that live on every object are not numbers", () => {
    expect(types("Asha constructor ball")).toEqual([]);
  });
});
