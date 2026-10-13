/**
 * D1 database adapter.
 *
 * Money invariants:
 * - All balance mutations are relative SQL updates (`balance_cents = balance_cents - ?`)
 *   executed inside `db.batch()` (a single transaction), never read-modify-write in JS.
 * - Debits are gated with `AND balance_cents >= ?` so concurrent spends cannot
 *   overdraw; migration 0003 adds a `CHECK (balance_cents >= 0)` as a second line
 *   of defense.
 * - Every mutation writes a ledger row whose `balance_after_cents` is read from
 *   the wallet row inside the same transaction.
 */

import { createId } from "./crypto";
import type {
  EngineTeam,
  EngineMatch as EngineMatchCore,
  MatchPhase,
} from "./tournament-engine";

export type { EngineTeam };

/** Engine team as stored — core engine shape plus which account it belongs to. */
export interface EngineTeamRecord extends EngineTeam {
  /** Null for a team the host typed in by hand, which has no wallet to pay. */
  user_id: string | null;
}

/** Engine match as stored — core engine shape plus persistence fields. */
export interface EngineMatch extends EngineMatchCore {
  tournament_id: string;
  ended_by: "SCORE" | "TIME" | null;
  /**
   * Decided, but not yet agreed by both players.
   *
   * The match is COMPLETED as far as the clock and the bracket are concerned,
   * and still unsettled as far as the table is concerned: nothing is added to
   * either team's totals, and a final in this state does not pay out, until
   * both sides have confirmed. Only ever set on tournaments that asked for it.
   */
  awaiting_confirmation: boolean;
}

// ── Record types ──

export interface UserRecord {
  id: string; name: string; email: string; password_hash: string;
  role: string; wallet_balance_cents: number; created_at: string;
}

export interface PayoutRequestRecord {
  id: string; user_id: string; amount_cents: number; fee_cents: number;
  net_cents: number; destination: string; status: string; note: string | null;
  processed_by: string | null; processed_at: string | null; created_at: string;
  /** Joined for the admin queue, so it need not fetch each member separately. */
  user_name?: string; user_email?: string;
}

export interface VenueRecord {
  id: string; chain_id: string | null; name: string; city: string;
  owner_id: string; whatsapp_group: string | null; status: string;
  created_at: string; updated_at: string;
}

export interface VenueMemberRecord {
  venue_id: string; user_id: string; role: string; created_at: string;
  /** Joined for the staff list, so it need not fetch each member separately. */
  user_name?: string; user_email?: string;
}

export interface ChainRecord {
  id: string; name: string; owner_id: string;
  created_at: string; updated_at: string;
}

export interface SubscriptionRecord {
  id: string; venue_id: string | null; chain_id: string | null;
  user_id: string; plan_code: string; provider: string;
  provider_subscription_id: string | null; provider_plan_id: string | null;
  status: string; amount_cents: number; interval_months: number;
  current_period_end: string | null; trial_ends_at: string | null;
  cancelled_at: string | null; created_at: string; updated_at: string;
  /** Joined for the admin and venue views. */
  venue_name?: string; user_name?: string;
}

export interface CoinBalanceRecord {
  user_id: string; balance: number; lifetime: number; updated_at: string;
  /** Joined for the leaderboard. */
  user_name?: string;
}

export interface CoinLedgerRecord {
  id: string; user_id: string; reason: string; amount: number;
  balance_after: number; description: string | null;
  reference_type: string | null; reference_id: string | null; created_at: string;
}

export interface FrameConfirmationRecord {
  match_id: string; team_id: string; user_id: string | null;
  agreed_winner_id: string | null; created_at: string;
}

export interface WalletEntryRecord {
  id: string; user_id: string; type: string; amount_cents: number;
  reference_type: string; reference_id: string; is_test: boolean; created_at: string;
  /** What this entry was for, in words — e.g. the tournament a prize came from. */
  description: string | null;
}

/**
 * Whether a database error is a column the schema does not have.
 *
 * SQLite words this differently depending on the statement: a SELECT gives
 * "no such column: sport", while an INSERT naming an unknown column gives
 * "table tournaments has no column named sport". Matching only the first
 * phrasing meant the INSERT case fell through to the catch-all, which is
 * exactly the case that matters when a migration has not been applied yet.
 */
export function isMissingColumnError(err: unknown): boolean {
  const detail = err instanceof Error ? err.message : String(err);
  return /no such column|has no column named/i.test(detail);
}

/**
 * Whether a database error is a table the schema does not have.
 *
 * The engine tables were added to schema.sql long after the database was
 * provisioned, and schema.sql only runs in full at provisioning time, so a
 * live database can be missing them entirely. That surfaces as a bare 500 on
 * every engine route, which tells an operator nothing about the real fix.
 */
export function isMissingTableError(err: unknown): boolean {
  const detail = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(detail);
}

/**
 * SQLite has no booleans, and a database that predates the foul counters or
 * the houses has no value at all for them, so all are normalised on the way
 * out.
 */
function normalizeEngineMatch(r: any): EngineMatch {
  return {
    ...r,
    sudden_death: !!r.sudden_death,
    black_potted_a: !!r.black_potted_a,
    black_potted_b: !!r.black_potted_b,
    fouls_a: r.fouls_a ?? 0,
    fouls_b: r.fouls_b ?? 0,
    team_a_house: r.team_a_house === "STRIPES" ? "STRIPES" : "SOLID",
    team_b_house: r.team_b_house === "SOLID" ? "SOLID" : "STRIPES",
    awaiting_confirmation: !!r.awaiting_confirmation,
  };
}

const ENGINE_MATCH_BOOLEANS = new Set([
  "sudden_death",
  "black_potted_a",
  "black_potted_b",
  "awaiting_confirmation",
]);

/** SET clause and values for an engine match update. */
function engineMatchSets(updates: Partial<EngineMatch>): { sets: string[]; vals: any[] } {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (k === "id" || k === "tournament_id") continue;
    sets.push(`${k} = ?`);
    vals.push(ENGINE_MATCH_BOOLEANS.has(k) ? (v ? 1 : 0) : v);
  }
  return { sets, vals };
}

export interface SeriesRecord {
  id: string; name: string; host_id: string; sport: string;
  bracket_type: string; tournament_type: string;
  entry_fee_cents: number; max_players: number; team_size: number;
  /** 'open': anyone may enter any week. 'locked': members only. */
  roster_mode: string;
  cadence_days: number;
  /** ISO 8601 UTC, or null once the season is ended. */
  next_event_at: string | null;
  weeks_created: number;
  status: string;
  password: string | null;
  created_at: string; updated_at: string;
}

export interface SeriesMemberRecord {
  user_id: string;
  user_name: string;
  joined_at: string;
}

export interface TournamentRecord {
  id: string; name: string; entry_fee_cents: number; prize_pool_cents: number;
  max_players: number; status: string; bracket_type: string;
  bracket_state: any | null; platform_fee_percent: number; team_size: number;
  host_id: string | null; tournament_type: string; password: string | null;
  /** "8BALL" or "FOOTBALL"; rows predating the column read as 8BALL. */
  sport: string;
  winner_id: string | null; started_at: string | null; completed_at: string | null;
  max_matches_per_team: number;
  /** Set when this tournament is one week of a series. */
  series_id: string | null;
  series_week: number | null;
  /** The venue that ran this night. Null for a tournament hosted by a person. */
  venue_id: string | null;
  /**
   * Whether a frame has to be agreed by both players before it counts.
   *
   * Answers the objection that sank the dispute-settling pitch: a screen does
   * not referee a frame, someone still types the result. With this on, the
   * screen carries both players' word rather than the owner's.
   */
  require_frame_confirmation: boolean;
  participant_ids: string[];
}

export interface MatchRecord {
  id: string; tournament_id: string; round: number; match_order: number;
  player1_id: string | null; player2_id: string | null; winner_id: string | null;
  room_code: string | null; status: string; score_threshold: number;
  player1_score: number; player2_score: number;
  player1_submitted_score: number | null; player2_submitted_score: number | null;
  scores_approved: boolean; lifelines_used: any | null;
  reschedules_remaining: number; scheduled_at: string | null;
  started_at: string | null; completed_at: string | null; created_at: string;
}

export interface PaymentRecord {
  id: string; user_id: string; amount_cents: number; currency: string;
  provider: string; provider_order_id: string | null;
  provider_payment_id: string | null; idempotency_key: string;
  status: string; is_test: boolean; created_at: string;
}

export interface NotificationRecord {
  id: string; user_id: string; type: string; title: string; message: string;
  tournament_id: string | null; match_id: string | null;
  read: boolean; created_at: string;
}

export interface ParticipantRecord {
  id: string; tournament_id: string; user_id: string; team_id: string | null;
  status: string; seed: number | null; total_score: number;
  wins: number; losses: number; eliminated_in_round: number | null;
  joined_at: string; user_name: string | null; team_name: string | null;
}

export interface TeamRecord {
  id: string; tournament_id: string; name: string | null;
  code: string | null; member_ids: string[];
}

export interface LeaderboardRow {
  user_id: string; name: string;
  /** Matches played, across bracket matches and hosted tournaments alike. */
  played: number;
  wins: number; losses: number;
  total_score: number;
  tournament_wins: number; earnings_cents: number;
}

export interface ArenaRecord {
  id: string; name: string; state: unknown;
  pin: string | null; owner_id: string | null; updated_at: string;
}

export class InsufficientFundsError extends Error {
  constructor() { super("Insufficient wallet balance"); }
}

// ── D1 Store ──

export class D1Store {
  constructor(private db: D1Database) {}

