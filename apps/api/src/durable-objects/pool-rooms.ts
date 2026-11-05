/**
 * Online 8-ball: matchmaking and the table two real players share.
 *
 * One class, two roles, addressed by name:
 *   lobby            the queue. Pairs whoever has been waiting longest with
 *                    the next person to arrive, opens a table for them and
 *                    tells both where it is.
 *   table:<uuid>     one game. Relays aim, shots and the settled table
 *                    between the two seats, keeps the latest settled table so
 *                    a player who drops can come back to it, and decides the
 *                    result.
 *
 * WHO WON
 * Both screens run the same physics and the shooter's settled table is the
 * reference, so both should reach the same result, and each reports it. The
 * table settles when:
 *   - both reports agree, or
 *   - a player reports their opponent as the winner (a concession), or
 *   - a player resigns, or
 *   - a player is gone for GRACE_MS and does not come back.
 * Reports that disagree are recorded as disputed and pay nothing. The API
 * reads the verdict from here (GET /verdict) before it pays coins or moves
 * trophies, so a result is never taken from one player's word alone.
 *
 * This does not make the game cheat-proof: the physics runs in the browsers,
 * and a modified client could still lie about a shot. Like every browser
 * award, the coins here are small and capped for exactly that reason.
 *
 * Sockets are plain accepted WebSockets (not hibernatable): a table lives for
 * one game, and the lobby only holds people who are actively waiting.
 */

import type { Env } from "../types";

export type PoolPlayer = { userId: string; name: string; trophies: number };

type TableMeta = {
  tableId: string;
  players: [PoolPlayer, PoolPlayer];
  seed: number;
  createdAt: number;
  status: "playing" | "finished" | "disputed" | "abandoned";
  winnerSeat: number | null;
  reason: string | null;
  finishedAt: number | null;
  shots: number;
  reports: [number | null, number | null];
  awayAt: [number | null, number | null];
  firstReportAt: number | null;
  snapshot: unknown;
};

/** How long a dropped player has to come back before the game is theirs to lose. */
const GRACE_MS = 45_000;
/** How long a lone report waits for the other screen's. */
const REPORT_WAIT_MS = 30_000;
/** Before this, a table never had both players sit down; drop it. */
const NO_SHOW_MS = 60_000;
/** A settled table is kept this long for the claims, then wiped. */
const KEEP_MS = 6 * 60 * 60 * 1000;
/** A player counts as online this long after their last heartbeat. */
const PRESENCE_MS = 70_000;
/** A table still open after this is no longer counted as being played. */
const TABLE_MAX_MS = 45 * 60 * 1000;

const RELAYED = new Set(["aim", "place"]);

export class PoolRooms {
  private state: DurableObjectState;
  private env: Env;

  // Lobby role.
  private waiting: Array<{ ws: WebSocket; player: PoolPlayer; since: number }> = [];
  /** Who has had the game open lately: userId -> last heartbeat. */
  private seen = new Map<string, number>();
  /** Tables this lobby opened that have not finished: tableId -> opened at. */
  private open = new Map<string, number>();

