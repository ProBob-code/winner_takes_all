/**
 * Zod request schemas for every mutating endpoint.
 * Parse with `parseBody(schema, body)` — returns typed data or throws
 * a ValidationError whose message is safe to return to the client.
 */

import { z } from "zod";

export class ValidationError extends Error {}

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? `${first.path.join(".")}: ` : "";
    throw new ValidationError(`${path}${first.message}`);
  }
  return result.data;
}

// ── Auth ──

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(50),
  email: z.string().trim().toLowerCase().email("Invalid email address").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(254),
  password: z.string().min(1).max(128),
});

// ── Payments ──

export const createOrderSchema = z.object({
  // Rupees. Razorpay minimum is ₹1; cap top-ups at ₹1,00,000 per order.
  amount: z.coerce.number().positive().min(1).max(100_000),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1).max(128),
  razorpayPaymentId: z.string().min(1).max(128),
  razorpaySignature: z.string().min(1).max(256),
});

// ── Wallet ──

export const transferSchema = z.object({
  recipientId: z.string().trim().min(1).max(64),
  amount: z.coerce.number().positive().max(1_000_000),
});

// ── Tournaments ──

export const createTournamentSchema = z.object({
  name: z.string().trim().min(2).max(80).default("Custom Tournament"),
  entryFee: z.coerce.number().min(0).max(100_000).default(0),
  maxPlayers: z.coerce.number().int().min(2).max(128).default(8),
  teamSize: z.coerce.number().int().min(1).max(11).default(1),
  tournamentType: z.enum(["online", "offline"]).default("online"),
  bracketType: z
    .enum(["single_elimination", "double_elimination", "round_robin", "group_knockout"])
    .default("single_elimination"),
  password: z.string().max(64).nullish(),
});

export const joinTournamentSchema = z.object({
  password: z.string().max(64).optional(),
});

// ── Match scores ──

export const submitScoreSchema = z.union([
  // Player submitting their own score
  z.object({ score: z.coerce.number().int().min(0).max(10_000) }),
  // Host/offline tracker submitting both scores + winner
  z.object({
    player1Score: z.coerce.number().int().min(0).max(10_000),
    player2Score: z.coerce.number().int().min(0).max(10_000),
    winnerId: z.string().min(1).max(64).nullish(),
  }),
]);

// ── Engine ──

export const addTeamSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
});

export const engineScoreSchema = z.object({
  teamId: z.string().min(1).max(64),
  type: z.enum(["BALL", "BLACK", "MISTAKE"]),
});

export const highlightSchema = z.object({
  teamId: z.string().min(1).max(64).nullable(),
});

export const reorderSchema = z.object({
  matchIds: z.array(z.string().min(1).max(64)).max(200),
});

// ── Public arenas ──

const sdpSchema = z.object({
  sdp: z.string().min(1).max(200_000),
  type: z.enum(["offer", "answer"]),
});

export const broadcastTokenSchema = z.object({
  arenaId: z.string().trim().min(3).max(64),
  matchId: z.string().trim().min(1).max(64),
  pin: z.string().trim().min(4).max(32).optional(),
});

export const streamSessionSchema = z.object({
  sessionDescription: sdpSchema.optional(),
});

export const streamTracksSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  sessionDescription: sdpSchema.optional(),
  tracks: z
    .array(
      z.object({
        location: z.enum(["local", "remote"]),
        trackName: z.string().trim().min(1).max(200),
        mid: z.string().trim().max(50).optional(),
        sessionId: z.string().trim().min(1).max(200).optional(),
      })
    )
    .min(1)
    .max(8),
});

export const streamRenegotiateSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  sessionDescription: sdpSchema,
});

export const registerFeedSchema = z.object({
  token: z.string().trim().min(1).max(2000),
  sessionId: z.string().trim().min(1).max(200),
  trackNames: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
  label: z.string().trim().min(1).max(40),
  feedId: z.string().trim().min(1).max(64).optional(),
});

export const upsertArenaSchema = z.object({
  id: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Arena id may only contain letters, numbers, - and _"),
  name: z.string().trim().min(1).max(80),
  state: z.unknown(),
  pin: z.string().trim().min(4).max(32).optional(),
});
