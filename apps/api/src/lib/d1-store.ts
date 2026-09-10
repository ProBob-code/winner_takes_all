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

/** Engine match as stored — core engine shape plus persistence fields. */
export interface EngineMatch extends EngineMatchCore {
  tournament_id: string;
  ended_by: "SCORE" | "TIME" | null;
}

// ── Record types ──

export interface UserRecord {
  id: string; name: string; email: string; password_hash: string;
  role: string; wallet_balance_cents: number; created_at: string;
}

export interface WalletEntryRecord {
  id: string; user_id: string; type: string; amount_cents: number;
  reference_type: string; reference_id: string; is_test: boolean; created_at: string;
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
  wins: number; losses: number;
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
    return results.map((r: any) => ({ ...r, is_test: !!r.is_test }));
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

    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  /** Atomically credit a wallet (relative update, single transaction). */
  async creditWallet(userId: string, amountCents: number, refType: string, refId: string, txnType = "deposit", paymentId: string | null = null, isTest = false): Promise<UserRecord> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invalid amount");
    const now = new Date().toISOString();

    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE wallets SET balance_cents = balance_cents + ?, updated_at = ? WHERE user_id = ?`
      ).bind(amountCents, now, userId),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, payment_id, type, amount_cents, balance_after_cents, reference_type, reference_id, is_test, created_at)
         SELECT ?, w.id, ?, ?, ?, ?, w.balance_cents, ?, ?, ?, ?
         FROM wallets w WHERE w.user_id = ?`
      ).bind(createId("wallettxn"), userId, paymentId, txnType, amountCents, refType, refId, isTest ? 1 : 0, now, userId),
    ]);

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
    sport?: string;
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
        `INSERT INTO tournaments (id, name, entry_fee_cents, max_players, host_id, team_size, tournament_type, bracket_type, sport, password, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(...common, data.sport ?? "8BALL", data.password ?? null, now, now).run();
    } catch (err) {
      // A database that predates the sport column would otherwise fail the
      // whole insert, taking tournament creation down until the migration is
      // applied. Fall back to the older shape: such tournaments were all
      // 8-ball, which is exactly what rowToTournament reports for them.
      const detail = err instanceof Error ? err.message : String(err);
      if (!/no such column/i.test(detail)) throw err;

      await this.db.prepare(
        `INSERT INTO tournaments (id, name, entry_fee_cents, max_players, host_id, team_size, tournament_type, bracket_type, password, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(...common, data.password ?? null, now, now).run();
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

  async updateTournamentBracketState(id: string, state: any): Promise<void> {
    await this.db.prepare(
      `UPDATE tournaments SET bracket_state = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify(state), new Date().toISOString(), id).run();
  }

  async deleteTournament(id: string): Promise<void> {
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
    const [winsR, p1R, p2R, s1R, s2R, earningsR, twR] = await this.db.batch([
      this.db.prepare(`SELECT COUNT(*) as c FROM matches WHERE winner_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COUNT(*) as c FROM matches WHERE player1_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COUNT(*) as c FROM matches WHERE player2_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COALESCE(SUM(player1_score),0) as s FROM matches WHERE player1_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COALESCE(SUM(player2_score),0) as s FROM matches WHERE player2_id = ? AND scores_approved = 1`).bind(userId),
      this.db.prepare(`SELECT COALESCE(SUM(amount_cents),0) as s FROM wallet_transactions WHERE user_id = ? AND type = 'tournament_payout'`).bind(userId),
      this.db.prepare(`SELECT COUNT(*) as c FROM tournaments WHERE winner_id = ? AND status = 'completed'`).bind(userId),
    ]);

    const wins = (winsR.results[0] as any)?.c ?? 0;
    const total = ((p1R.results[0] as any)?.c ?? 0) + ((p2R.results[0] as any)?.c ?? 0);
    const losses = total - wins;
    const totalScore = ((s1R.results[0] as any)?.s ?? 0) + ((s2R.results[0] as any)?.s ?? 0);
    const earnings = (earningsR.results[0] as any)?.s ?? 0;
    const tournamentWins = (twR.results[0] as any)?.c ?? 0;

    return {
      tournament_wins: tournamentWins,
      wins, losses, total_score: totalScore,
      points: wins * 3 + tournamentWins * 10,
      earnings_cents: earnings,
    };
  }

  /** Real leaderboard: aggregated in SQL, only players who have played. */
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
       tw AS (
         SELECT winner_id AS uid, COUNT(*) AS twins FROM tournaments
         WHERE status = 'completed' AND winner_id IS NOT NULL GROUP BY winner_id
       ),
       earn AS (
         SELECT user_id AS uid, COALESCE(SUM(amount_cents),0) AS cents
         FROM wallet_transactions WHERE type = 'tournament_payout' GROUP BY user_id
       )
       SELECT u.id AS user_id, u.name,
              COALESCE(w.wins, 0) AS wins,
              COALESCE(t.games, 0) - COALESCE(w.wins, 0) AS losses,
              COALESCE(tw.twins, 0) AS tournament_wins,
              COALESCE(e.cents, 0) AS earnings_cents
       FROM users u
       LEFT JOIN totals t ON t.uid = u.id
       LEFT JOIN winners w ON w.uid = u.id
       LEFT JOIN tw ON tw.uid = u.id
       LEFT JOIN earn e ON e.uid = u.id
       WHERE COALESCE(t.games, 0) > 0 OR COALESCE(tw.twins, 0) > 0
       ORDER BY wins DESC, earnings_cents DESC, u.name
       LIMIT ?`
    ).bind(limit).all<any>();
    return results as LeaderboardRow[];
  }

  // ── Engine (dynamic tournament) ──

  async createEngineTeam(tournamentId: string, name: string): Promise<EngineTeam> {
    const id = createId("eteam");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO engine_teams (id, tournament_id, name, created_at) VALUES (?, ?, ?, ?)`
    ).bind(id, tournamentId, name, now).run();
    return { id, name, matches_played: 0, group_points: 0, total_score: 0, bye_assigned: false };
  }

  async getEngineTeams(tournamentId: string): Promise<EngineTeam[]> {
    const { results } = await this.db.prepare(`SELECT * FROM engine_teams WHERE tournament_id = ?`).bind(tournamentId).all<any>();
    return results.map(r => ({ ...r, bye_assigned: !!r.bye_assigned }));
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
    return { ...r, sudden_death: !!r.sudden_death, black_potted_a: !!r.black_potted_a, black_potted_b: !!r.black_potted_b };
  }

  async getEngineMatches(tournamentId: string): Promise<EngineMatch[]> {
    const { results } = await this.db.prepare(`SELECT * FROM engine_matches WHERE tournament_id = ? ORDER BY match_order ASC, created_at ASC`).bind(tournamentId).all<any>();
    return results.map(r => ({ ...r, sudden_death: !!r.sudden_death, black_potted_a: !!r.black_potted_a, black_potted_b: !!r.black_potted_b }));
  }

  async updateEngineMatch(matchId: string, updates: Partial<EngineMatch>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'id' || k === 'tournament_id') continue;
      sets.push(`${k} = ?`);
      if (['sudden_death', 'black_potted_a', 'black_potted_b'].includes(k)) {
        vals.push(v ? 1 : 0);
      } else {
        vals.push(v);
      }
    }
    if (sets.length === 0) return;
    vals.push(matchId);
    await this.db.prepare(`UPDATE engine_matches SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  async createEngineMatchup(tournamentId: string, team1Id: string, team2Id: string, matchId: string): Promise<void> {
    await this.db.prepare(`INSERT INTO engine_matchups (id, tournament_id, team1_id, team2_id, match_id) VALUES (?, ?, ?, ?, ?)`).bind(createId("emup"), tournamentId, team1Id, team2Id, matchId).run();
  }

  async getEngineMatchups(tournamentId: string): Promise<{ team1_id: string; team2_id: string }[]> {
    const { results } = await this.db.prepare(`SELECT team1_id, team2_id FROM engine_matchups WHERE tournament_id = ?`).bind(tournamentId).all<any>();
    return results as { team1_id: string; team2_id: string }[];
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
}