  // ── Users ──

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const u = await this.db.prepare(
      `SELECT u.*, COALESCE(w.balance_cents, 0) as wallet_balance_cents
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.email = ?`
    ).bind(email).first<any>();
    return u ? { ...u, wallet_balance_cents: u.wallet_balance_cents ?? 0 } : null;
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    const u = await this.db.prepare(
      `SELECT u.*, COALESCE(w.balance_cents, 0) as wallet_balance_cents
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.id = ?`
    ).bind(userId).first<any>();
    return u ? { ...u, wallet_balance_cents: u.wallet_balance_cents ?? 0 } : null;
  }

  async createUserWithBonus(name: string, email: string, passwordHash: string, bonusCents: number): Promise<UserRecord> {
    const userId = createId("user");
    const walletId = createId("wallet");
    const txnId = createId("wallettxn");
    const now = new Date().toISOString();

    await this.db.batch([
      this.db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'player', ?, ?)`
      ).bind(userId, name, email, passwordHash, now, now),
      this.db.prepare(
        `INSERT INTO wallets (id, user_id, balance_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(walletId, userId, bonusCents, now, now),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         VALUES (?, ?, ?, 'manual_adjustment', ?, ?, 'signup_bonus', ?, ?)`
      ).bind(txnId, walletId, userId, bonusCents, bonusCents, userId, now),
    ]);

    return {
      id: userId, name, email, password_hash: passwordHash,
      role: "player", wallet_balance_cents: bonusCents, created_at: now,
    };
  }

  // ── Wallet ──

  async listWalletEntries(userId: string): Promise<WalletEntryRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
    ).bind(userId).all<any>();
    // description is absent on a database that predates it.
    return results.map((r: any) => ({ ...r, is_test: !!r.is_test, description: r.description ?? null }));
  }

  /** Whether this user already has a ledger entry against that reference. */
  async hasWalletEntry(userId: string, refType: string, refId: string): Promise<boolean> {
    const row = await this.db.prepare(
      `SELECT 1 AS found FROM wallet_transactions
       WHERE user_id = ? AND reference_type = ? AND reference_id = ? LIMIT 1`
    ).bind(userId, refType, refId).first<any>();
    return !!row;
  }

  /**
   * Atomically debit a wallet. The ledger insert and the balance update are
   * both gated on `balance_cents >= amount`, run in one transaction, and
   * either both apply or neither does.
   */
  async deductWallet(userId: string, amountCents: number, refType: string, refId: string): Promise<UserRecord> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invalid amount");
    const now = new Date().toISOString();

    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         SELECT ?, w.id, ?, 'entry_fee_debit', ?, w.balance_cents - ?, ?, ?, ?
         FROM wallets w WHERE w.user_id = ? AND w.balance_cents >= ?`
      ).bind(createId("wallettxn"), userId, amountCents, amountCents, refType, refId, now, userId, amountCents),
      this.db.prepare(
        `UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ?
         WHERE user_id = ? AND balance_cents >= ?`
      ).bind(amountCents, now, userId, amountCents),
    ]);

    if ((results[1].meta.changes ?? 0) === 0) throw new InsufficientFundsError();

    // Bonus is staked before real money, which is the whole point of giving
    // it. Draining it first also keeps the withdrawable figure honest: what is
    // left is money the member actually put in or won. A database that
    // predates the column simply skips this.
    try {
      await this.db.prepare(
        `UPDATE wallets SET bonus_cents = MAX(0, bonus_cents - ?) WHERE user_id = ?`
      ).bind(amountCents, userId).run();
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
    }

    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  /**
   * What this member may actually withdraw.
   *
   * Bonus credit sits inside the balance so it can be staked, but it was never
   * their money, so it never leaves as cash. On a database that predates the
   * column every rupee is withdrawable, which is the pre-bonus behaviour.
   */
  async getWalletSummary(userId: string): Promise<{ balanceCents: number; bonusCents: number; withdrawableCents: number }> {
    let row: any = null;
    try {
      row = await this.db.prepare(
        `SELECT balance_cents, bonus_cents FROM wallets WHERE user_id = ?`
      ).bind(userId).first<any>();
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      row = await this.db.prepare(`SELECT balance_cents FROM wallets WHERE user_id = ?`).bind(userId).first<any>();
    }
    const balanceCents = row?.balance_cents ?? 0;
    const bonusCents = row?.bonus_cents ?? 0;
    return { balanceCents, bonusCents, withdrawableCents: Math.max(0, balanceCents - bonusCents) };
  }

  /** Give bonus credit: spendable on entry fees, never withdrawable as cash. */
  async creditBonus(userId: string, amountCents: number, description: string | null): Promise<UserRecord> {
    const user = await this.creditWallet(
      userId, amountCents, "bonus_grant", createId("bonus"), "manual_adjustment", null, false, description,
    );
    try {
      await this.db.prepare(
        `UPDATE wallets SET bonus_cents = bonus_cents + ? WHERE user_id = ?`
      ).bind(amountCents, userId).run();
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
    }
    return user;
  }

  /**
   * Debit the wallet and record the request together.
   *
   * The money leaves now rather than when an admin approves, so the same
   * balance cannot be promised to two requests. The debit is gated on the
   * *withdrawable* figure rather than the balance, because bonus credit can
   * never be cashed out. Rejecting a request puts amount_cents back.
   */
  async createPayoutRequest(userId: string, amountCents: number, feeCents: number, destination: string): Promise<PayoutRequestRecord> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invalid amount");
    const now = new Date().toISOString();
    const id = createId("payout");
    const netCents = amountCents - feeCents;

    // COALESCE keeps this working on a database that predates bonus_cents.
    const debit = await this.db.prepare(
      `UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ?
       WHERE user_id = ? AND (balance_cents - COALESCE(bonus_cents, 0)) >= ?`
    ).bind(amountCents, now, userId, amountCents).run();

    if ((debit.meta.changes ?? 0) === 0) throw new InsufficientFundsError();

    await this.db.batch([
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, description, created_at)
         SELECT ?, w.id, ?, 'payout_debit', ?, w.balance_cents, 'payout_request', ?, ?, ?
         FROM wallets w WHERE w.user_id = ?`
      ).bind(createId("wallettxn"), userId, amountCents, id, "Payout requested to " + destination, now, userId),
      this.db.prepare(
        `INSERT INTO payout_requests (id, user_id, amount_cents, fee_cents, net_cents, destination, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(id, userId, amountCents, feeCents, netCents, destination, now),
    ]);

    const row = await this.getPayoutRequest(id);
    if (!row) throw new Error("Payout request could not be created");
    return row;
  }

  async getPayoutRequest(id: string): Promise<PayoutRequestRecord | null> {
    return await this.db.prepare(
      `SELECT p.*, u.name AS user_name, u.email AS user_email
       FROM payout_requests p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    ).bind(id).first<any>();
  }

  async listPayoutRequests(opts: { userId?: string; status?: string; limit?: number } = {}): Promise<PayoutRequestRecord[]> {
    const where: string[] = [];
    const binds: any[] = [];
    if (opts.userId) { where.push("p.user_id = ?"); binds.push(opts.userId); }
    if (opts.status) { where.push("p.status = ?"); binds.push(opts.status); }
    binds.push(Math.min(opts.limit ?? 100, 500));
    const clause = where.length ? "WHERE " + where.join(" AND ") : "";
    const { results } = await this.db.prepare(
      `SELECT p.*, u.name AS user_name, u.email AS user_email
       FROM payout_requests p LEFT JOIN users u ON u.id = p.user_id
       ${clause}
       ORDER BY p.created_at DESC LIMIT ?`
    ).bind(...binds).all<any>();
    return results;
  }

  /**
   * Settle a pending request.
   *
   * The status change is conditional on it still being pending, so two admins
   * acting at once cannot pay twice, nor refund a payout that already went out.
   */
  async settlePayoutRequest(id: string, status: "paid" | "rejected", adminId: string, note: string | null): Promise<PayoutRequestRecord | null> {
    const now = new Date().toISOString();
    const res = await this.db.prepare(
      `UPDATE payout_requests SET status = ?, processed_by = ?, processed_at = ?, note = ?
       WHERE id = ? AND status = 'pending'`
    ).bind(status, adminId, now, note, id).run();

    if ((res.meta.changes ?? 0) === 0) return null;

    if (status === "rejected") {
      const req = await this.db.prepare(
        `SELECT user_id, amount_cents FROM payout_requests WHERE id = ?`
      ).bind(id).first<any>();
      if (req) {
        // Straight back to the balance, with a ledger line saying why.
        await this.creditWallet(
          req.user_id, req.amount_cents, "payout_rejected", id, "refund", null, false,
          note ? "Payout declined: " + note : "Payout declined",
        );
      }
    }

    return await this.getPayoutRequest(id);
  }

  /**
   * What the platform has earned, and what it still owes.
   *
   * Only fees on payouts that were actually paid count as earned: a pending
   * request has taken nothing yet, and a rejected one gave it all back.
   */
  async platformEarnings(): Promise<{ feesEarnedCents: number; paidOutCents: number; pendingCount: number; pendingCents: number }> {
    const paid = await this.db.prepare(
      `SELECT COALESCE(SUM(fee_cents),0) AS fees, COALESCE(SUM(net_cents),0) AS net
       FROM payout_requests WHERE status = 'paid'`
    ).first<any>();
    const pending = await this.db.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amt
       FROM payout_requests WHERE status = 'pending'`
    ).first<any>();
    return {
      feesEarnedCents: paid?.fees ?? 0,
      paidOutCents: paid?.net ?? 0,
      pendingCount: pending?.n ?? 0,
      pendingCents: pending?.amt ?? 0,
    };
  }

  /** Every member, with balance and how much they have moved. Admin only. */
  async listAllUsers(limit = 200): Promise<any[]> {
    const { results } = await this.db.prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              COALESCE(w.balance_cents, 0) AS balance_cents,
              COALESCE(w.bonus_cents, 0) AS bonus_cents,
              (SELECT COUNT(*) FROM wallet_transactions t WHERE t.user_id = u.id) AS txn_count,
              (SELECT MAX(created_at) FROM wallet_transactions t WHERE t.user_id = u.id) AS last_activity
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id
       ORDER BY u.created_at DESC LIMIT ?`
    ).bind(Math.min(limit, 500)).all<any>();
    return results;
  }

  /** The whole ledger, newest first, with who each row belongs to. Admin only. */
  async listAllTransactions(limit = 100): Promise<any[]> {
    const { results } = await this.db.prepare(
      `SELECT t.id, t.user_id, t.type, t.amount_cents, t.reference_type, t.reference_id,
              t.description, t.created_at, u.name AS user_name, u.email AS user_email
       FROM wallet_transactions t LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC LIMIT ?`
    ).bind(Math.min(limit, 500)).all<any>();
    return results;
  }

  /** Change a member's role. False when there is no such member. */
  async setUserRole(userId: string, role: string): Promise<boolean> {
    const res = await this.db.prepare(
      `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`
    ).bind(role, new Date().toISOString(), userId).run();
    return (res.meta.changes ?? 0) > 0;
  }

  /** Replace a member's password hash, for an admin-forced reset. */
  async setPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
    const res = await this.db.prepare(
      `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`
    ).bind(passwordHash, new Date().toISOString(), userId).run();
    return (res.meta.changes ?? 0) > 0;
  }

  /**
   * Atomically credit a wallet (relative update, single transaction).
   *
   * `description` is what the ledger row says it was for, in words — the
   * tournament a prize came from, and how it was shared. A database that
   * predates the column still takes the credit, without the note.
   */
  async creditWallet(userId: string, amountCents: number, refType: string, refId: string, txnType = "deposit", paymentId: string | null = null, isTest = false, description: string | null = null): Promise<UserRecord> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invalid amount");
    const now = new Date().toISOString();

    const credit = this.db.prepare(
      `UPDATE wallets SET balance_cents = balance_cents + ?, updated_at = ? WHERE user_id = ?`
    ).bind(amountCents, now, userId);

    const ledger = (withDescription: boolean) =>
      withDescription
        ? this.db.prepare(
            `INSERT INTO wallet_transactions (id, wallet_id, user_id, payment_id, type, amount_cents, balance_after_cents, reference_type, reference_id, is_test, description, created_at)
             SELECT ?, w.id, ?, ?, ?, ?, w.balance_cents, ?, ?, ?, ?, ?
             FROM wallets w WHERE w.user_id = ?`
          ).bind(createId("wallettxn"), userId, paymentId, txnType, amountCents, refType, refId, isTest ? 1 : 0, description, now, userId)
        : this.db.prepare(
            `INSERT INTO wallet_transactions (id, wallet_id, user_id, payment_id, type, amount_cents, balance_after_cents, reference_type, reference_id, is_test, created_at)
             SELECT ?, w.id, ?, ?, ?, ?, w.balance_cents, ?, ?, ?, ?
             FROM wallets w WHERE w.user_id = ?`
          ).bind(createId("wallettxn"), userId, paymentId, txnType, amountCents, refType, refId, isTest ? 1 : 0, now, userId);

    let results;
    try {
      results = await this.db.batch([credit, ledger(description !== null)]);
    } catch (err) {
      if (description === null || !isMissingColumnError(err)) throw err;
      results = await this.db.batch([credit, ledger(false)]);
    }

    if ((results[0].meta.changes ?? 0) === 0) throw new Error("User not found");

    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  /**
   * Atomic P2P transfer. Every statement is gated on the sender having funds
   * *before* any balance changes, and all statements run in one transaction.
   */
  async transferCredits(senderId: string, recipientId: string, amountCents: number): Promise<UserRecord> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invalid amount");
    const recipient = await this.getUserById(recipientId);
    if (!recipient) throw new Error("Recipient not found");
    const now = new Date().toISOString();

    // Ledger inserts run first (guards still see pre-transfer balances),
    // balance updates run last. All-or-nothing via batch transaction.
    const guard = `EXISTS (SELECT 1 FROM wallets g WHERE g.user_id = ? AND g.balance_cents >= ?)`;
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         SELECT ?, w.id, ?, 'manual_adjustment', ?, w.balance_cents - ?, 'p2p_transfer_out', ?, ?
         FROM wallets w WHERE w.user_id = ? AND w.balance_cents >= ?`
      ).bind(createId("wallettxn"), senderId, amountCents, amountCents, recipientId, now, senderId, amountCents),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         SELECT ?, w.id, ?, 'deposit', ?, w.balance_cents + ?, 'p2p_transfer_in', ?, ?
         FROM wallets w WHERE w.user_id = ? AND ${guard}`
      ).bind(createId("wallettxn"), recipientId, amountCents, amountCents, senderId, now, recipientId, senderId, amountCents),
      this.db.prepare(
        `UPDATE wallets SET balance_cents = balance_cents + ?, updated_at = ?
         WHERE user_id = ? AND ${guard}`
      ).bind(amountCents, now, recipientId, senderId, amountCents),
      this.db.prepare(
        `UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ?
         WHERE user_id = ? AND balance_cents >= ?`
      ).bind(amountCents, now, senderId, amountCents),
    ]);

    if ((results[3].meta.changes ?? 0) === 0) throw new InsufficientFundsError();

    const sender = await this.getUserById(senderId);
    if (!sender) throw new Error("Sender not found");
    return sender;
  }

  // ── Tournaments ──

  private async loadParticipantIds(tournamentId: string): Promise<string[]> {
    const { results } = await this.db.prepare(
      `SELECT user_id FROM participants WHERE tournament_id = ? ORDER BY joined_at`
    ).bind(tournamentId).all<any>();
    return results.map((r: any) => r.user_id);
  }

  private async rowToTournament(row: any): Promise<TournamentRecord> {
    const pids = await this.loadParticipantIds(row.id);
    return {
      ...row,
      bracket_state: row.bracket_state ? JSON.parse(row.bracket_state) : null,
      // Rows written before the column existed have no sport; they were all
      // 8-ball, and this keeps them readable before the migration is applied.
      sport: row.sport ?? "8BALL",
      // Rows predating the series columns are one-off tournaments, which is
      // what a null series_id already means.
      series_id: row.series_id ?? null,
      series_week: row.series_week ?? null,
      venue_id: row.venue_id ?? null,
      require_frame_confirmation: !!row.require_frame_confirmation,
      participant_ids: pids,
    };
  }

  async listTournaments(): Promise<TournamentRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 100`
    ).all<any>();
    return Promise.all(results.map((r: any) => this.rowToTournament(r)));
  }

  async getTournament(id: string): Promise<TournamentRecord | null> {
    const row = await this.db.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(id).first<any>();
    return row ? this.rowToTournament(row) : null;
  }

  async createTournament(data: {
    name: string; entryFeeCents: number; maxPlayers: number; hostId: string;
    teamSize?: number; tournamentType?: string; bracketType?: string; password?: string | null;
    sport?: string; seriesId?: string; seriesWeek?: number;
    venueId?: string | null; requireFrameConfirmation?: boolean;
  }): Promise<TournamentRecord> {
    const id = createId("tournament");
    const now = new Date().toISOString();

    const common = [
      id, data.name, data.entryFeeCents, data.maxPlayers, data.hostId,
      data.teamSize ?? 1, data.tournamentType ?? "online",
      data.bracketType ?? "single_elimination",
    ];

    try {
      await this.db.prepare(
        `INSERT INTO tournaments (id, name, entry_fee_cents, max_players, host_id, team_size, tournament_type, bracket_type, sport, password, venue_id, require_frame_confirmation, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(
        ...common, data.sport ?? "8BALL", data.password ?? null,
        data.venueId ?? null, data.requireFrameConfirmation ? 1 : 0, now, now
      ).run();
    } catch (err) {
      // A database predating venue_id or require_frame_confirmation can still
      // run a tournament; it just cannot attribute it to a venue or hold a
      // frame for agreement. Try the shape before those columns next.
      if (isMissingColumnError(err)) {
        try {
          await this.db.prepare(
            `INSERT INTO tournaments (id, name, entry_fee_cents, max_players, host_id, team_size, tournament_type, bracket_type, sport, password, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
          ).bind(...common, data.sport ?? "8BALL", data.password ?? null, now, now).run();
          const row = await this.db.prepare(`SELECT * FROM tournaments WHERE id = ?`)
            .bind(id).first<any>();
          return this.rowToTournament(row);
        } catch (inner) {
          if (!isMissingColumnError(inner)) throw inner;
          err = inner;
        }
      }
      // A database that predates the sport column would otherwise fail the
      // whole insert, taking tournament creation down until the migration is
      // applied. Fall back to the older shape: such tournaments were all
      // 8-ball, which is exactly what rowToTournament reports for them.
      if (!isMissingColumnError(err)) throw err;

      await this.db.prepare(
        `INSERT INTO tournaments (id, name, entry_fee_cents, max_players, host_id, team_size, tournament_type, bracket_type, password, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(...common, data.password ?? null, now, now).run();
    }

    // Stamped separately so the two insert shapes above stay as they were. A
    // week is only ever created through the series routes, which already
    // require the series table, so a missing column here is a real error.
    if (data.seriesId) {
      await this.db.prepare(
        `UPDATE tournaments SET series_id = ?, series_week = ? WHERE id = ?`
      ).bind(data.seriesId, data.seriesWeek ?? null, id).run();
    }

    return (await this.getTournament(id))!;
  }

  async updateTournamentStatus(id: string, status: string, extra: Record<string, any> = {}): Promise<void> {
    const sets = ["status = ?", "updated_at = ?"];
    const vals: any[] = [status, new Date().toISOString()];
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(id);
    await this.db.prepare(`UPDATE tournaments SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  /**
   * Close a tournament, once.
   *
   * The prize is paid by whoever wins this update, so it is guarded on the
   * tournament not already being finished: a final settled by two requests at
   * the same time pays out exactly one of them. Returns whether this caller is
   * the one that closed it.
   */
  async finishTournament(id: string, winnerUserId: string | null, result: unknown): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db.prepare(
      `UPDATE tournaments
       SET status = 'completed', winner_id = ?, bracket_state = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND status != 'completed'`
    ).bind(winnerUserId, JSON.stringify(result), now, now, id).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async updateTournamentBracketState(id: string, state: any): Promise<void> {
    await this.db.prepare(
      `UPDATE tournaments SET bracket_state = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify(state), new Date().toISOString(), id).run();
  }

  /**
   * Remove a tournament and everything played inside it.
   *
   * This used to drop the tournaments row alone, which left participants,
   * matches and engine rows behind pointing at a tournament that no longer
   * existed. Wallet transactions are still left alone on purpose: they are the
   * financial record, and a fee that was taken and refunded must stay visible
   * as both.
   */
  async deleteTournament(id: string): Promise<void> {
    // Children first, so a foreign key never blocks the parent.
    for (const table of ["engine_matchups", "engine_matches", "engine_teams", "matches", "participants"]) {
      try {
        await this.db.prepare(`DELETE FROM ${table} WHERE tournament_id = ?`).bind(id).run();
      } catch (err) {
        // A database without the engine tables has nothing to clean up there.
        if (!isMissingTableError(err)) throw err;
      }
    }

    await this.db.prepare(`DELETE FROM tournaments WHERE id = ?`).bind(id).run();
  }

  /**
   * Join a tournament. Entry-fee debit, participant insert, and prize-pool
   * update run in one transaction; the debit is balance-gated so a concurrent
   * spend cannot overdraw, and the unique (tournament_id, user_id) index
   * (migration 0003) rejects double joins under race.
   */
  async joinTournament(userId: string, tournamentId: string, teamId: string | null = null): Promise<{ user: UserRecord; tournament: TournamentRecord }> {
    const user = await this.getUserById(userId);
    const tournament = await this.getTournament(tournamentId);
    if (!user) throw new Error("User not found");
    if (!tournament) throw new Error("Tournament not found");
    if (tournament.participant_ids.includes(userId)) throw new Error("User already joined this tournament");
    if (tournament.status !== "open") throw new Error("Tournament is not open for new entries");
    if (tournament.participant_ids.length >= tournament.max_players) throw new Error("Tournament is already full");

    const fee = tournament.entry_fee_cents;
    if (fee > 0 && user.wallet_balance_cents < fee) {
      throw new InsufficientFundsError();
    }

    const stmts: D1PreparedStatement[] = [];
    const now = new Date().toISOString();

    if (fee > 0) {
      stmts.push(
        this.db.prepare(
          `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
           SELECT ?, w.id, ?, 'entry_fee_debit', ?, w.balance_cents - ?, 'tournament_entry', ?, ?
           FROM wallets w WHERE w.user_id = ? AND w.balance_cents >= ?`
        ).bind(createId("wallettxn"), userId, fee, fee, tournamentId, now, userId, fee),
        this.db.prepare(
          `UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ?
           WHERE user_id = ? AND balance_cents >= ?`
        ).bind(fee, now, userId, fee),
      );
    }

    const seed = tournament.participant_ids.length + 1;
    stmts.push(
      this.db.prepare(
        `INSERT INTO participants (id, tournament_id, user_id, team_id, status, seed, joined_at) VALUES (?, ?, ?, ?, 'registered', ?, ?)`
      ).bind(createId("participant"), tournamentId, userId, teamId, seed, now),
      this.db.prepare(
        `UPDATE tournaments SET prize_pool_cents = prize_pool_cents + ?, updated_at = ? WHERE id = ?`
      ).bind(fee, now, tournamentId),
      this.db.prepare(
        `UPDATE tournaments SET status = 'full', updated_at = ? WHERE id = ?
         AND (SELECT COUNT(*) FROM participants WHERE tournament_id = ?) >= max_players`
      ).bind(now, tournamentId, tournamentId),
    );

    const results = await this.db.batch(stmts);
    if (fee > 0 && (results[1].meta.changes ?? 0) === 0) {
      // Debit guard failed (concurrent spend drained the wallet between the
      // pre-check and the batch): the wallet was untouched, but the participant
      // insert and prize-pool bump still ran — revert both atomically.
      await this.db.batch([
        this.db.prepare(
          `DELETE FROM participants WHERE tournament_id = ? AND user_id = ?`
        ).bind(tournamentId, userId),
        this.db.prepare(
          `UPDATE tournaments SET prize_pool_cents = prize_pool_cents - ?, status = 'open', updated_at = ? WHERE id = ?`
        ).bind(fee, now, tournamentId),
      ]);
      throw new InsufficientFundsError();
    }

    const updatedUser = await this.getUserById(userId);
    const updatedTournament = await this.getTournament(tournamentId);
    return { user: updatedUser!, tournament: updatedTournament! };
  }

  // ── Participants ──

  async getParticipants(tournamentId: string): Promise<ParticipantRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT p.*, u.name as user_name, t.name as team_name
       FROM participants p LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.tournament_id = ? ORDER BY p.seed`
    ).bind(tournamentId).all<any>();
    return results.map((r: any) => ({ ...r, eliminated_in_round: r.eliminated_in_round ?? null }));
  }

  // ── Matches ──

  async getMatch(matchId: string): Promise<MatchRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM matches WHERE id = ?`).bind(matchId).first<any>();
    if (!r) return null;
    return { ...r, scores_approved: !!r.scores_approved, lifelines_used: r.lifelines_used ? JSON.parse(r.lifelines_used) : null };
  }

  async listMatchesByTournament(tournamentId: string): Promise<MatchRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM matches WHERE tournament_id = ? ORDER BY round, match_order`
    ).bind(tournamentId).all<any>();
    return results.map((r: any) => ({ ...r, scores_approved: !!r.scores_approved, lifelines_used: r.lifelines_used ? JSON.parse(r.lifelines_used) : null }));
  }

  async updateMatch(matchId: string, updates: Record<string, any>): Promise<void> {
    const sets = Object.keys(updates).map(k => `${k} = ?`);
    const vals = [...Object.values(updates), matchId];
    await this.db.prepare(`UPDATE matches SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  // ── Payments ──

  async createPayment(data: {
    userId: string; amountCents: number; currency?: string;
    providerOrderId?: string | null; idempotencyKey: string; isTest?: boolean;
  }): Promise<PaymentRecord> {
    const id = createId("payment");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO payments (id, user_id, amount_cents, currency, provider, provider_order_id, idempotency_key, status, is_test, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'razorpay', ?, ?, 'pending', ?, ?, ?)`
    ).bind(id, data.userId, data.amountCents, data.currency ?? "INR",
      data.providerOrderId ?? null, data.idempotencyKey,
      data.isTest ? 1 : 0, now, now).run();
    return (await this.getPayment(id))!;
  }

  async getPayment(id: string): Promise<PaymentRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM payments WHERE id = ?`).bind(id).first<any>();
    return r ? { ...r, is_test: !!r.is_test } : null;
  }

  async getPaymentByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM payments WHERE provider_order_id = ?`).bind(orderId).first<any>();
    return r ? { ...r, is_test: !!r.is_test } : null;
  }

  async getPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM payments WHERE idempotency_key = ?`).bind(key).first<any>();
    return r ? { ...r, is_test: !!r.is_test } : null;
  }

  /**
   * Conditionally flip a payment from pending → success.
   * Returns true only for the single caller that wins the transition, which is
   * what makes concurrent verify/webhook processing credit the wallet once.
   */
  async markPaymentSuccess(paymentId: string, providerPaymentId: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE payments SET status = 'success', provider_payment_id = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`
    ).bind(providerPaymentId, new Date().toISOString(), paymentId).run();
    return (result.meta.changes ?? 0) > 0;
  }

  // ── Notifications ──

  async createNotification(data: {
    userId: string; type: string; title: string; message: string;
    tournamentId?: string | null; matchId?: string | null;
  }): Promise<void> {
    const id = createId("notif");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, tournament_id, match_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, data.userId, data.type, data.title, data.message,
      data.tournamentId ?? null, data.matchId ?? null, now).run();
  }

  async listNotifications(userId: string, limit = 20): Promise<NotificationRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(userId, limit).all<any>();
    return results.map((r: any) => ({ ...r, read: !!r.read }));
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const r = await this.db.prepare(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0`
    ).bind(userId).first<any>();
    return r?.cnt ?? 0;
  }

  /** Mark a notification read — scoped to its owner. Returns false if not owned. */
  async markNotificationRead(id: string, userId: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`
    ).bind(id, userId).run();
    return (result.meta.changes ?? 0) > 0;
  }

  // ── Stats / Leaderboard ──

  async getUserMatchStats(userId: string): Promise<{
    tournament_wins: number; wins: number; losses: number;
    total_score: number; points: number; earnings_cents: number;
  }> {
    // Hosted tournaments keep their play in engine_teams rather than matches.
    let engine = { games: 0, wins: 0, score: 0 };
    try {
      const r = await this.db.prepare(
        `SELECT COALESCE(SUM(matches_played),0) AS games, COALESCE(SUM(group_points),0) AS wins,
                COALESCE(SUM(total_score),0) AS score
         FROM engine_teams WHERE user_id = ?`
      ).bind(userId).first<any>();
      if (r) engine = { games: r.games ?? 0, wins: r.wins ?? 0, score: r.score ?? 0 };
    } catch (err) {
      // A database without the engine tables simply has no hosted play yet.
      if (!isMissingTableError(err) && !isMissingColumnError(err)) throw err;
    }

    const [winsR, p1R, p2R, s1R, s2R, earningsR, twR] = await this.db.batch([
      this.db.prepare(`SELECT COUNT(*) as c FROM matches WHERE winner_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COUNT(*) as c FROM matches WHERE player1_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COUNT(*) as c FROM matches WHERE player2_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COALESCE(SUM(player1_score),0) as s FROM matches WHERE player1_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COALESCE(SUM(player2_score),0) as s FROM matches WHERE player2_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COALESCE(SUM(amount_cents),0) as s FROM wallet_transactions WHERE user_id = ? AND type = 'tournament_payout'`).bind(userId),
      this.db.prepare(`SELECT COUNT(*) as c FROM tournaments WHERE winner_id = ? AND status = 'completed'`).bind(userId),
    ]);

    const wins = ((winsR.results[0] as any)?.c ?? 0) + engine.wins;
    const total = ((p1R.results[0] as any)?.c ?? 0) + ((p2R.results[0] as any)?.c ?? 0) + engine.games;
    const losses = total - wins;
    const totalScore = ((s1R.results[0] as any)?.s ?? 0) + ((s2R.results[0] as any)?.s ?? 0) + engine.score;
    const earnings = (earningsR.results[0] as any)?.s ?? 0;
    const tournamentWins = (twR.results[0] as any)?.c ?? 0;

    return {
      tournament_wins: tournamentWins,
      wins, losses, total_score: totalScore,
      points: wins * 3 + tournamentWins * 10,
      earnings_cents: earnings,
    };
  }

  /**
   * Real leaderboard: aggregated in SQL, only players who have played.
   *
   * Two things count as playing. The bracket `matches` table is the original
   * one-off match system. `engine_teams` is a hosted tournament's competitors,
   * which carry their own matches played, wins and score — that is where every
   * hosted tournament's play lives, and leaving it out meant a player could
   * win a whole tournament and still not appear here.
   */
  async getGlobalLeaderboard(limit = 100): Promise<LeaderboardRow[]> {
    const { results } = await this.db.prepare(
      `WITH played AS (
         SELECT player1_id AS uid FROM matches WHERE scores_approved = 1 AND player1_id IS NOT NULL
         UNION ALL
         SELECT player2_id FROM matches WHERE scores_approved = 1 AND player2_id IS NOT NULL
       ),
       totals AS (SELECT uid, COUNT(*) AS games FROM played GROUP BY uid),
       winners AS (
         SELECT winner_id AS uid, COUNT(*) AS wins FROM matches
         WHERE scores_approved = 1 AND winner_id IS NOT NULL GROUP BY winner_id
       ),
       mscore AS (
         SELECT uid, SUM(sc) AS score FROM (
           SELECT player1_id AS uid, COALESCE(player1_score,0) AS sc FROM matches WHERE scores_approved = 1 AND player1_id IS NOT NULL
           UNION ALL
           SELECT player2_id, COALESCE(player2_score,0) FROM matches WHERE scores_approved = 1 AND player2_id IS NOT NULL
         ) GROUP BY uid
       ),
       eng AS (
         SELECT user_id AS uid,
                COALESCE(SUM(matches_played),0) AS games,
                COALESCE(SUM(group_points),0) AS wins,
                COALESCE(SUM(total_score),0) AS score
         FROM engine_teams WHERE user_id IS NOT NULL GROUP BY user_id
       ),
       tw AS (
         SELECT winner_id AS uid, COUNT(*) AS twins FROM tournaments
         WHERE status = 'completed' AND winner_id IS NOT NULL GROUP BY winner_id
       ),
       earn AS (
         SELECT user_id AS uid, COALESCE(SUM(amount_cents),0) AS cents
         FROM wallet_transactions WHERE type = 'tournament_payout' GROUP BY user_id
       )
       SELECT u.id AS user_id, u.name,
              COALESCE(t.games, 0) + COALESCE(g.games, 0) AS played,
              COALESCE(w.wins, 0) + COALESCE(g.wins, 0) AS wins,
              (COALESCE(t.games, 0) + COALESCE(g.games, 0)) - (COALESCE(w.wins, 0) + COALESCE(g.wins, 0)) AS losses,
              COALESCE(ms.score, 0) + COALESCE(g.score, 0) AS total_score,
              COALESCE(tw.twins, 0) AS tournament_wins,
              COALESCE(e.cents, 0) AS earnings_cents
       FROM users u
       LEFT JOIN totals t ON t.uid = u.id
       LEFT JOIN winners w ON w.uid = u.id
       LEFT JOIN mscore ms ON ms.uid = u.id
       LEFT JOIN eng g ON g.uid = u.id
       LEFT JOIN tw ON tw.uid = u.id
       LEFT JOIN earn e ON e.uid = u.id
       WHERE COALESCE(t.games, 0) > 0 OR COALESCE(g.games, 0) > 0 OR COALESCE(tw.twins, 0) > 0
       ORDER BY tournament_wins DESC, wins DESC, earnings_cents DESC, u.name
       LIMIT ?`
    ).bind(limit).all<any>();
    return results as LeaderboardRow[];
  }

  // ── Engine (dynamic tournament) ──

  async createEngineTeam(tournamentId: string, name: string, userId: string | null = null): Promise<EngineTeam> {
    const id = createId("eteam");
    const now = new Date().toISOString();
    try {
      await this.db.prepare(
        `INSERT INTO engine_teams (id, tournament_id, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)`
      ).bind(id, tournamentId, name, userId, now).run();
    } catch (err) {
      // A database that predates user_id can still run a tournament; it just
      // cannot add a player's weeks together, which only a series needs.
      if (!isMissingColumnError(err)) throw err;
      await this.db.prepare(
        `INSERT INTO engine_teams (id, tournament_id, name, created_at) VALUES (?, ?, ?, ?)`
      ).bind(id, tournamentId, name, now).run();
    }
    return { id, name, matches_played: 0, group_points: 0, total_score: 0, bye_assigned: false };
  }

  async getEngineTeams(tournamentId: string): Promise<EngineTeamRecord[]> {
    const { results } = await this.db.prepare(`SELECT * FROM engine_teams WHERE tournament_id = ?`).bind(tournamentId).all<any>();
    return results.map(r => ({ ...r, bye_assigned: !!r.bye_assigned, user_id: r.user_id ?? null }));
  }

  async updateEngineTeam(teamId: string, updates: Partial<EngineTeam>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'id') continue;
      sets.push(`${k} = ?`);
      vals.push(k === 'bye_assigned' ? (v ? 1 : 0) : v);
    }
    if (sets.length === 0) return;
    vals.push(teamId);
    await this.db.prepare(`UPDATE engine_teams SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  async createEngineMatch(tournamentId: string, data: Partial<EngineMatch>): Promise<EngineMatch> {
    const id = createId("ematch");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO engine_matches (id, tournament_id, phase, team_a_id, team_b_id, status, sudden_death, duration, explanation, match_order, created_at)
       VALUES (?, ?, ?, ?, ?, 'CREATED', 0, ?, ?, ?, ?)`
    ).bind(id, tournamentId, data.phase || 'GROUP', data.team_a_id, data.team_b_id, data.duration || 600, data.explanation || '', data.match_order || 0, now).run();
    return (await this.getEngineMatch(id))!;
  }

  async getEngineMatch(matchId: string): Promise<EngineMatch | null> {
    const r = await this.db.prepare(`SELECT * FROM engine_matches WHERE id = ?`).bind(matchId).first<any>();
    if (!r) return null;
    return normalizeEngineMatch(r);
  }

  async getEngineMatches(tournamentId: string): Promise<EngineMatch[]> {
    const { results } = await this.db.prepare(`SELECT * FROM engine_matches WHERE tournament_id = ? ORDER BY match_order ASC, created_at ASC`).bind(tournamentId).all<any>();
    return results.map(normalizeEngineMatch);
  }

  async updateEngineMatch(matchId: string, updates: Partial<EngineMatch>): Promise<void> {
    const { sets, vals } = engineMatchSets(updates);
    if (sets.length === 0) return;
    vals.push(matchId);
    await this.db.prepare(`UPDATE engine_matches SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  /**
   * Write a match's new state only while it is still live, and say whether it
   * applied.
   *
   * A match can be finished from two places at once — a score tap and the
   * clock running out on someone's poll — and each finish adds the result to
   * both teams. Guarding the write on the status means exactly one of them
   * wins, and only that one goes on to record the result.
   */
  async saveLiveEngineMatch(matchId: string, updates: Partial<EngineMatch>): Promise<boolean> {
    const { sets, vals } = engineMatchSets(updates);
    if (sets.length === 0) return false;
    vals.push(matchId);
    const res = await this.db
      .prepare(`UPDATE engine_matches SET ${sets.join(", ")} WHERE id = ? AND status = 'LIVE'`)
      .bind(...vals)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  /** Add a finished match to a team's running totals, relative to what is stored. */
  async addEngineTeamResult(
    teamId: string,
    delta: { played: number; wins: number; score: number }
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE engine_teams
         SET matches_played = matches_played + ?, group_points = group_points + ?, total_score = total_score + ?
         WHERE id = ?`
      )
      .bind(delta.played, delta.wins, delta.score, teamId)
      .run();
  }

  async createEngineMatchup(tournamentId: string, team1Id: string, team2Id: string, matchId: string): Promise<void> {
    await this.db.prepare(`INSERT INTO engine_matchups (id, tournament_id, team1_id, team2_id, match_id) VALUES (?, ?, ?, ?, ?)`).bind(createId("emup"), tournamentId, team1Id, team2Id, matchId).run();
  }

  async getEngineMatchups(tournamentId: string): Promise<{ team1_id: string; team2_id: string }[]> {
    const { results } = await this.db.prepare(`SELECT team1_id, team2_id FROM engine_matchups WHERE tournament_id = ?`).bind(tournamentId).all<any>();
    return results as { team1_id: string; team2_id: string }[];
  }

  /**
   * Remove a series, leaving its weeks behind as ordinary tournaments.
   *
   * The weeks are real tournaments that people paid to enter, so deleting a
   * season must never delete them; unlinking keeps every entry and result
   * intact while the season itself goes.
   */
  async deleteSeries(seriesId: string): Promise<void> {
    await this.db.prepare(
      `UPDATE tournaments SET series_id = NULL, series_week = NULL WHERE series_id = ?`
    ).bind(seriesId).run();
    await this.db.prepare(`DELETE FROM series_members WHERE series_id = ?`).bind(seriesId).run();
    await this.db.prepare(`DELETE FROM series WHERE id = ?`).bind(seriesId).run();
  }

  // ── Weekly series ──

  async createSeries(data: {
    name: string; hostId: string; sport: string; bracketType: string;
    tournamentType: string; entryFeeCents: number; maxPlayers: number;
    teamSize: number; rosterMode: string; cadenceDays: number;
    firstEventAt: string; password: string | null;
  }): Promise<SeriesRecord> {
    const id = createId("series");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO series (id, name, host_id, sport, bracket_type, tournament_type,
                           entry_fee_cents, max_players, team_size, roster_mode,
                           cadence_days, next_event_at, weeks_created, status,
                           password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)`
    ).bind(
      id, data.name, data.hostId, data.sport, data.bracketType, data.tournamentType,
      data.entryFeeCents, data.maxPlayers, data.teamSize, data.rosterMode,
      data.cadenceDays, data.firstEventAt, data.password, now, now
    ).run();
    return (await this.getSeries(id))!;
  }

  async getSeries(id: string): Promise<SeriesRecord | null> {
    return await this.db.prepare(`SELECT * FROM series WHERE id = ?`).bind(id).first<SeriesRecord>();
  }

  async listSeries(limit = 50): Promise<SeriesRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM series ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all<SeriesRecord>();
    return results;
  }

  /** Every series whose next week is due, for the scheduled run. */
  async listSeriesDue(nowIso: string, limit = 50): Promise<SeriesRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM series
       WHERE status = 'active' AND next_event_at IS NOT NULL AND next_event_at <= ?
       ORDER BY next_event_at ASC LIMIT ?`
    ).bind(nowIso, limit).all<SeriesRecord>();
    return results;
  }

  async updateSeries(id: string, updates: Partial<SeriesRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k === "id") continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    vals.push(new Date().toISOString(), id);
    await this.db.prepare(`UPDATE series SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  async addSeriesMember(seriesId: string, userId: string): Promise<void> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO series_members (id, series_id, user_id, joined_at) VALUES (?, ?, ?, ?)`
    ).bind(createId("smember"), seriesId, userId, new Date().toISOString()).run();
  }

  async isSeriesMember(seriesId: string, userId: string): Promise<boolean> {
    const row = await this.db.prepare(
      `SELECT 1 AS hit FROM series_members WHERE series_id = ? AND user_id = ?`
    ).bind(seriesId, userId).first<any>();
    return !!row;
  }

  async getSeriesMembers(seriesId: string): Promise<SeriesMemberRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT m.user_id, COALESCE(u.name, m.user_id) AS user_name, m.joined_at
       FROM series_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.series_id = ?
       ORDER BY m.joined_at ASC`
    ).bind(seriesId).all<SeriesMemberRecord>();
    return results;
  }

  async getSeriesTournaments(seriesId: string): Promise<TournamentRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM tournaments WHERE series_id = ? ORDER BY series_week ASC`
    ).bind(seriesId).all<any>();
    return Promise.all(results.map((r: any) => this.rowToTournament(r)));
  }

  /**
   * Every competitor row across a season's weeks, in one query rather than one
   * per week. Identity is user_id where there is one, and the displayed name
   * otherwise, which is what a team the host typed in by hand has.
   */
  async getSeriesEngineTeams(seriesId: string): Promise<Array<{
    tournament_id: string; series_week: number | null; user_id: string | null;
    name: string; matches_played: number; group_points: number; total_score: number;
  }>> {
    const { results } = await this.db.prepare(
      `SELECT et.tournament_id, t.series_week, et.user_id, et.name,
              et.matches_played, et.group_points, et.total_score
       FROM engine_teams et
       JOIN tournaments t ON t.id = et.tournament_id
       WHERE t.series_id = ?`
    ).bind(seriesId).all<any>();
    return results;
  }

  /** How far each week has got, so a finished week can crown its winner. */
  async getSeriesMatchProgress(seriesId: string): Promise<Array<{
    tournament_id: string; total: number; finished: number;
  }>> {
    const { results } = await this.db.prepare(
      `SELECT em.tournament_id,
              COUNT(*) AS total,
              SUM(CASE WHEN em.status = 'COMPLETED' THEN 1 ELSE 0 END) AS finished
       FROM engine_matches em
       JOIN tournaments t ON t.id = em.tournament_id
       WHERE t.series_id = ?
       GROUP BY em.tournament_id`
    ).bind(seriesId).all<any>();
    return results;
  }

  // ── Public arenas ──

  async listArenas(limit = 50): Promise<ArenaRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM public_arenas ORDER BY updated_at DESC LIMIT ?`
    ).bind(limit).all<any>();
    return results.map((r: any) => ({
      id: r.id, name: r.name, state: JSON.parse(r.state_json),
      pin: r.pin ?? null, owner_id: r.owner_id ?? null, updated_at: r.updated_at,
    }));
  }

  async getArena(id: string): Promise<ArenaRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM public_arenas WHERE id = ?`).bind(id).first<any>();
    if (!r) return null;
    return {
      id: r.id, name: r.name, state: JSON.parse(r.state_json),
      pin: r.pin ?? null, owner_id: r.owner_id ?? null, updated_at: r.updated_at,
    };
  }

  async upsertArena(data: { id: string; name: string; state: unknown; pin: string | null; ownerId: string | null }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO public_arenas (id, name, state_json, pin, owner_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, state_json = excluded.state_json,
         pin = excluded.pin, updated_at = excluded.updated_at`
    ).bind(data.id, data.name, JSON.stringify(data.state), data.pin, data.ownerId, now).run();
  }

  // ── Offline-first scoring ──

  /**
   * Claim one score tap by the id its client minted, and say whether this
   * caller is the first to claim it.
   *
   * A tap is an increment, so a client replaying its outbox after a dropped
   * connection would otherwise count a second ball. INSERT OR IGNORE against
   * the primary key is the whole guard: the first claim writes a row and the
   * score is applied, every replay writes nothing and applies nothing.
   */
  async claimScoreEvent(
    eventId: string,
    matchId: string,
    teamId: string,
    type: string
  ): Promise<boolean> {
    const res = await this.db.prepare(
      `INSERT OR IGNORE INTO engine_score_events (id, match_id, team_id, type, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(eventId, matchId, teamId, type, new Date().toISOString()).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ── Both players confirm the frame ──

  /**
   * Record one side's agreement to a finished frame.
   *
   * Unique on (match, team), so a player tapping twice — or a host tapping for
   * the same side twice — cannot stand in for their opponent. Returns whether
   * this was a new confirmation.
   */
  async confirmFrame(
    matchId: string,
    teamId: string,
    userId: string | null,
    agreedWinnerId: string | null
  ): Promise<boolean> {
    const res = await this.db.prepare(
      `INSERT OR IGNORE INTO engine_frame_confirmations
         (id, match_id, team_id, user_id, agreed_winner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      createId("fconf"), matchId, teamId, userId, agreedWinnerId, new Date().toISOString()
    ).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async getFrameConfirmations(matchId: string): Promise<FrameConfirmationRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT match_id, team_id, user_id, agreed_winner_id, created_at
       FROM engine_frame_confirmations WHERE match_id = ?`
    ).bind(matchId).all<any>();
    return results as FrameConfirmationRecord[];
  }

  /** Every confirmation across a tournament, so the state reads in one query. */
  async getTournamentFrameConfirmations(tournamentId: string): Promise<FrameConfirmationRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT fc.match_id, fc.team_id, fc.user_id, fc.agreed_winner_id, fc.created_at
       FROM engine_frame_confirmations fc
       JOIN engine_matches em ON em.id = fc.match_id
       WHERE em.tournament_id = ?`
    ).bind(tournamentId).all<any>();
    return results as FrameConfirmationRecord[];
  }

  /** Restarting a frame throws away what was agreed about the old one. */
  async clearFrameConfirmations(matchId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM engine_frame_confirmations WHERE match_id = ?`)
      .bind(matchId).run();
  }

  /**
   * Settle a frame that was awaiting agreement, once.
   *
   * Guarded on the flag still being set, so two players confirming in the same
   * instant add the result to the table exactly once. Returns whether this
   * caller is the one that settled it.
   */
  async settleAwaitingConfirmation(matchId: string): Promise<boolean> {
    const res = await this.db.prepare(
      `UPDATE engine_matches SET awaiting_confirmation = 0
       WHERE id = ? AND awaiting_confirmation = 1`
    ).bind(matchId).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ── Join by QR ──

  async createJoinCode(
    code: string,
    tournamentId: string,
    createdBy: string | null,
    expiresAt: string
  ): Promise<void> {
    await this.db.prepare(
      `INSERT INTO tournament_join_codes (code, tournament_id, created_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         tournament_id = excluded.tournament_id,
         expires_at = excluded.expires_at`
    ).bind(code, tournamentId, createdBy, expiresAt, new Date().toISOString()).run();
  }

  async getJoinCode(
    code: string
  ): Promise<{ code: string; tournament_id: string; expires_at: string | null } | null> {
    const r = await this.db.prepare(
      `SELECT code, tournament_id, expires_at FROM tournament_join_codes WHERE code = ?`
    ).bind(code).first<any>();
    return r ?? null;
  }

  /**
   * The code already on the screen for this tournament, if it has not expired.
   *
   * Reused rather than reissued so a QR the room has already scanned keeps
   * working, and a host reopening the display does not invalidate it.
   */
  async getLiveJoinCodeFor(
    tournamentId: string
  ): Promise<{ code: string; expires_at: string | null } | null> {
    const r = await this.db.prepare(
      `SELECT code, expires_at FROM tournament_join_codes
       WHERE tournament_id = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 1`
    ).bind(tournamentId, new Date().toISOString()).first<any>();
    return r ?? null;
  }

  /**
   * A competitor with no account: a walk-in who scanned the code.
   *
   * guest_label rather than user_id, so nothing credits their wins to a member
   * and no wallet is ever looked for.
   */
  async createGuestEngineTeam(tournamentId: string, name: string): Promise<EngineTeam> {
    const id = createId("eteam");
    const now = new Date().toISOString();
    try {
      await this.db.prepare(
        `INSERT INTO engine_teams (id, tournament_id, name, guest_label, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, tournamentId, name, name, now).run();
    } catch (err) {
      // A database predating guest_label can still seat a walk-in; it just
      // cannot tell them from a team the host typed in, which is what they
      // effectively are.
      if (!isMissingColumnError(err)) throw err;
      await this.db.prepare(
        `INSERT INTO engine_teams (id, tournament_id, name, created_at) VALUES (?, ?, ?, ?)`
      ).bind(id, tournamentId, name, now).run();
    }
    return { id, name, matches_played: 0, group_points: 0, total_score: 0, bye_assigned: false };
  }

  /** How many competitors are already seated, for the join code's capacity check. */
  async countEngineTeams(tournamentId: string): Promise<number> {
    const r = await this.db.prepare(
      `SELECT COUNT(*) AS n FROM engine_teams WHERE tournament_id = ?`
    ).bind(tournamentId).first<any>();
    return r?.n ?? 0;
  }

  // ── Venues ──

  async createVenue(data: {
    name: string; city?: string; ownerId: string;
    chainId?: string | null; whatsappGroup?: string | null;
  }): Promise<VenueRecord> {
    const id = createId("venue");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO venues (id, chain_id, name, city, owner_id, whatsapp_group, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(
      id, data.chainId ?? null, data.name, data.city ?? "",
      data.ownerId, data.whatsappGroup ?? null, now, now
    ).run();
    // The owner is staff too, so a single-handed venue needs no second step.
    await this.addVenueMember(id, data.ownerId, "owner");
    return {
      id, chain_id: data.chainId ?? null, name: data.name, city: data.city ?? "",
      owner_id: data.ownerId, whatsapp_group: data.whatsappGroup ?? null,
      status: "active", created_at: now, updated_at: now,
    };
  }

  async getVenue(id: string): Promise<VenueRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM venues WHERE id = ?`).bind(id).first<any>();
    return r ?? null;
  }

  /** Every venue this account can act for, whether it owns one or works at it. */
  async listVenuesForUser(userId: string): Promise<VenueRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT DISTINCT v.* FROM venues v
       LEFT JOIN venue_members vm ON vm.venue_id = v.id
       WHERE v.owner_id = ? OR vm.user_id = ?
       ORDER BY v.created_at DESC`
    ).bind(userId, userId).all<any>();
    return results as VenueRecord[];
  }

  async listVenuesForChain(chainId: string): Promise<VenueRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM venues WHERE chain_id = ? ORDER BY name ASC`
    ).bind(chainId).all<any>();
    return results as VenueRecord[];
  }

  async listAllVenues(limit = 200): Promise<VenueRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM venues ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all<any>();
    return results as VenueRecord[];
  }

  async updateVenue(
    id: string,
    updates: Partial<Pick<VenueRecord, "name" | "city" | "whatsapp_group" | "chain_id" | "status">>
  ): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    vals.push(new Date().toISOString(), id);
    await this.db.prepare(`UPDATE venues SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  async addVenueMember(venueId: string, userId: string, role = "staff"): Promise<void> {
    await this.db.prepare(
      `INSERT INTO venue_members (id, venue_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(venue_id, user_id) DO UPDATE SET role = excluded.role`
    ).bind(createId("vmem"), venueId, userId, role, new Date().toISOString()).run();
  }

  async removeVenueMember(venueId: string, userId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM venue_members WHERE venue_id = ? AND user_id = ?`)
      .bind(venueId, userId).run();
  }

  async listVenueMembers(venueId: string): Promise<VenueMemberRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT vm.venue_id, vm.user_id, vm.role, vm.created_at,
              u.name AS user_name, u.email AS user_email
       FROM venue_members vm
       LEFT JOIN users u ON u.id = vm.user_id
       WHERE vm.venue_id = ?
       ORDER BY vm.created_at ASC`
    ).bind(venueId).all<any>();
    return results as VenueMemberRecord[];
  }

  /** 'owner', 'manager', 'staff', or null when this account has no part in it. */
  async getVenueRole(venueId: string, userId: string): Promise<string | null> {
    const venue = await this.getVenue(venueId);
    if (venue?.owner_id === userId) return "owner";
    const r = await this.db.prepare(
      `SELECT role FROM venue_members WHERE venue_id = ? AND user_id = ?`
    ).bind(venueId, userId).first<any>();
    return r?.role ?? null;
  }

  /** What a venue has actually run: nights, frames played and distinct players. */
  async venueActivity(venueId: string): Promise<{
    tournaments: number; completed: number; matches: number; players: number;
    lastNightAt: string | null;
  }> {
    const counts = await this.db.prepare(
      `SELECT COUNT(*) AS tournaments,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              MAX(created_at) AS last_night
       FROM tournaments WHERE venue_id = ?`
    ).bind(venueId).first<any>();

    const matches = await this.db.prepare(
      `SELECT COUNT(*) AS n FROM engine_matches em
       JOIN tournaments t ON t.id = em.tournament_id
       WHERE t.venue_id = ? AND em.status = 'COMPLETED'`
    ).bind(venueId).first<any>();

    const players = await this.db.prepare(
      `SELECT COUNT(DISTINCT et.name) AS n FROM engine_teams et
       JOIN tournaments t ON t.id = et.tournament_id
       WHERE t.venue_id = ?`
    ).bind(venueId).first<any>();

    return {
      tournaments: counts?.tournaments ?? 0,
      completed: counts?.completed ?? 0,
      matches: matches?.n ?? 0,
      players: players?.n ?? 0,
      lastNightAt: counts?.last_night ?? null,
    };
  }

  // ── Chains ──

  async createChain(data: { name: string; ownerId: string }): Promise<ChainRecord> {
    const id = createId("chain");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO chains (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, data.name, data.ownerId, now, now).run();
    return { id, name: data.name, owner_id: data.ownerId, created_at: now, updated_at: now };
  }

  async getChain(id: string): Promise<ChainRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM chains WHERE id = ?`).bind(id).first<any>();
    return r ?? null;
  }

  async listChainsForUser(userId: string): Promise<ChainRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM chains WHERE owner_id = ? ORDER BY created_at DESC`
    ).bind(userId).all<any>();
    return results as ChainRecord[];
  }

  /**
   * One league table across every venue in a chain.
   *
   * This is the thing a chain owner cannot get by buying the single-venue
   * product twice, and is the reason the tier exists: a player's record
   * follows them between sites instead of restarting at each one.
   */
  async chainStandings(chainId: string, limit = 50): Promise<Array<{
    name: string; played: number; points: number; score: number; venues: number;
  }>> {
    const { results } = await this.db.prepare(
      `SELECT et.name AS name,
              SUM(et.matches_played) AS played,
              SUM(et.group_points) AS points,
              SUM(et.total_score) AS score,
              COUNT(DISTINCT t.venue_id) AS venues
       FROM engine_teams et
       JOIN tournaments t ON t.id = et.tournament_id
       JOIN venues v ON v.id = t.venue_id
       WHERE v.chain_id = ?
       GROUP BY et.name
       ORDER BY points DESC, score DESC, played ASC
       LIMIT ?`
    ).bind(chainId, limit).all<any>();
    return results as any;
  }

  // ── Subscriptions ──

  async createSubscription(data: {
    venueId?: string | null; chainId?: string | null; userId: string;
    planCode: string; amountCents: number; intervalMonths: number;
    providerSubscriptionId?: string | null; providerPlanId?: string | null;
    status?: string; trialEndsAt?: string | null;
  }): Promise<SubscriptionRecord> {
    const id = createId("sub");
    const now = new Date().toISOString();
    const row: SubscriptionRecord = {
      id,
      venue_id: data.venueId ?? null,
      chain_id: data.chainId ?? null,
      user_id: data.userId,
      plan_code: data.planCode,
      provider: "razorpay",
      provider_subscription_id: data.providerSubscriptionId ?? null,
      provider_plan_id: data.providerPlanId ?? null,
      status: data.status ?? "created",
      amount_cents: data.amountCents,
      interval_months: data.intervalMonths,
      current_period_end: null,
      trial_ends_at: data.trialEndsAt ?? null,
      cancelled_at: null,
      created_at: now,
      updated_at: now,
    };
    await this.db.prepare(
      `INSERT INTO venue_subscriptions
         (id, venue_id, chain_id, user_id, plan_code, provider, provider_subscription_id,
          provider_plan_id, status, amount_cents, interval_months, trial_ends_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'razorpay', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, row.venue_id, row.chain_id, row.user_id, row.plan_code,
      row.provider_subscription_id, row.provider_plan_id, row.status,
      row.amount_cents, row.interval_months, row.trial_ends_at, now, now
    ).run();
    return row;
  }

  async getSubscription(id: string): Promise<SubscriptionRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM venue_subscriptions WHERE id = ?`)
      .bind(id).first<any>();
    return r ?? null;
  }

  async getSubscriptionByProviderId(providerId: string): Promise<SubscriptionRecord | null> {
    const r = await this.db.prepare(
      `SELECT * FROM venue_subscriptions WHERE provider_subscription_id = ?`
    ).bind(providerId).first<any>();
    return r ?? null;
  }

  async listSubscriptionsForUser(userId: string): Promise<SubscriptionRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT s.*, v.name AS venue_name FROM venue_subscriptions s
       LEFT JOIN venues v ON v.id = s.venue_id
       WHERE s.user_id = ? ORDER BY s.created_at DESC`
    ).bind(userId).all<any>();
    return results as SubscriptionRecord[];
  }

  async listSubscriptions(limit = 200): Promise<SubscriptionRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT s.*, v.name AS venue_name, u.name AS user_name FROM venue_subscriptions s
       LEFT JOIN venues v ON v.id = s.venue_id
       LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC LIMIT ?`
    ).bind(limit).all<any>();
    return results as SubscriptionRecord[];
  }

  /**
   * The subscription that currently entitles a venue, if any.
   *
   * A venue inside a chain is entitled by the chain's subscription as well as
   * by its own, which is the whole point of the tier.
   */
  async entitlingSubscription(
    venueId: string,
    chainId: string | null
  ): Promise<SubscriptionRecord | null> {
    const r = await this.db.prepare(
      `SELECT * FROM venue_subscriptions
       WHERE status IN ('active', 'authenticated', 'trialing')
         AND (venue_id = ? OR (chain_id IS NOT NULL AND chain_id = ?))
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'authenticated' THEN 1 ELSE 2 END,
                created_at DESC
       LIMIT 1`
    ).bind(venueId, chainId).first<any>();
    return r ?? null;
  }

  async updateSubscription(id: string, updates: Partial<SubscriptionRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k === "id" || v === undefined) continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    vals.push(new Date().toISOString(), id);
    await this.db.prepare(`UPDATE venue_subscriptions SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...vals).run();
  }

  /**
   * Record one billing webhook, and say whether it is the first time we have
   * seen it.
   *
   * Razorpay redelivers; without this a redelivered charge would extend a
   * billing period twice. Unique on the provider's event id.
   */
  async recordSubscriptionEvent(data: {
    subscriptionId: string | null; providerEventId: string | null;
    event: string; payload: unknown;
  }): Promise<boolean> {
    // An event the provider did not identify cannot be de-duplicated, so it is
    // stored under an id of our own and treated as new.
    const providerEventId = data.providerEventId ?? createId("revt");
    const res = await this.db.prepare(
      `INSERT OR IGNORE INTO subscription_events
         (id, subscription_id, provider_event_id, event, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      createId("sevt"), data.subscriptionId, providerEventId, data.event,
      JSON.stringify(data.payload ?? null), new Date().toISOString()
    ).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async listSubscriptionEvents(subscriptionId: string, limit = 50): Promise<Array<{
    event: string; created_at: string;
  }>> {
    const { results } = await this.db.prepare(
      `SELECT event, created_at FROM subscription_events
       WHERE subscription_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(subscriptionId, limit).all<any>();
    return results as any;
  }

  // ── The WTA Coin ──
  //
  // There is deliberately no credit, debit, transfer, purchase or withdrawal
  // method here. The only way a coin comes into existence is awardCoins(),
  // from a result the engine itself recorded. See lib/coins.ts for why.

  async getCoinBalance(userId: string): Promise<CoinBalanceRecord> {
    const r = await this.db.prepare(`SELECT * FROM coin_balances WHERE user_id = ?`)
      .bind(userId).first<any>();
    return r ?? {
      user_id: userId, balance: 0, lifetime: 0, updated_at: new Date().toISOString(),
    };
  }

  /**
   * Pay one award, once.
   *
   * The ledger insert comes first and is guarded by the unique index on
   * (user, reason, reference) — so a frame that is settled twice, replayed
   * from an outbox, or re-finished after a restart pays exactly once. Only a
   * claim that actually wrote a row goes on to move the balance.
   *
   * Returns the new balance, or null when this award had already been paid.
   */
  async awardCoins(args: {
    userId: string;
    reason: string;
    amount: number;
    description?: string;
    referenceType?: string | null;
    referenceId?: string | null;
  }): Promise<number | null> {
    if (!Number.isInteger(args.amount) || args.amount <= 0) return null;

    const now = new Date().toISOString();
    // A null in a SQLite unique index does not compare equal to another null,
    // so an award with no reference would never be de-duplicated. Empty
    // strings do compare, which is what these fall back to.
    const refType = args.referenceType ?? "";
    const refId = args.referenceId ?? "";

    const claim = await this.db.prepare(
      `INSERT OR IGNORE INTO coin_ledger
         (id, user_id, reason, amount, balance_after, description, reference_type, reference_id, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).bind(
      createId("coin"), args.userId, args.reason, args.amount,
      args.description ?? null, refType, refId, now
    ).run();

    if ((claim.meta?.changes ?? 0) === 0) return null;

    await this.db.prepare(
      `INSERT INTO coin_balances (user_id, balance, lifetime, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         balance = balance + excluded.balance,
         lifetime = lifetime + excluded.lifetime,
         updated_at = excluded.updated_at`
    ).bind(args.userId, args.amount, args.amount, now).run();

    const fresh = await this.getCoinBalance(args.userId);

    // Written back so the ledger a player reads shows the running total, not
    // the zero the claim was inserted with.
    await this.db.prepare(
      `UPDATE coin_ledger SET balance_after = ?
       WHERE user_id = ? AND reason = ? AND reference_type = ? AND reference_id = ?`
    ).bind(fresh.balance, args.userId, args.reason, refType, refId).run();

    return fresh.balance;
  }

  /** What this account has earned since midnight UTC, for the daily cap. */
  async coinsEarnedToday(userId: string): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const r = await this.db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM coin_ledger
       WHERE user_id = ? AND created_at >= ?`
    ).bind(userId, since.toISOString()).first<any>();
    return r?.total ?? 0;
  }

  /**
   * What this account has earned since midnight UTC from a particular set of
   * reasons, for a sub-cap that applies to only some of them.
   */
  async coinsEarnedTodayFor(userId: string, reasons: string[]): Promise<number> {
    if (reasons.length === 0) return 0;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const slots = reasons.map(() => "?").join(", ");
    const r = await this.db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM coin_ledger
       WHERE user_id = ? AND created_at >= ? AND reason IN (${slots})`
    ).bind(userId, since.toISOString(), ...reasons).first<any>();
    return r?.total ?? 0;
  }

  /**
   * How many of a venue's most recent nights this account played, unbroken,
   * counting back from the latest.
   *
   * Counted over the nights the venue actually ran rather than over calendar
   * weeks, so a venue that skips a week does not break anybody's run — the
   * player did not miss anything. A night they sat out ends the count.
   */
  async consecutiveVenueNights(
    userId: string,
    venueId: string,
    lookback = 30
  ): Promise<number> {
    const { results } = await this.db.prepare(
      `SELECT t.id AS id,
              MAX(CASE WHEN et.user_id = ? THEN 1 ELSE 0 END) AS attended
       FROM tournaments t
       LEFT JOIN engine_teams et ON et.tournament_id = t.id
       WHERE t.venue_id = ?
       GROUP BY t.id, t.created_at
       ORDER BY t.created_at DESC
       LIMIT ?`
    ).bind(userId, venueId, lookback).all<any>();

    let run = 0;
    for (const row of results) {
      if (Number(row.attended) !== 1) break;
      run++;
    }
    return run;
  }

  async getCoinLedger(userId: string, limit = 50): Promise<CoinLedgerRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM coin_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(userId, limit).all<any>();
    return results as CoinLedgerRecord[];
  }

  /** Whether this account has already been paid for turning up tonight. */
  async hasNightAward(userId: string, tournamentId: string): Promise<boolean> {
    const r = await this.db.prepare(
      `SELECT 1 AS hit FROM coin_ledger
       WHERE user_id = ? AND reason = 'NIGHT_PLAYED'
         AND reference_type = 'tournament' AND reference_id = ?
       LIMIT 1`
    ).bind(userId, tournamentId).first<any>();
    return !!r;
  }

  async coinLeaderboard(limit = 50): Promise<CoinBalanceRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT cb.*, u.name AS user_name FROM coin_balances cb
       LEFT JOIN users u ON u.id = cb.user_id
       ORDER BY cb.balance DESC, cb.updated_at ASC
       LIMIT ?`
    ).bind(limit).all<any>();
    return results as CoinBalanceRecord[];
  }

  /** Where this account sits on the leaderboard. 1-based; 0 when unranked. */
  async coinRank(userId: string): Promise<number> {
    const me = await this.getCoinBalance(userId);
    if (me.balance <= 0) return 0;
    const r = await this.db.prepare(
      `SELECT COUNT(*) AS ahead FROM coin_balances WHERE balance > ?`
    ).bind(me.balance).first<any>();
    return (r?.ahead ?? 0) + 1;
  }

  /**
   * How many distinct signed-in accounts are competing in a tournament.
   *
   * The anti-farming guard: a bracket of one real person and seven typed-in
   * names is a practice session, and practice does not pay.
   */
  async countRealCompetitors(tournamentId: string): Promise<number> {
    const r = await this.db.prepare(
      `SELECT COUNT(DISTINCT user_id) AS n FROM engine_teams
       WHERE tournament_id = ? AND user_id IS NOT NULL`
    ).bind(tournamentId).first<any>();
    return r?.n ?? 0;
  }
}
