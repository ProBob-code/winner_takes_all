/**
 * Imposter: one room, addressed as "room:<CODE>".
 *
 * The room is the whole game. It holds the players, deals the words, keeps
 * the clock with alarms, plays the bots, counts the votes and pays the coins.
 * Screens only ever send what their player did (a clue, a vote, a taunt) and
 * receive their own view of the room back: a player's state carries their
 * own word and nobody else's, and who the imposters are is only sent once the
 * result is in. (The design this came from broadcast the whole game, words
 * and roles included, to every screen; anyone with dev tools could see them.)
 *
 * WHO HOSTS
 * Whoever created the room, until they drop: then the next connected real
 * player. The host changes the settings, adds bots, removes players in the
 * lobby and starts games. Nothing the host's screen says is trusted beyond
 * that.
 *
 * WHAT PAYS
 * Winners only, real players only, and only when at least
 * IMPOSTER_MIN_PLAYERS_FOR_COINS real players each gave a clue of their own.
 * Paid from here once per game per player (the ledger's unique index on
 * reference "imposter:<gameId>"), under the online daily cap. See lib/coins.ts.
 *
 * Sockets are plain accepted WebSockets, not hibernatable: a room only lives
 * while people are in it, and the clock needs it awake anyway.
 */

import type { Env } from "../types";
import { D1Store } from "../lib/d1-store";
import {
  COIN_AWARDS,
  IMPOSTER_MIN_PLAYERS_FOR_COINS,
  ONLINE_DAILY_CAP,
  ONLINE_REASONS,
  applyDailyCap,
  awardsForImposter,
  totalOf,
} from "../lib/coins";
import {
  BOT_CLUES,
  BOT_NAMES,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  T_CLUE,
  T_REVEAL,
  T_VOTE,
  TAUNT_KEYS,
  WORD_PAIRS,
  clueProblem,
  innocentsWin,
  maxImposters,
  tally,
  type ImposterUser,
  type Revote,
} from "../lib/imposter";

type Phase = "lobby" | "reveal" | "describe" | "vote" | "result";

type Player = {
  /** Public id inside this room. Never the account id. */
  id: string;
  userId: string | null;
  name: string;
  bot: boolean;
  color: number;
  host: boolean;
  /** Coins actually paid to this player in this room, all games. */
  coins: number;
  /** When their socket closed, or null while connected. Bots are never away. */
  away: number | null;
};

type Clue = { p: string; r: number; x: string; o: 0 | 1 };

type Result = {
  counts: Record<string, number>;
  out: string[];
  innocentsWon: boolean;
  winners: string[];
  tiedAgain: boolean;
  revoted: boolean;
  /** True until the payout has been written. */
  settling: boolean;
  /** Too few real players took part, so nothing was paid. */
  practice: boolean;
  paid: Record<string, number>;
  /** Winners the daily cap trimmed. */
  capped: string[];
};

type Game = {
  gid: string;
  imposters: string[];
  words: Record<string, string>;
  innocentWord: string;
  imposterWord: string;
  order: string[];
  round: number;
  turn: number;
  clues: Clue[];
  votes: Record<string, string[]>;
  revote: Revote | null;
  firstCounts: Record<string, number> | null;
  result: Result | null;
};

type Room = {
  code: string;
  phase: Phase;
  players: Player[];
  imposters: number;
  rounds: number;
  game: Game | null;
  /** When the current phase or turn runs out; 0 when nothing is timed. */
  deadline: number;
  /** When the bot whose turn it is gives its clue; 0 when no bot is due. */
  botAt: number;
  lastPair: number;
};

/** A dropped player's turn is skipped this fast rather than run to the full clock. */
const AWAY_TURN_MS = 5_000;
/** How long someone who dropped out of the lobby keeps their seat. */
const LOBBY_GRACE_MS = 60_000;
/** A room nobody is connected to is wiped after this. */
const EMPTY_KEEP_MS = 10 * 60_000;
const TAUNT_GAP_MS = 1_200;
const COLORS = 10;

