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

export const payoutRequestSchema = z.object({
  // Rupees. A floor keeps the 1% from rounding to nothing; the ceiling matches
  // the top-up cap so a wallet cannot be drained in one unreviewed request.
  amount: z.coerce.number().positive().min(100).max(100_000),
  // UPI id or account reference, as the member typed it.
  destination: z.string().trim().min(3).max(140),
});

export const settlePayoutSchema = z.object({
  action: z.enum(["paid", "rejected"]),
  note: z.string().trim().max(280).optional(),
});

export const adminRoleSchema = z.object({
  role: z.enum(["player", "admin"]),
});

export const adminBonusSchema = z.object({
  amount: z.coerce.number().positive().max(100_000),
  reason: z.string().trim().max(200).optional(),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

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
  sport: z.enum(["8BALL", "FOOTBALL"]).default("8BALL"),
  bracketType: z
    .enum(["single_elimination", "double_elimination", "round_robin", "group_knockout"])
    .default("single_elimination"),
  password: z.string().max(64).nullish(),
  /** The venue running this night. Checked against the host's venues. */
  venueId: z.string().trim().max(64).nullish(),
  /** Hold each frame until both players agree the result. */
  requireFrameConfirmation: z.boolean().default(false),
});

// ── Weekly series ──

export const createSeriesSchema = z.object({
  name: z.string().trim().min(2).max(80).default("Weekly Series"),
  entryFee: z.coerce.number().min(0).max(100_000).default(0),
  maxPlayers: z.coerce.number().int().min(2).max(128).default(8),
  teamSize: z.coerce.number().int().min(1).max(11).default(1),
  tournamentType: z.enum(["online", "offline"]).default("online"),
  sport: z.enum(["8BALL", "FOOTBALL"]).default("8BALL"),
  bracketType: z
    .enum(["single_elimination", "double_elimination", "round_robin", "group_knockout"])
    .default("single_elimination"),
  // 'open' lets anyone enter any week; 'locked' admits members only.
  rosterMode: z.enum(["open", "locked"]).default("open"),
  // Weekly by default. Kept as days so a fortnightly season is possible.
  cadenceDays: z.coerce.number().int().min(1).max(90).default(7),
  /** When week 1 opens, ISO 8601. Defaults to now on the server. */
  firstEventAt: z.string().datetime().optional(),
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
  /**
   * The id this tap was given on the device that made it.
   *
   * A tap is an increment, so a client replaying its offline outbox would
   * otherwise count a second ball. Optional, because a client that is online
   * and never queues does not need one; when present the server applies the
   * tap at most once. See lib/d1-store.ts claimScoreEvent.
   */
  eventId: z.string().trim().min(8).max(64).optional(),
  // GOAL is football's scoring event; the rest are 8-ball. FOUL is recorded
  // against, and costs, the team that committed it, and the REMOVE_* events
  // undo a miscount. MISTAKE is an older event that credits the team named,
  // and is kept so existing clients keep working.
  type: z.enum([
    "BALL", "BLACK", "MISTAKE", "GOAL",
    "FOUL", "REMOVE_BALL", "REMOVE_FOUL", "REMOVE_GOAL",
  ]),
});

export const highlightSchema = z.object({
  teamId: z.string().min(1).max(64).nullable(),
});

/** Add or take away time; defaults to the +1 MIN button. */
export const extraTimeSchema = z.object({
  seconds: z.number().int().min(-600).max(600).refine((s) => s !== 0).optional(),
});

export const houseSchema = z.object({
  team: z.enum(["A", "B"]),
  house: z.enum(["SOLID", "STRIPES"]),
});

export const publishArenaSchema = z.object({
  live: z.boolean(),
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

export const streamCloseSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  trackNames: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
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
  // Unlocked arenas send null, not undefined; treat both as "no PIN".
  pin: z.string().trim().min(4).max(32).nullish(),
});

// ── Both players confirm the frame ──

export const confirmFrameSchema = z.object({
  /** Which side is confirming. The host may confirm for either. */
  teamId: z.string().min(1).max(64),
  /**
   * Who the confirming side says won. Checked against what the engine
   * recorded; a disagreement is reported rather than silently accepted.
   */
  winnerId: z.string().min(1).max(64).nullish(),
});

// ── Sixty-second setup ──

export const quickSetupSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  sport: z.enum(["8BALL", "FOOTBALL"]).default("8BALL"),
  /** How many competitors to seat. The only number the host has to choose. */
  size: z.coerce.number().int().min(2).max(64).default(8),
  /** Names, if the host has them. Blanks are filled with Player 1..n. */
  players: z.array(z.string().trim().max(50)).max(64).optional(),
  venueId: z.string().trim().max(64).nullish(),
  /** Hold each frame until both players agree it. */
  requireFrameConfirmation: z.boolean().default(false),
  bracketType: z
    .enum(["single_elimination", "double_elimination", "round_robin", "group_knockout"])
    .default("single_elimination"),
});

// ── Join by QR ──

export const joinByCodeSchema = z.object({
  /**
   * What the walk-in types in. No account is created, so this is the only
   * thing that identifies them on the screen.
   */
  name: z.string().trim().min(1).max(32),
});

// ── Venues, chains and staff ──

export const createVenueSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60).default(""),
  chainId: z.string().trim().max(64).nullish(),
  /** A note of which group chat results go to. Not a phone number. */
  whatsappGroup: z.string().trim().max(120).nullish(),
});

export const updateVenueSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().max(60).optional(),
  chainId: z.string().trim().max(64).nullish(),
  whatsappGroup: z.string().trim().max(120).nullish(),
  status: z.enum(["active", "paused"]).optional(),
});

export const venueMemberSchema = z.object({
  /** The staff member's account email; they must already have signed up. */
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["manager", "staff"]).default("staff"),
});

export const createChainSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

// ── Subscription billing ──

export const subscribeSchema = z.object({
  planCode: z.string().trim().min(2).max(40),
  venueId: z.string().trim().max(64).nullish(),
  chainId: z.string().trim().max(64).nullish(),
  /** Sites to bill for, on a chain plan. Ignored by single-venue plans. */
  sites: z.coerce.number().int().min(1).max(500).default(1),
});

// ── Browser play ──

export const claimOnlineGameSchema = z.object({
  /**
   * An id the page mints when the game starts, so one finished game can be
   * claimed exactly once however many times the message arrives.
   */
  sessionId: z.string().trim().min(8).max(64),
  /** 1 = against the AI, 2 = two players on one device. */
  mode: z.union([z.literal(1), z.literal(2)]),
  won: z.boolean(),
  /** The AI's difficulty as the game had it set. Ignored outside AI mode. */
  aiRating: z.coerce.number().int().min(1).max(5).optional(),
  /** How long the game ran, in seconds, and how many shots were taken. */
  seconds: z.coerce.number().int().min(0).max(86_400),
  shots: z.coerce.number().int().min(0).max(10_000),
});
