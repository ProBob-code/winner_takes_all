import { describe, it, expect } from "vitest";
import {
  bracketText,
  resultsText,
  tableText,
  shareText,
  whatsappShareUrl,
  type ShareMatch,
  type ShareTeam,
} from "../src/lib/share-text";

const teams: ShareTeam[] = [
  { id: "t1", name: "Ravi", matches_played: 2, group_points: 2, total_score: 9 },
  { id: "t2", name: "Priya", matches_played: 2, group_points: 1, total_score: 7 },
  { id: "t3", name: "Arun", matches_played: 1, group_points: 0, total_score: 3 },
];

function match(over: Partial<ShareMatch> = {}): ShareMatch {
  return {
    id: "m1",
    phase: "GROUP",
    team_a_id: "t1",
    team_b_id: "t2",
    status: "CREATED",
    score_team_a: 0,
    score_team_b: 0,
    winner_id: null,
    match_order: 0,
    ...over,
  };
}

describe("bracketText", () => {
  it("names both players in every fixture", () => {
    const text = bracketText("Friday night", teams, [match()]);
    expect(text).toContain("Ravi vs Priya");
  });

  it("says so plainly when no draw has been made", () => {
    const text = bracketText("Friday night", teams, []);
    expect(text).toContain("has not been made yet");
  });

  it("lists fixtures in the order they will be played, not the order stored", () => {
    const text = bracketText("Friday night", teams, [
      match({ id: "b", match_order: 2, team_a_id: "t2", team_b_id: "t3" }),
      match({ id: "a", match_order: 1, team_a_id: "t1", team_b_id: "t2" }),
    ]);
    expect(text.indexOf("Ravi vs Priya")).toBeLessThan(text.indexOf("Priya vs Arun"));
  });

  it("marks what is finished and what is on the table now", () => {
    const text = bracketText("Friday night", teams, [
      match({ id: "a", match_order: 1, status: "COMPLETED", winner_id: "t1" }),
      match({ id: "b", match_order: 2, status: "LIVE", team_a_id: "t2", team_b_id: "t3" }),
    ]);
    expect(text).toContain("✓ Ravi vs Priya");
    expect(text).toContain("▶ Priya vs Arun");
  });

  it("groups the knockout rounds under readable headings", () => {
    const text = bracketText("Friday night", teams, [
      match({ id: "a", phase: "SEMI", match_order: 1 }),
      match({ id: "b", phase: "FINAL", match_order: 2 }),
    ]);
    expect(text).toContain("*Semi-final*");
    expect(text).toContain("*Grand final*");
  });

  it("adds the join link and says entry is free, when there is a code up", () => {
    const text = bracketText("Friday night", teams, [match()], "https://wta.example/join/AB12CD");
    expect(text).toContain("https://wta.example/join/AB12CD");
    expect(text).toContain("Free to enter.");
  });

  it("leaves the join line out when no code is on the screen", () => {
    expect(bracketText("Friday night", teams, [match()])).not.toContain("Not entered yet");
  });

  it("says TBC for a side the draw has not filled", () => {
    const text = bracketText("Friday night", teams, [
      match({ team_b_id: "" as unknown as string }),
    ]);
    expect(text).toContain("TBC");
  });

  it("shortens a name that would wrap beside a score on a phone", () => {
    const long: ShareTeam[] = [
      { id: "t1", name: "A".repeat(40), matches_played: 0, group_points: 0, total_score: 0 },
      ...teams.slice(1),
    ];
    const text = bracketText("Friday night", long, [match()]);
    expect(text).toContain("…");
    for (const line of text.split("\n")) expect(line.length).toBeLessThan(60);
  });
});