const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
function shuffle<T>(a: readonly T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export class ImposterRooms {
  private state: DurableObjectState;
  private env: Env;
  private room: Room | null = null;
  private loaded = false;
  private sockets = new Map<string, WebSocket>();
  private emptySince: number | null = null;
  private lastTaunt = new Map<string, number>();
  /** Coin balances learned during a payout, sent only to their owner. */
  private balances = new Map<string, number>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/join") return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a websocket", { status: 426 });
    }
    let user: ImposterUser | null = null;
    try {
      const u = JSON.parse(request.headers.get("x-imposter-user") || "null");
      if (u && typeof u.userId === "string" && typeof u.name === "string") user = u;
    } catch {
      /* refused below */
    }
    const code = url.searchParams.get("code") || "";
    if (!user || !code) return new Response("Bad request", { status: 400 });

    await this.load();
    const create = request.headers.get("x-imposter-create") === "1";

    if (create) {
      // A code in use by a live room: the Worker rolls another.
      if (this.room && this.sockets.size > 0) return new Response("Taken", { status: 409 });
      this.room = {
        code,
        phase: "lobby",
        players: [],
        imposters: 1,
        rounds: 2,
        game: null,
        deadline: 0,
        botAt: 0,
        lastPair: -1,
      };
      this.balances.clear();
    } else if (!this.room) {
      return refuse(4404, `No room ${code}. Check the code with the host.`);
    }
    const room = this.room!;

    let me = room.players.find((p) => p.userId === user!.userId);
    if (!me) {
      if (room.phase !== "lobby") return refuse(4409, "That game has already started. Join when they are back in the room.");
      if (room.players.length >= MAX_PLAYERS) return refuse(4409, "That room is full (10 players).");
      me = {
        id: rid(),
        userId: user.userId,
        name: user.name,
        bot: false,
        color: this.freeColor(),
        host: false,
        coins: 0,
        away: null,
      };
      room.players.push(me);
    }
    me.away = null;
    me.name = user.name;
    if (create) me.host = true;
    this.ensureHost();

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    const previous = this.sockets.get(me.id);
    if (previous) safeClose(previous, 4000, "Opened in another tab");
    this.sockets.set(me.id, server);
    this.emptySince = null;

    const pid = me.id;
    server.addEventListener("message", (event) => {
      void this.onMessage(pid, server, event.data).catch((err) => console.error("imposter message failed:", err));
    });
    const gone = () => {
      void this.onClose(pid, server).catch((err) => console.error("imposter close failed:", err));
    };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);

    await this.commit();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Storage and broadcast ──────────────────────────────────────────────

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    this.room = (await this.state.storage.get<Room>("room")) ?? null;
    // A fresh instance has no sockets: everybody is away until they reconnect.
    if (this.room) {
      const now = Date.now();
      for (const p of this.room.players) if (!p.bot) p.away = p.away ?? now;
      this.emptySince = now;
    }
  }

  /** Save, tell everyone, and set the next alarm. Called after every change. */
  private async commit() {
    if (!this.room) return;
    await this.state.storage.put("room", this.room);
    this.broadcastState();
    await this.schedule();
  }

  private broadcastState() {
    for (const [pid, ws] of this.sockets) safeSend(ws, JSON.stringify(this.view(pid)));
  }

  private sendTo(pid: string, msg: unknown) {
    const ws = this.sockets.get(pid);
    if (ws) safeSend(ws, JSON.stringify(msg));
  }

  private async schedule() {
    const room = this.room;
    if (!room) return;
    const times: number[] = [];
    if ((room.phase === "reveal" || room.phase === "describe" || room.phase === "vote") && room.deadline) times.push(room.deadline);
    if (room.botAt) times.push(room.botAt);
    if (room.phase === "lobby" || room.phase === "result") {
      for (const p of room.players) if (p.away !== null) times.push(p.away + LOBBY_GRACE_MS);
    }
    if (this.sockets.size === 0) times.push((this.emptySince ?? Date.now()) + EMPTY_KEEP_MS);
    if (times.length) await this.state.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...times)));
    else await this.state.storage.deleteAlarm();
  }

  /** What one player is allowed to see. */
  private view(pid: string) {
    const room = this.room!;
    const g = room.game;
    const now = Date.now();
    const timed = room.phase === "reveal" || room.phase === "describe" || room.phase === "vote";
    const total = room.phase === "vote" ? T_VOTE : room.phase === "reveal" ? T_REVEAL : T_CLUE;
    const res = g && room.phase === "result" && g.result ? g.result : null;
    return {
      type: "state",
      rem: timed && room.deadline ? Math.max(0, room.deadline - now) : 0,
      total,
      s: {
        code: room.code,
        me: pid,
        ph: room.phase,
        imp: room.imposters,
        rds: room.rounds,
        ps: room.players.map((p) => ({
          id: p.id,
          n: p.name,
          b: p.bot ? 1 : 0,
          c: p.color,
          h: p.host ? 1 : 0,
          k: p.coins,
          on: p.bot || p.away === null ? 1 : 0,
        })),
        g: g
          ? {
              gid: g.gid,
              rd: g.round,
              tu: g.turn,
              ord: g.order,
              cl: g.clues,
              voted: Object.keys(g.votes),
              rv: g.revote ? { id: g.revote.id, c: g.revote.candidates, s: g.revote.seats } : null,
              canVote: this.canVote(pid),
              myWord: g.words[pid] ?? "",
              amImp: g.imposters.includes(pid),
              res: res
                ? {
                    ...res,
                    imposters: g.imposters,
                    // What each winner on that side is worth, before any cap.
                    rw: res.innocentsWon ? COIN_AWARDS.IMPOSTER_CAUGHT : COIN_AWARDS.IMPOSTER_ESCAPED,
                    iw: g.innocentWord,
                    mw: g.imposterWord,
                  }
                : null,
            }
          : null,
        bal: this.balances.get(pid) ?? null,
      },
    };
  }

  // ── Players ────────────────────────────────────────────────────────────

  private freeColor(): number {
    const used = new Set(this.room!.players.map((p) => p.color));
    for (let i = 0; i < COLORS; i++) if (!used.has(i)) return i;
    return this.room!.players.length % COLORS;
  }

  private player(id: string | undefined): Player | undefined {
    return this.room?.players.find((p) => p.id === id);
  }

  /** Exactly one host, and a connected one whenever anyone is connected. */
  private ensureHost() {
    const room = this.room!;
    const humans = room.players.filter((p) => !p.bot);
    const current = humans.find((p) => p.host);
    if (current && current.away === null) return;
    const next = humans.find((p) => p.away === null) ?? current ?? humans[0];
    for (const p of room.players) p.host = p === next;
  }

  private remove(id: string) {
    const room = this.room!;
    room.players = room.players.filter((p) => p.id !== id);
    room.imposters = Math.min(room.imposters, maxImposters(Math.max(room.players.length, MIN_PLAYERS)));
    this.balances.delete(id);
    this.ensureHost();
  }

  /** Anyone gone past their grace in the lobby or on the result screen loses the seat. */
  private sweepAway(now: number, graceMs: number) {
    const room = this.room!;
    for (const p of [...room.players]) {
      if (p.away !== null && now - p.away >= graceMs) this.remove(p.id);
    }
  }

  // ── Messages ───────────────────────────────────────────────────────────

  private async onMessage(pid: string, ws: WebSocket, raw: unknown) {
    if (this.sockets.get(pid) !== ws) return;
    if (typeof raw !== "string" || raw.length > 2_000) return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const room = this.room;
    const me = this.player(pid);
    if (!room || !me || !msg || typeof msg.t !== "string") return;
    const host = me.host;

    switch (msg.t) {
      case "ping":
        safeSend(ws, '{"type":"pong"}');
        return;

      case "settings": {
        if (!host || room.phase !== "lobby") return;
        const n = Math.max(room.players.length, MIN_PLAYERS);
        if (Number.isInteger(msg.imp)) room.imposters = Math.min(Math.max(1, msg.imp), maxImposters(n));
        if (Number.isInteger(msg.rds)) room.rounds = Math.min(Math.max(1, msg.rds), MAX_ROUNDS);
        break;
      }

      case "addBot": {
        if (!host || room.phase !== "lobby" || room.players.length >= MAX_PLAYERS) return;
        const used = new Set(room.players.map((p) => p.name));
        room.players.push({
          id: rid(),
          userId: null,
          name: BOT_NAMES.find((b) => !used.has(b)) ?? `Bot ${room.players.length + 1}`,
          bot: true,
          color: this.freeColor(),
          host: false,
          coins: 0,
          away: null,
        });
        break;
      }

      case "kick": {
        const target = this.player(String(msg.pid || ""));
        if (!host || room.phase !== "lobby" || !target || target.host) return;
        this.remove(target.id);
        const tws = this.sockets.get(target.id);
        if (tws) {
          this.sockets.delete(target.id);
          safeSend(tws, JSON.stringify({ type: "kicked" }));
          safeClose(tws, 4001, "You were removed from the room.");
        }
        break;
      }

      case "start":
        if (!host || (room.phase !== "lobby" && room.phase !== "result")) return;
        this.sweepAway(Date.now(), 0);
        if (room.players.length < MIN_PLAYERS) {
          this.sendTo(pid, { type: "error", message: "Need at least 3 players." });
          break;
        }
        this.startGame();
        break;

      case "lobby":
        if (!host || room.phase !== "result") return;
        room.phase = "lobby";
        room.game = null;
        room.deadline = 0;
        room.botAt = 0;
        this.sweepAway(Date.now(), 0);
        break;

      case "leave":
        this.sockets.delete(pid);
        if (this.sockets.size === 0) this.emptySince = Date.now();
        safeClose(ws, 1000, "Left the room");
        if (room.phase === "lobby" || room.phase === "result") {
          this.remove(pid);
          break;
        }
        // Mid-game the seat stays (the game needs its clues and its word) and
        // is treated like a dropped connection.
        await this.dropped(pid);
        return;

      case "clue": {
        const problem = this.acceptClue(pid, String(msg.text ?? "").slice(0, 200), false);
        if (problem) {
          this.sendTo(pid, { type: "error", message: problem });
          return;
        }
        break;
      }

      case "vote":
        if (!this.acceptVote(pid, msg.sel)) return;
        if (this.allVoted()) {
          await this.finishVote();
          return;
        }
        break;

      case "taunt": {
        const k = String(msg.k || "");
        const to = this.player(String(msg.to || ""));
        const now = Date.now();
        if (!TAUNT_KEYS.has(k) || !to || to.id === pid) return;
        if (now - (this.lastTaunt.get(pid) ?? 0) < TAUNT_GAP_MS) return;
        this.lastTaunt.set(pid, now);
        this.broadcastTaunt(k, pid, to.id);
        return;
      }

      default:
        return;
    }
    await this.commit();
  }

  private async onClose(pid: string, ws: WebSocket) {
    if (this.sockets.get(pid) !== ws) return;
    this.sockets.delete(pid);
    if (this.sockets.size === 0) this.emptySince = Date.now();
    await this.dropped(pid);
  }

  /** A player's socket is gone: keep the seat, skip their turn soon, stop waiting on their vote. */
  private async dropped(pid: string) {
    const room = this.room;
    const me = this.player(pid);
    if (!room || !me) return;
    me.away = Date.now();
    this.ensureHost();
    const g = room.game;
    if (room.phase === "describe" && g && g.order[g.turn] === pid) {
      room.deadline = Math.min(room.deadline, Date.now() + AWAY_TURN_MS);
    }
    if (room.phase === "vote" && this.allVoted()) {
      await this.finishVote();
      return;
    }
    await this.commit();
  }

  // ── The game ───────────────────────────────────────────────────────────

  private startGame() {
    const room = this.room!;
    const n = room.players.length;
    room.imposters = Math.min(room.imposters, maxImposters(n));
    let idx = Math.floor(Math.random() * WORD_PAIRS.length);
    if (idx === room.lastPair) idx = (idx + 1) % WORD_PAIRS.length;
    room.lastPair = idx;
    const [innocentWord, imposterWord] = Math.random() < 0.5 ? WORD_PAIRS[idx] : [WORD_PAIRS[idx][1], WORD_PAIRS[idx][0]];
    const ids = room.players.map((p) => p.id);
    const imposters = shuffle(ids).slice(0, room.imposters);
    const words: Record<string, string> = {};
    for (const id of ids) words[id] = imposters.includes(id) ? imposterWord : innocentWord;
    room.game = {
      gid: crypto.randomUUID(),
      imposters,
      words,
      innocentWord,
      imposterWord,
      order: shuffle(ids),
      round: 1,
      turn: 0,
      clues: [],
      votes: {},
      revote: null,
      firstCounts: null,
      result: null,
    };
    room.phase = "reveal";
    room.deadline = Date.now() + T_REVEAL;
    room.botAt = 0;
  }

  /** Start whoever's turn it is now: a bot thinks, a dropped player is skipped soon. */
  private beginTurn() {
    const room = this.room!;
    const g = room.game!;
    const now = Date.now();
    const cur = this.player(g.order[g.turn]);
    room.deadline = now + T_CLUE;
    room.botAt = 0;
    if (cur?.bot) room.botAt = now + 2_400 + Math.random() * 2_200;
    else if (!cur || cur.away !== null) room.deadline = now + AWAY_TURN_MS;
  }

  /** Take a clue, or a timeout. Returns why a clue was refused, or null. */
  private acceptClue(pid: string, text: string, timedOut: boolean): string | null {
    const room = this.room!;
    const g = room.game;
    if (room.phase !== "describe" || !g || g.order[g.turn] !== pid) return "It is not your turn.";
    if (!timedOut) {
      const problem = clueProblem(g.words[pid], text);
      if (problem) return problem;
    }
    g.clues.push({ p: pid, r: g.round, x: timedOut ? "" : text.trim(), o: timedOut ? 1 : 0 });
    g.turn++;
    if (g.turn >= g.order.length) {
      if (g.round < room.rounds) {
        g.round++;
        g.turn = 0;
        this.beginTurn();
      } else {
        this.startVote(null);
      }
    } else {
      this.beginTurn();
    }
    if (Math.random() < 0.25) this.botTaunt(null);
    return null;
  }

  private canVote(pid: string): boolean {
    const room = this.room!;
    const g = room.game;
    if (room.phase !== "vote" || !g) return false;
    if (!g.revote) return true;
    return g.revote.candidates.filter((id) => id !== pid).length >= g.revote.seats;
  }

  private startVote(revote: Revote | null) {
    const room = this.room!;
    const g = room.game!;
    room.phase = "vote";
    room.deadline = Date.now() + T_VOTE;
    room.botAt = 0;
    g.votes = {};
    g.revote = revote;
    const need = revote ? revote.seats : room.imposters;
    // Bots lean towards anyone whose word differs from their own, with plenty
    // of noise: an imposter bot suspects the innocents, and gets it wrong often.
    for (const b of room.players.filter((p) => p.bot)) {
      const pool = (revote ? revote.candidates : room.players.map((p) => p.id)).filter((id) => id !== b.id);
      g.votes[b.id] = pool
        .map((id) => ({ id, s: (g.words[id] !== g.words[b.id] ? 0.75 : 0) + Math.random() }))
        .sort((x, y) => y.s - x.s)
        .slice(0, need)
        .map((x) => x.id);
    }
  }

  private acceptVote(pid: string, sel: unknown): boolean {
    const room = this.room!;
    const g = room.game;
    if (room.phase !== "vote" || !g || g.votes[pid] || !Array.isArray(sel) || !this.canVote(pid)) return false;
    const allowed = (g.revote ? g.revote.candidates : room.players.map((p) => p.id)).filter((id) => id !== pid);
    const need = Math.min(g.revote ? g.revote.seats : room.imposters, allowed.length);
    const picks = [...new Set(sel.map(String))].filter((id) => allowed.includes(id)).slice(0, need);
    if (picks.length !== need || need === 0) return false;
    g.votes[pid] = picks;
    return true;
  }

  /** Everyone who is here and can vote has voted. Dropped players are not waited for. */
  private allVoted(): boolean {
    const room = this.room!;
    const g = room.game;
    if (room.phase !== "vote" || !g) return false;
    return room.players
      .filter((p) => (p.bot || p.away === null) && this.canVote(p.id))
      .every((p) => g.votes[p.id]);
  }

  private async finishVote(): Promise<void> {
    const room = this.room!;
    const g = room.game;
    if (room.phase !== "vote" || !g) return;
    const rv = g.revote;
    const t = tally({
      pool: rv ? rv.candidates : room.players.map((p) => p.id),
      need: rv ? rv.seats : room.imposters,
      votes: g.votes,
      revote: rv,
    });

    if (t.kind === "revote") {
      g.firstCounts = t.counts;
      this.startVote({ id: rid(), ...t.revote });
      if (this.allVoted()) return this.finishVote();
      await this.commit();
      return;
    }

    const counts: Record<string, number> = {};
    for (const p of room.players) counts[p.id] = (g.firstCounts?.[p.id] ?? 0) + (t.counts[p.id] ?? 0);
    const won = innocentsWin(g.imposters, t.out, t.tiedAgain);
    const result: Result = {
      counts,
      out: t.out,
      innocentsWon: won,
      winners: room.players.filter((p) => g.imposters.includes(p.id) !== won).map((p) => p.id),
      tiedAgain: t.tiedAgain,
      revoted: !!rv,
      settling: true,
      practice: false,
      paid: {},
      capped: [],
    };
    g.result = result;
    room.phase = "result";
    room.deadline = 0;
    room.botAt = 0;
    // The result first, so nobody waits on the database to see who won.
    await this.commit();

    await this.payout(g, result);
    result.settling = false;
    await this.commit();

    const winningBots = room.players.filter((p) => p.bot && result.winners.includes(p.id));
    this.botTaunt(winningBots.length ? winningBots : null);
  }

  /** Pay the real winners, once, under both daily caps. */
  private async payout(g: Game, result: Result) {
    const room = this.room!;
    // A seat only counts if its player gave at least one clue themselves.
    const real = room.players.filter((p) => !p.bot && p.userId && g.clues.some((c) => c.p === p.id && !c.o));
    if (real.length < IMPOSTER_MIN_PLAYERS_FOR_COINS) {
      result.practice = true;
      return;
    }
    const store = new D1Store(this.env.DB);
    for (const p of real) {
      if (!result.winners.includes(p.id)) continue;
      try {
        const wanted = awardsForImposter({ won: true, imposter: g.imposters.includes(p.id) });
        const onlineToday = await store.coinsEarnedTodayFor(p.userId!, ONLINE_REASONS).catch(() => 0);
        const byOnline = applyDailyCap(wanted, onlineToday, ONLINE_DAILY_CAP);
        const today = await store.coinsEarnedToday(p.userId!).catch(() => 0);
        const { granted } = applyDailyCap(byOnline.granted, today);
        let paid = 0;
        for (const award of granted) {
          const applied = await store.awardCoins({
            userId: p.userId!,
            reason: award.reason,
            amount: award.amount,
            description: award.description,
            referenceType: "imposter_game",
            referenceId: `imposter:${g.gid}`,
          });
          if (applied !== null) paid += award.amount;
        }
        result.paid[p.id] = paid;
        p.coins += paid;
        if (paid < totalOf(wanted)) result.capped.push(p.id);
        const balance = await store.getCoinBalance(p.userId!).catch(() => null);
        if (balance) this.balances.set(p.id, balance.balance);
      } catch (err) {
        console.error("Imposter payout failed for one player:", err);
        result.capped.push(p.id);
      }
    }
  }

  // ── Bots and taunts ────────────────────────────────────────────────────

  private botClue(bot: Player) {
    const g = this.room!.game!;
    const word = g.words[bot.id];
    const used = new Set(g.clues.map((c) => c.x));
    const options = (BOT_CLUES[word] ?? []).filter((c) => !used.has(c));
    const text = options.length ? pick(options) : "You know it when you see it";
    if (this.acceptClue(bot.id, text, false)) this.acceptClue(bot.id, "", true);
  }

  private broadcastTaunt(k: string, from: string, to: string) {
    const text = JSON.stringify({ type: "taunt", k, f: from, to });
    for (const ws of this.sockets.values()) safeSend(ws, text);
  }

  /** A bot throws a taunt, at a real player more often than not. */
  private botTaunt(prefer: Player[] | null) {
    const room = this.room;
    if (!room) return;
    const bots = room.players.filter((p) => p.bot);
    if (!bots.length) return;
    const b = prefer?.length ? pick(prefer) : pick(bots);
    const others = room.players.filter((p) => p.id !== b.id);
    const humans = others.filter((p) => !p.bot);
    const pool = humans.length && Math.random() < 0.7 ? humans : others;
    if (!pool.length) return;
    const target = pick(pool);
    const k = pick([...TAUNT_KEYS]);
    setTimeout(() => this.broadcastTaunt(k, b.id, target.id), 800 + Math.random() * 900);
  }

  // ── The clock ──────────────────────────────────────────────────────────

  async alarm() {
    await this.load();
    const room = this.room;
    if (!room) return;
    const now = Date.now();

    if (this.sockets.size === 0 && now - (this.emptySince ?? now) >= EMPTY_KEEP_MS) {
      await this.state.storage.deleteAll();
      this.room = null;
      return;
    }

    if (room.phase === "lobby" || room.phase === "result") this.sweepAway(now, LOBBY_GRACE_MS);

    const g = room.game;
    if (room.phase === "reveal" && now >= room.deadline) {
      room.phase = "describe";
      this.beginTurn();
    } else if (room.phase === "describe" && g) {
      const cur = this.player(g.order[g.turn]);
      if (cur?.bot && room.botAt && now >= room.botAt) this.botClue(cur);
      else if (now >= room.deadline) this.acceptClue(g.order[g.turn], "", true);
    } else if (room.phase === "vote" && now >= room.deadline) {
      await this.finishVote();
      return;
    }
    await this.commit();
  }
}

function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

function safeSend(ws: WebSocket, msg: string) {
  try {
    ws.send(msg);
  } catch {
    /* the socket is already gone */
  }
}

function safeClose(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    /* already closed */
  }
}
