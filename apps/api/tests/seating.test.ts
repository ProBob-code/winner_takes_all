import { describe, it, expect } from "vitest";
import { hostSeatIndex } from "../src/lib/seating";

/** Seats as quick-setup builds them: typed names, blanks as "Player n". */
const seats = (typed: string[], size = typed.length) =>
  Array.from({ length: size }, (_, i) => (typed[i] ?? "").trim() || `Player ${i + 1}`);

describe("the host's seat", () => {
  it("is the seat with the host's name, wherever it is typed (the night that lost 400K)", () => {
    const typed = ["Bala", "Kk", "Aishu", "Bob", "Ari", "Sid", "Shree", "Paddy"];
    expect(hostSeatIndex(seats(typed), typed, "Bob", true)).toBe(3);
  });

  it("ignores case and spacing", () => {
    const typed = ["Ravi", "  bob  "];
    expect(hostSeatIndex(seats(typed), typed, "BOB", true)).toBe(1);
  });

  it("matches the host's first name when only one seat has it", () => {
    const typed = ["Asha", "Bob M", "Ravi"];
    expect(hostSeatIndex(seats(typed), typed, "Bob Mathew", true)).toBe(1);
  });

  it("refuses to guess between two seats with the host's first name", () => {
    const typed = ["Bob K", "Bob M"];
    expect(hostSeatIndex(seats(typed), typed, "Bob Mathew", true)).toBeNull();
  });

  it("is nobody when the host is not on the list, rather than whoever is first", () => {
    const typed = ["Bala", "Kk", "Aishu"];
    expect(hostSeatIndex(seats(typed), typed, "Bob", true)).toBeNull();
  });

  it("is the first seat when the host left it blank or typed no names", () => {
    expect(hostSeatIndex(seats([], 4), [], "Bob", true)).toBe(0);
    expect(hostSeatIndex(seats(["", "Kk"], 3), ["", "Kk"], "Bob", true)).toBe(0);
  });

  it("is nobody when the host is only running the night", () => {
    const typed = ["Bob", "Kk"];
    expect(hostSeatIndex(seats(typed), typed, "Bob", false)).toBeNull();
  });

  it("never takes a filled-in 'Player n' for the host", () => {
    expect(hostSeatIndex(seats(["Asha"], 3), ["Asha"], "Player 2", true)).toBeNull();
  });
});