  // Table role.
  private meta: TableMeta | null = null;
  private sockets: [WebSocket | null, WebSocket | null] = [null, null];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/lobby":
        return this.lobby(request);
      case "/init":
        return this.init(request);
      case "/join":
        return this.join(request);
      case "/verdict":
        return this.verdict();
      case "/presence":
        return this.presence(request);
      case "/table-done":
        return this.tableDone(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // ── Lobby ──────────────────────────────────────────────────────────────

  private player(request: Request): PoolPlayer | null {
    try {
      const p = JSON.parse(request.headers.get("x-pool-user") || "null");
      if (p && typeof p.userId === "string" && typeof p.name === "string") {
        return { userId: p.userId, name: p.name.slice(0, 32), trophies: Number(p.trophies) || 0 };
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  private async lobby(request: Request): Promise<Response> {
    const me = this.player(request);
    if (!me || request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    // One place in the queue per person: a second tab replaces the first.
    this.waiting = this.waiting.filter((w) => {
      if (w.player.userId !== me.userId) return true;
      safeClose(w.ws, 4000, "Replaced by a newer search");
      return false;
    });

    const leave = () => {
      this.waiting = this.waiting.filter((w) => w.ws !== server);
      this.broadcastWaiting();
    };
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);

    // Anyone already waiting who is not this person?
    const idx = this.waiting.findIndex((w) => w.player.userId !== me.userId);
    if (idx >= 0) {
      const them = this.waiting.splice(idx, 1)[0];
      await this.pairUp(them, { ws: server, player: me, since: Date.now() });
    } else {
      this.waiting.push({ ws: server, player: me, since: Date.now() });
      this.broadcastWaiting();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private counts() {
    const now = Date.now();
    for (const [id, t] of this.seen) if (now - t > PRESENCE_MS) this.seen.delete(id);
    for (const [id, t] of this.open) if (now - t > TABLE_MAX_MS) this.open.delete(id);
    const searching = this.waiting.length;
    const playing = this.open.size * 2;
    // Everyone queueing or at a table is online, heartbeat or not.
    const online = Math.max(this.seen.size, searching + playing);
    return { online, searching, playing };
  }

  private async presence(request: Request): Promise<Response> {
    const body: any = await request.json().catch(() => null);
    if (body && typeof body.userId === "string") this.seen.set(body.userId, Date.now());
    return Response.json(this.counts());
  }

  private async tableDone(request: Request): Promise<Response> {
    const body: any = await request.json().catch(() => null);
    if (body && typeof body.tableId === "string") this.open.delete(body.tableId);
    return Response.json({ ok: true });
  }

  private broadcastWaiting() {
    const c = this.counts();
    const msg = JSON.stringify({ type: "waiting", count: c.searching, online: c.online, playing: c.playing });
    for (const w of this.waiting) safeSend(w.ws, msg);
  }

  private async pairUp(
    a: { ws: WebSocket; player: PoolPlayer; since?: number },
    b: { ws: WebSocket; player: PoolPlayer; since?: number }
  ) {
    const tableId = crypto.randomUUID();
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    // Who breaks is a coin toss.
    const seats: [typeof a, typeof b] = Math.random() < 0.5 ? [a, b] : [b, a];
    const stub = this.env.POOL_ROOMS.get(this.env.POOL_ROOMS.idFromName(`table:${tableId}`));
    const res = await stub.fetch("https://pool/init", {
      method: "POST",
      body: JSON.stringify({ tableId, seed, players: [seats[0].player, seats[1].player] }),
    });
    if (!res.ok) {
      for (const s of seats) safeSend(s.ws, JSON.stringify({ type: "error", message: "Could not open a table. Try again." }));
      return;
    }
    this.open.set(tableId, Date.now());
    for (const s of seats) this.seen.set(s.player.userId, Date.now());
    seats.forEach((s, seat) => {
      const other = seats[1 - seat].player;
      safeSend(
        s.ws,
        JSON.stringify({
          type: "matched",
          tableId,
          seat,
          opponent: { name: other.name, trophies: other.trophies },
        })
      );
    });
  }

  // ── Table ──────────────────────────────────────────────────────────────

  private async load(): Promise<TableMeta | null> {
    if (!this.meta) this.meta = (await this.state.storage.get<TableMeta>("meta")) ?? null;
    return this.meta;
  }

  private async persist() {
    if (this.meta) await this.state.storage.put("meta", this.meta);
  }

  private async init(request: Request): Promise<Response> {
    const body: any = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.players) || body.players.length !== 2) {
      return new Response("Bad table", { status: 400 });
    }
    this.meta = {
      tableId: String(body.tableId),
      players: [body.players[0], body.players[1]],
      seed: Number(body.seed) >>> 0,
      createdAt: Date.now(),
      status: "playing",
      winnerSeat: null,
      reason: null,
      finishedAt: null,
      shots: 0,
      reports: [null, null],
      awayAt: [null, null],
      firstReportAt: null,
      snapshot: null,
    };
    await this.persist();
    await this.state.storage.setAlarm(Date.now() + NO_SHOW_MS);
    return new Response("ok");
  }

  private async join(request: Request): Promise<Response> {
    const me = this.player(request);
    const meta = await this.load();
    if (!me || !meta || request.headers.get("Upgrade") !== "websocket") {
      return new Response("No such table", { status: 404 });
    }
    const seat = meta.players.findIndex((p) => p.userId === me.userId);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    if (seat < 0) {
      safeSend(server, JSON.stringify({ type: "error", message: "This is not your table." }));
      safeClose(server, 4403, "Not your table");
      return new Response(null, { status: 101, webSocket: client });
    }

    const previous = this.sockets[seat];
    if (previous) safeClose(previous, 4000, "Replaced by a newer connection");
    this.sockets[seat] = server;
    const wasAway = meta.awayAt[seat] !== null;
    meta.awayAt[seat] = null;
    await this.persist();

    server.addEventListener("message", (event) => {
      void this.onMessage(seat, server, event.data);
    });
    const gone = () => {
      void this.onClose(seat, server);
    };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);

    safeSend(
      server,
      JSON.stringify({
        type: "hello",
        seat,
        seed: meta.seed,
        players: meta.players.map((p) => ({ name: p.name, trophies: p.trophies })),
        snapshot: meta.snapshot,
        opponentHere: !!this.sockets[1 - seat],
        finished: meta.status !== "playing",
        winnerSeat: meta.winnerSeat,
      })
    );
    this.toOther(seat, { type: wasAway ? "opponent_back" : "opponent_joined" });

    return new Response(null, { status: 101, webSocket: client });
  }

  private toOther(seat: number, msg: unknown) {
    const ws = this.sockets[1 - seat];
    if (ws) safeSend(ws, typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  private broadcast(msg: unknown) {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets) if (ws) safeSend(ws, text);
  }

  private async onMessage(seat: number, ws: WebSocket, raw: unknown) {
    if (this.sockets[seat] !== ws) return;
    if (typeof raw !== "string" || raw.length > 16_000) return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const meta = await this.load();
    if (!meta || meta.status !== "playing") return;

    if (RELAYED.has(msg.type)) {
      this.toOther(seat, raw);
      return;
    }

    switch (msg.type) {
      // Passed on first and saved after: the other screen is replaying this
      // shot live, so a storage write must never sit between the two.
      case "shot":
        this.toOther(seat, raw);
        meta.shots = Math.max(meta.shots + 1, Number(msg.n) || 0);
        await this.persist();
        return;

      case "settled":
        this.toOther(seat, raw);
        meta.snapshot = msg.snap ?? null;
        await this.persist();
        return;

      case "resign":
        await this.settle(1 - seat, `${meta.players[seat].name} resigned`);
        return;

      case "result": {
        const w = Number(msg.winnerSeat);
        if (w !== 0 && w !== 1) return;
        meta.reports[seat] = w;
        // Saying the other player won is a concession, and needs no second opinion.
        if (w !== seat) {
          await this.settle(w, msg.reason ? String(msg.reason).slice(0, 80) : "");
          return;
        }
        const other = meta.reports[1 - seat];
        if (other === null) {
          meta.firstReportAt = meta.firstReportAt ?? Date.now();
          await this.persist();
          await this.state.storage.setAlarm(Date.now() + REPORT_WAIT_MS);
          return;
        }
        if (other === w) await this.settle(w, msg.reason ? String(msg.reason).slice(0, 80) : "");
        else await this.dispute();
        return;
      }
    }
  }

  private async onClose(seat: number, ws: WebSocket) {
    if (this.sockets[seat] !== ws) return;
    this.sockets[seat] = null;
    const meta = await this.load();
    if (!meta || meta.status !== "playing") return;
    meta.awayAt[seat] = Date.now();
    await this.persist();
    this.toOther(seat, { type: "opponent_left", grace: Math.round(GRACE_MS / 1000) });
    await this.state.storage.setAlarm(Date.now() + GRACE_MS + 500);
  }

  async alarm() {
    const meta = await this.load();
    if (!meta) return;
    const now = Date.now();

    if (meta.status !== "playing") {
      if (meta.finishedAt && now - meta.finishedAt >= KEEP_MS) {
        await this.state.storage.deleteAll();
        this.meta = null;
      } else {
        await this.state.storage.setAlarm((meta.finishedAt ?? now) + KEEP_MS);
      }
      return;
    }

    // Nobody (or only one player) ever sat down.
    const neverStarted = meta.shots === 0 && now - meta.createdAt >= NO_SHOW_MS;
    const here = [!!this.sockets[0], !!this.sockets[1]];
    if (neverStarted && !(here[0] && here[1])) {
      meta.status = "abandoned";
      meta.finishedAt = now;
      meta.reason = "The game never started";
      await this.persist();
      this.broadcast({ type: "error", message: "Your opponent never sat down. Find another game." });
      await this.state.storage.setAlarm(now + KEEP_MS);
      await this.tellLobbyDone();
      return;
    }

    // A player who left and did not come back loses.
    const away = meta.awayAt.map((t) => t !== null && now - t >= GRACE_MS);
    if (away[0] && away[1]) {
      meta.status = "abandoned";
      meta.finishedAt = now;
      meta.reason = "Both players left";
      await this.persist();
      await this.state.storage.setAlarm(now + KEEP_MS);
      await this.tellLobbyDone();
      return;
    }
    if (away[0] || away[1]) {
      const leaver = away[0] ? 0 : 1;
      await this.settle(1 - leaver, `${meta.players[leaver].name} left the table`);
      return;
    }

    // One screen reported a win and the other never did.
    if (meta.firstReportAt && now - meta.firstReportAt >= REPORT_WAIT_MS) {
      const claimed = meta.reports[0] ?? meta.reports[1];
      const silent = meta.reports[0] === null ? 0 : 1;
      if (claimed !== null && !this.sockets[silent]) await this.settle(claimed, "");
      else await this.dispute();
      return;
    }

    // Something is still pending: look again when it could have changed.
    const next = Math.min(
      ...[
        ...meta.awayAt.filter((t): t is number => t !== null).map((t) => t + GRACE_MS + 500),
        meta.firstReportAt ? meta.firstReportAt + REPORT_WAIT_MS : Infinity,
      ]
    );
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
  }

  private async settle(winnerSeat: number, reason: string) {
    const meta = await this.load();
    if (!meta || meta.status !== "playing") return;
    meta.status = "finished";
    meta.winnerSeat = winnerSeat;
    meta.reason = reason || null;
    meta.finishedAt = Date.now();
    await this.persist();
    this.broadcast({ type: "final", winnerSeat, reason });
    await this.state.storage.setAlarm(meta.finishedAt + KEEP_MS);
    await this.tellLobbyDone();
  }

  private async dispute() {
    const meta = await this.load();
    if (!meta || meta.status !== "playing") return;
    meta.status = "disputed";
    meta.finishedAt = Date.now();
    await this.persist();
    this.broadcast({ type: "error", message: "The two screens disagreed about the result, so this game does not count." });
    await this.state.storage.setAlarm(meta.finishedAt + KEEP_MS);
    await this.tellLobbyDone();
  }

  /** The lobby's "playing" count; best effort, it also expires tables itself. */
  private async tellLobbyDone() {
    const id = this.meta?.tableId;
    if (!id) return;
    try {
      const lobby = this.env.POOL_ROOMS.get(this.env.POOL_ROOMS.idFromName("lobby"));
      await lobby.fetch("https://pool/table-done", { method: "POST", body: JSON.stringify({ tableId: id }) });
    } catch {
      /* the lobby forgets it after TABLE_MAX_MS anyway */
    }
  }

  private async verdict(): Promise<Response> {
    const meta = await this.load();
    if (!meta) return Response.json({ ok: false }, { status: 404 });
    return Response.json({
      ok: true,
      tableId: meta.tableId,
      status: meta.status,
      winnerSeat: meta.winnerSeat,
      reason: meta.reason,
      players: meta.players,
      shots: meta.shots,
      seconds: Math.round(((meta.finishedAt ?? Date.now()) - meta.createdAt) / 1000),
    });
  }
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