describe("resultsText", () => {
  it("says nothing has finished rather than printing an empty list", () => {
    expect(resultsText("Friday night", teams, [match()])).toContain("No frames have finished");
  });

  it("gives the score and who took it", () => {
    const text = resultsText("Friday night", teams, [
      match({ status: "COMPLETED", score_team_a: 5, score_team_b: 3, winner_id: "t1" }),
    ]);
    expect(text).toContain("Ravi 5-3 Priya — Ravi");
  });

  it("calls the grand final a win rather than one more fixture", () => {
    const text = resultsText("Friday night", teams, [
      match({ phase: "FINAL", status: "COMPLETED", score_team_a: 7, score_team_b: 6, winner_id: "t1" }),
    ]);
    expect(text).toContain("🏆");
    expect(text).toContain("Ravi");
  });

  it("shows a drawn frame as drawn", () => {
    const text = resultsText("Friday night", teams, [
      match({ status: "COMPLETED", score_team_a: 4, score_team_b: 4, winner_id: null }),
    ]);
    expect(text).toContain("drawn");
  });

  it("shows a frame still awaiting both players, rather than hiding it", () => {
    // The group watched it finish. A result missing from the message reads as
    // a bug, not as pending.
    const text = resultsText("Friday night", teams, [
      match({
        status: "COMPLETED",
        score_team_a: 5,
        score_team_b: 1,
        winner_id: "t1",
        awaiting_confirmation: true,
      }),
    ]);
    expect(text).toContain("awaiting confirmation");
    expect(text).toContain("Ravi");
  });

  it("leaves unfinished frames out", () => {
    const text = resultsText("Friday night", teams, [
      match({ id: "a", status: "COMPLETED", winner_id: "t1", match_order: 1 }),
      match({ id: "b", status: "LIVE", team_a_id: "t2", team_b_id: "t3", match_order: 2 }),
    ]);
    expect(text).not.toContain("Arun");
  });
});

describe("tableText", () => {
  it("ranks on points, then score, then fewest played", () => {
    const text = tableText("Friday night", teams);
    const lines = text.split("\n").filter((l) => l.includes("played"));
    expect(lines[0]).toContain("Ravi");
    expect(lines[1]).toContain("Priya");
    expect(lines[2]).toContain("Arun");
  });

  it("medals the top three and numbers the rest", () => {
    const more: ShareTeam[] = [
      ...teams,
      { id: "t4", name: "Sana", matches_played: 1, group_points: 0, total_score: 1 },
    ];
    const text = tableText("Friday night", more);
    expect(text).toContain("🥇");
    expect(text).toContain("🥉");
    expect(text).toContain("4. Sana");
  });


  it("gives nobody a medal when nothing has been played", () => {
    // Three medals on an all-zero table crown whoever happens to sort first,
    // which is how a group chat ends up congratulating someone who has not
    // played a frame.
    const fresh: ShareTeam[] = teams.map((t) => ({
      ...t,
      matches_played: 0,
      group_points: 0,
      total_score: 0,
    }));
    const text = tableText("Friday night", fresh);
    expect(text).not.toContain("🥇");
    expect(text).not.toContain("🥈");
    expect(text).not.toContain("🥉");
  });

  it("says plainly that nothing has counted, and still lists who is in", () => {
    const fresh: ShareTeam[] = teams.map((t) => ({
      ...t,
      matches_played: 0,
      group_points: 0,
      total_score: 0,
    }));
    const text = tableText("Friday night", fresh);
    expect(text).toContain("No frames have counted yet");
    expect(text).toContain("both players agree it");
    for (const t of fresh) expect(text).toContain(t.name);
  });

  it("medals again as soon as a frame has counted", () => {
    expect(tableText("Friday night", teams)).toContain("🥇");
  });

  it("says nobody has entered rather than printing a bare heading", () => {
    expect(tableText("Friday night", [])).toContain("Nobody has entered yet");
  });

  it("names the columns in words, so nobody has to guess what a point is", () => {
    // group_points is frames won. Printing it as "2 pts" asked a bar's group
    // chat to infer a scoring system that does not exist.
    const text = tableText("Friday night", teams);
    expect(text).toContain("2 won of 2 played");
    expect(text).not.toContain("pts");
  });

  it("says how the order was decided, in one line", () => {
    expect(tableText("Friday night", teams)).toContain("Most frames won takes it.");
  });
});

describe("shareText", () => {
  it("routes each kind to its own builder", () => {
    const finished = [match({ status: "COMPLETED", winner_id: "t1" })];
    expect(shareText("results", "N", teams, finished)).toContain("results");
    expect(shareText("table", "N", teams, finished)).toContain("table");
    expect(shareText("bracket", "N", teams, finished)).toContain("vs");
  });

  it("falls back to the bracket for anything it does not recognise", () => {
    expect(shareText("nonsense" as any, "N", teams, [match()])).toContain("vs");
  });
});

describe("whatsappShareUrl", () => {
  it("names no recipient, so WhatsApp asks which group", () => {
    // We hold no phone number: there is nothing to leak and nothing to consent
    // to. The owner picks the group from the share sheet.
    const url = whatsappShareUrl("hello");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("escapes a message that contains newlines, hashes and ampersands", () => {
    const url = whatsappShareUrl("a & b\n#1 100%");
    expect(url).not.toContain("\n");
    expect(url).toContain("%0A");
    expect(url).toContain("%26");
    expect(url).toContain("%23");
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe("a & b\n#1 100%");
  });
});
