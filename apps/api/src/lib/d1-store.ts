/**
 * D1 database adapter — replaces SQLAlchemy repository.
 * All queries use D1's prepared statements.
 */

import { createId } from "./crypto";

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
  winner_id: string | null; started_at: string | null; completed_at: string | null;
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

  async listUsers(): Promise<UserRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT u.*, COALESCE(w.balance_cents, 0) as wallet_balance_cents
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id ORDER BY LOWER(u.name)`
    ).all<any>();
    return results.map((u: any) => ({ ...u, wallet_balance_cents: u.wallet_balance_cents ?? 0 }));
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
      `SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC`
    ).bind(userId).all<any>();
    return results.map((r: any) => ({ ...r, is_test: !!r.is_test }));
  }

  async deductWallet(userId: string, amountCents: number, refType: string, refId: string): Promise<UserRecord> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");
    if (user.wallet_balance_cents < amountCents) throw new Error("Insufficient wallet balance");

    const newBalance = user.wallet_balance_cents - amountCents;
    const txnId = createId("wallettxn");
    const now = new Date().toISOString();

    await this.db.batch([
      this.db.prepare(`UPDATE wallets SET balance_cents = ?, updated_at = ? WHERE user_id = ?`)
        .bind(newBalance, now, userId),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         VALUES (?, (SELECT id FROM wallets WHERE user_id = ?), ?, 'entry_fee_debit', ?, ?, ?, ?, ?)`
      ).bind(txnId, userId, userId, amountCents, newBalance, refType, refId, now),
    ]);

    return { ...user, wallet_balance_cents: newBalance };
  }

  async creditWallet(userId: string, amountCents: number, refType: string, refId: string, txnType = "deposit", paymentId: string | null = null, isTest = false): Promise<UserRecord> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");

    const newBalance = user.wallet_balance_cents + amountCents;
    const txnId = createId("wallettxn");
    const now = new Date().toISOString();

    await this.db.batch([
      this.db.prepare(`UPDATE wallets SET balance_cents = ?, updated_at = ? WHERE user_id = ?`)
        .bind(newBalance, now, userId),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, payment_id, type, amount_cents, balance_after_cents, reference_type, reference_id, is_test, created_at)
         VALUES (?, (SELECT id FROM wallets WHERE user_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(txnId, userId, userId, paymentId, txnType, amountCents, newBalance, refType, refId, isTest ? 1 : 0, now),
    ]);

    return { ...user, wallet_balance_cents: newBalance };
  }

  async transferCredits(senderId: string, recipientId: string, amountCents: number): Promise<UserRecord> {
    const sender = await this.getUserById(senderId);
    const recipient = await this.getUserById(recipientId);
    if (!sender) throw new Error("Sender not found");
    if (!recipient) throw new Error("Recipient not found");
    if (sender.wallet_balance_cents < amountCents) throw new Error("Insufficient wallet balance");

    const sNewBal = sender.wallet_balance_cents - amountCents;
    const rNewBal = recipient.wallet_balance_cents + amountCents;
    const now = new Date().toISOString();

    await this.db.batch([
      this.db.prepare(`UPDATE wallets SET balance_cents = ?, updated_at = ? WHERE user_id = ?`).bind(sNewBal, now, senderId),
      this.db.prepare(`UPDATE wallets SET balance_cents = ?, updated_at = ? WHERE user_id = ?`).bind(rNewBal, now, recipientId),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         VALUES (?, (SELECT id FROM wallets WHERE user_id = ?), ?, 'manual_adjustment', ?, ?, 'p2p_transfer_out', ?, ?)`
      ).bind(createId("wallettxn"), senderId, senderId, amountCents, sNewBal, recipientId, now),
      this.db.prepare(
        `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
         VALUES (?, (SELECT id FROM wallets WHERE user_id = ?), ?, 'deposit', ?, ?, 'p2p_transfer_in', ?, ?)`
      ).bind(createId("wallettxn"), recipientId, recipientId, amountCents, rNewBal, senderId, now),
    ]);

    return { ...sender, wallet_balance_cents: sNewBal };
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
      participant_ids: pids,
    };
  }

  async listTournaments(): Promise<TournamentRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM tournaments ORDER BY name`
    ).all<any>();
    return Promise.all(results.map((r: any) => this.rowToTournament(r)));
  }

  async listTournamentsByUser(userId: string): Promise<TournamentRecord[]> {
    const { results } = await this.db.prepare(
      `SELECT t.* FROM tournaments t JOIN participants p ON p.tournament_id = t.id
       WHERE p.user_id = ? ORDER BY t.created_at DESC`
    ).bind(userId).all<any>();
    return Promise.all(results.map((r: any) => this.rowToTournament(r)));
  }

  async getTournament(id: string): Promise<TournamentRecord | null> {
    const row = await this.db.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(id).first<any>();
    return row ? this.rowToTournament(row) : null;
  }

  async createTournament(data: {
    name: string; entryFeeCents: number; maxPlayers: number; hostId: string;
    teamSize?: number; tournamentType?: string; bracketType?: string; password?: string | null;
  }): Promise<TournamentRecord> {
    const id = createId("tournament");
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO tournaments (id, name, entry_fee_cents, max_players, host_id, team_size, tournament_type, bracket_type, password, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    ).bind(id, data.name, data.entryFeeCents, data.maxPlayers, data.hostId,
      data.teamSize ?? 1, data.tournamentType ?? "online",
      data.bracketType ?? "single_elimination", data.password ?? null, now, now).run();
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

  async joinTournament(userId: string, tournamentId: string, teamId: string | null = null): Promise<{ user: UserRecord; tournament: TournamentRecord }> {
    const user = await this.getUserById(userId);
    const tournament = await this.getTournament(tournamentId);
    if (!user) throw new Error("User not found");
    if (!tournament) throw new Error("Tournament not found");
    if (tournament.participant_ids.includes(userId)) throw new Error("User already joined this tournament");
    if (tournament.status !== "open") throw new Error("Tournament is not open for new entries");
    if (tournament.participant_ids.length >= tournament.max_players) throw new Error("Tournament is already full");

    const stmts: D1PreparedStatement[] = [];
    const now = new Date().toISOString();
    let newBalance = user.wallet_balance_cents;

    if (tournament.entry_fee_cents > 0) {
      if (user.wallet_balance_cents < tournament.entry_fee_cents) throw new Error("Insufficient wallet balance for tournament entry");
      newBalance -= tournament.entry_fee_cents;
      stmts.push(
        this.db.prepare(`UPDATE wallets SET balance_cents = ?, updated_at = ? WHERE user_id = ?`)
          .bind(newBalance, now, userId),
        this.db.prepare(
          `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at)
           VALUES (?, (SELECT id FROM wallets WHERE user_id = ?), ?, 'entry_fee_debit', ?, ?, 'tournament_entry', ?, ?)`
        ).bind(createId("wallettxn"), userId, userId, tournament.entry_fee_cents, newBalance, tournamentId, now),
      );
    }

    const seed = tournament.participant_ids.length + 1;
    stmts.push(
      this.db.prepare(
        `INSERT INTO participants (id, tournament_id, user_id, team_id, status, seed, joined_at) VALUES (?, ?, ?, ?, 'registered', ?, ?)`
      ).bind(createId("participant"), tournamentId, userId, teamId, seed, now),
    );

    const newCount = tournament.participant_ids.length + 1;
    if (newCount >= tournament.max_players) {
      stmts.push(
        this.db.prepare(`UPDATE tournaments SET status = 'full', updated_at = ? WHERE id = ?`).bind(now, tournamentId),
      );
    }

    // Update prize pool
    stmts.push(
      this.db.prepare(`UPDATE tournaments SET prize_pool_cents = prize_pool_cents + ?, updated_at = ? WHERE id = ?`)
        .bind(tournament.entry_fee_cents, now, tournamentId),
    );

    await this.db.batch(stmts);

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

  async updateParticipant(tournamentId: string, userId: string, updates: Record<string, any>): Promise<void> {
    const sets = Object.keys(updates).map(k => `${k} = ?`);
    const vals = [...Object.values(updates), tournamentId, userId];
    await this.db.prepare(
      `UPDATE participants SET ${sets.join(", ")} WHERE tournament_id = ? AND user_id = ?`
    ).bind(...vals).run();
  }

  // ── Matches ──

  async createMatch(data: {
    tournamentId: string; roundNum: number; matchOrder: number;
    player1Id?: string | null; player2Id?: string | null;
    scoreThreshold?: number; scheduledAt?: string | null;
  }): Promise<MatchRecord> {
    const id = createId("match");
    const roomCode = createId("room");
    const status = data.player1Id && data.player2Id ? "pending" : "waiting";
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO matches (id, tournament_id, round, match_order, player1_id, player2_id, room_code, status, score_threshold, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, data.tournamentId, data.roundNum, data.matchOrder,
      data.player1Id ?? null, data.player2Id ?? null, roomCode, status,
      data.scoreThreshold ?? 40, data.scheduledAt ?? null, now).run();
    return (await this.getMatch(id))!;
  }

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

  async updatePayment(id: string, updates: Record<string, any>): Promise<void> {
    updates.updated_at = new Date().toISOString();
    const sets = Object.keys(updates).map(k => `${k} = ?`);
    const vals = [...Object.values(updates), id];
    await this.db.prepare(`UPDATE payments SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
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

  async markNotificationRead(id: string): Promise<void> {
    await this.db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).bind(id).run();
  }

  // ── Stats ──

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

  // ── Teams ──

  async getTeamByCode(code: string): Promise<TeamRecord | null> {
    const r = await this.db.prepare(`SELECT * FROM teams WHERE code = ?`).bind(code).first<any>();
    if (!r) return null;
    const { results } = await this.db.prepare(`SELECT user_id FROM participants WHERE team_id = ?`).bind(r.id).all<any>();
    return { ...r, member_ids: results.map((p: any) => p.user_id) };
  }

  async listTeamsByTournament(tournamentId: string): Promise<TeamRecord[]> {
    const { results } = await this.db.prepare(`SELECT * FROM teams WHERE tournament_id = ?`).bind(tournamentId).all<any>();
    const teams: TeamRecord[] = [];
    for (const r of results) {
      const { results: members } = await this.db.prepare(`SELECT user_id FROM participants WHERE team_id = ?`).bind(r.id).all<any>();
      teams.push({ ...r, member_ids: members.map((p: any) => p.user_id) });
    }
    return teams;
  }
}
