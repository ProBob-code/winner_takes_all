import { describe, expect, it } from "vitest";
import {
  parseBody,
  ValidationError,
  signupSchema,
  loginSchema,
  createOrderSchema,
  transferSchema,
  createTournamentSchema,
  upsertArenaSchema,
} from "../src/lib/validation";

describe("signupSchema", () => {
  it("accepts a valid signup payload", () => {
    const data = parseBody(signupSchema, { name: "Alex", email: "Alex@Example.com", password: "supersecure" });
    expect(data.email).toBe("alex@example.com"); // normalized
  });

  it("rejects short passwords", () => {
    expect(() => parseBody(signupSchema, { name: "Alex", email: "a@b.com", password: "short" })).toThrow(ValidationError);
  });

  it("rejects invalid emails", () => {
    expect(() => parseBody(signupSchema, { name: "Alex", email: "not-an-email", password: "supersecure" })).toThrow(
      ValidationError
    );
  });

  it("rejects missing fields", () => {
    expect(() => parseBody(signupSchema, { email: "a@b.com", password: "supersecure" })).toThrow(ValidationError);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(() => parseBody(loginSchema, { email: "a@b.com", password: "x" })).not.toThrow();
  });

  it("rejects an empty password", () => {
    expect(() => parseBody(loginSchema, { email: "a@b.com", password: "" })).toThrow(ValidationError);
  });
});

describe("createOrderSchema", () => {
  it("accepts a positive amount", () => {
    const data = parseBody(createOrderSchema, { amount: 500 });
    expect(data.amount).toBe(500);
  });

  it("rejects zero, negative, and absurdly large amounts", () => {
    expect(() => parseBody(createOrderSchema, { amount: 0 })).toThrow(ValidationError);
    expect(() => parseBody(createOrderSchema, { amount: -10 })).toThrow(ValidationError);
    expect(() => parseBody(createOrderSchema, { amount: 10_000_000 })).toThrow(ValidationError);
  });
});

describe("transferSchema", () => {
  it("rejects a missing recipient", () => {
    expect(() => parseBody(transferSchema, { amount: 10 })).toThrow(ValidationError);
  });

  it("rejects a non-positive amount", () => {
    expect(() => parseBody(transferSchema, { recipientId: "WTA-ABC12345", amount: 0 })).toThrow(ValidationError);
  });
});

describe("createTournamentSchema", () => {
  it("fills in defaults for an empty payload", () => {
    const data = parseBody(createTournamentSchema, {});
    expect(data).toMatchObject({ name: "Custom Tournament", entryFee: 0, maxPlayers: 8, teamSize: 1 });
  });

  it("rejects a negative entry fee", () => {
    expect(() => parseBody(createTournamentSchema, { entryFee: -5 })).toThrow(ValidationError);
  });

  it("rejects maxPlayers below 2", () => {
    expect(() => parseBody(createTournamentSchema, { maxPlayers: 1 })).toThrow(ValidationError);
  });

  it("rejects an unknown bracket type", () => {
    expect(() => parseBody(createTournamentSchema, { bracketType: "chaos_mode" })).toThrow(ValidationError);
  });
});

describe("upsertArenaSchema", () => {
  it("rejects ids with unsafe characters", () => {
    expect(() => parseBody(upsertArenaSchema, { id: "../etc/passwd", name: "x", state: {} })).toThrow(ValidationError);
  });

  it("accepts a safe id", () => {
    expect(() => parseBody(upsertArenaSchema, { id: "arena-123_ABC", name: "x", state: {} })).not.toThrow();
  });
});
