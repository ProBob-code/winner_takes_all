import { describe, it, expect } from "vitest";
import { planFrameConfirmation, type ConfirmableSide } from "../src/lib/frame-confirmation";

const signedIn = (id: string): ConfirmableSide => ({ id, user_id: `u-${id}` });
const walkIn = (id: string): ConfirmableSide => ({ id, user_id: null });

describe("planFrameConfirmation", () => {
  it("holds a frame between two signed-in players until both agree", () => {
    // The case the feature exists for: neither player has to take the other's
    // word, and neither has to take the host's.
    const plan = planFrameConfirmation([signedIn("a"), signedIn("b")], "a", "b");
    expect(plan.hold).toBe(true);
    expect(plan.autoConfirm).toEqual([]);
  });

  it("counts a frame between two walk-ins at once", () => {
    // This was the deadlock. Both sides seated by name, so nobody could ever
    // tap confirm, and the frame sat off the table for the rest of the night.
    const plan = planFrameConfirmation([walkIn("a"), walkIn("b")], "a", "b");
    expect(plan.hold).toBe(false);
    expect(plan.autoConfirm).toEqual([]);
  });

  it("asks only the player who can be asked", () => {
    const plan = planFrameConfirmation([signedIn("a"), walkIn("b")], "a", "b");
    expect(plan.hold).toBe(true);
    expect(plan.autoConfirm).toEqual(["b"]);
  });

  it("asks only the player who can be asked, whichever side they are on", () => {
    const plan = planFrameConfirmation([walkIn("a"), signedIn("b")], "a", "b");
    expect(plan.hold).toBe(true);
    expect(plan.autoConfirm).toEqual(["a"]);
  });

  it("treats a side the engine cannot find as having nobody to ask", () => {
    // Holding a frame for a team that is not in the tournament would be
    // waiting on nothing, which is how the original bug felt from the floor.
    const plan = planFrameConfirmation([signedIn("a")], "a", "ghost");
    expect(plan.hold).toBe(true);
    expect(plan.autoConfirm).toEqual(["ghost"]);
  });

  it("counts the frame when neither side is in the tournament at all", () => {
    const plan = planFrameConfirmation([], "a", "b");
    expect(plan.hold).toBe(false);
    expect(plan.autoConfirm).toEqual([]);
  });

  it("lets go of a frame both players have already agreed", () => {
    // The worse half of the same bug. Both players tapped agree, the confirm
    // route cleared the hold and recorded the result, and recording the result
    // ran this rule again and re-held the frame. An agreed frame could never
    // reach the table.
    const plan = planFrameConfirmation([signedIn("a"), signedIn("b")], "a", "b", ["a", "b"]);
    expect(plan.hold).toBe(false);
    expect(plan.autoConfirm).toEqual([]);
  });

  it("keeps holding while only one of two players has agreed", () => {
    const plan = planFrameConfirmation([signedIn("a"), signedIn("b")], "a", "b", ["a"]);
    expect(plan.hold).toBe(true);
    expect(plan.autoConfirm).toEqual([]);
  });

  it("counts the frame once the only player who could agree has", () => {
    // One account against a walk-in. That single tap is the whole of what
    // confirmation can collect here, so the frame is done waiting.
    const plan = planFrameConfirmation([signedIn("a"), walkIn("b")], "a", "b", ["a"]);
    expect(plan.hold).toBe(false);
  });

  it("still asks the signed-in player when only the walk-in has been agreed for", () => {
    const plan = planFrameConfirmation([signedIn("a"), walkIn("b")], "a", "b", ["b"]);
    expect(plan.hold).toBe(true);
    expect(plan.autoConfirm).toEqual([]);
  });

  it("ignores confirmations from sides that are not in this frame", () => {
    const plan = planFrameConfirmation([signedIn("a"), signedIn("b")], "a", "b", ["c", "d"]);
    expect(plan.hold).toBe(true);
  });

  it("does not treat an empty user_id string as an account", () => {
    // A blank is what a seeded row leaves behind. Reading it as an account
    // would re-open the deadlock for exactly the nights it broke.
    const plan = planFrameConfirmation([{ id: "a", user_id: "" }, signedIn("b")], "a", "b");
    expect(plan.autoConfirm).toEqual(["a"]);
  });
});
