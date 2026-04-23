/**
 * Game Room Durable Object — full port of room_manager.py + room_do.py.
 * Handles WebSocket connections, turn management, lifelines, scoring.
 */

import { assignLifelines, resolveLifeline, type LifelineType } from "../lib/lifelines";

interface PlayerState {
  userId: string;
  userName: string;
  score: number;
  lifelines: LifelineType[];
  lifelinesUsed: LifelineType[];
  connected: boolean;
}

interface RoomState {
  matchId: string;
  tournamentId: string;
  player1: PlayerState | null;
  player2: PlayerState | null;
  status: "waiting" | "ready" | "playing" | "finished";
  currentTurn: string | null;
}

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private room: RoomState;
  private sockets: Map<string, WebSocket>; // userId → server-side socket

  constructor(state: DurableObjectState, _env: any) {
    this.state = state;
    this.sockets = new Map();
    this.room = {
      matchId: "", tournamentId: "",
      player1: null, player2: null,
      status: "waiting", currentTurn: null,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Extract match info from query params
    const matchId = url.searchParams.get("matchId") ?? "";
    const tournamentId = url.searchParams.get("tournamentId") ?? "";
    const userId = url.searchParams.get("userId") ?? "";
    const userName = url.searchParams.get("userName") ?? "";

    if (!matchId || !userId) {
      return new Response("Missing matchId or userId", { status: 400 });
    }

    // Set room IDs on first connection
    if (!this.room.matchId) {
      this.room.matchId = matchId;
      this.room.tournamentId = tournamentId;
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    // Join the room
    const lifelines = assignLifelines(2);
    const player: PlayerState = {
      userId, userName, score: 0,
      lifelines, lifelinesUsed: [], connected: true,
    };

    if (!this.room.player1 || this.room.player1.userId === userId) {
      this.room.player1 = player;
    } else if (!this.room.player2 || this.room.player2.userId === userId) {
      this.room.player2 = player;
    } else {
      server.close(4009, "Room is full");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.sockets.set(userId, server);

    // Send connected confirmation to the joining player
    server.send(JSON.stringify({
      type: "connected", matchId, userId, userName,
    }));

    // Broadcast player joined
    this.broadcast({
      type: "player_joined", userId, userName,
      roomStatus: this.room.status,
      isFull: !!(this.room.player1 && this.room.player2),
    });

    // If room is full, mark as ready
    if (this.room.player1 && this.room.player2 && this.room.status === "waiting") {
      this.room.status = "ready";
      this.room.currentTurn = this.room.player1.userId;
      this.broadcast({
        type: "room_ready",
        player1: {
          id: this.room.player1.userId,
          name: this.room.player1.userName,
          lifelines: this.room.player1.lifelines,
        },
        player2: {
          id: this.room.player2.userId,
          name: this.room.player2.userName,
          lifelines: this.room.player2.lifelines,
        },
        currentTurn: this.room.currentTurn,
      });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      const userId = this.findUserBySocket(ws);
      if (!userId) return;

      switch (data.type) {
        case "start_game": this.handleStartGame(); break;
        case "shot_made": this.handleShot(userId, data); break;
        case "ball_potted": this.handleBallPotted(userId, data); break;
        case "turn_end": this.handleTurnEnd(userId); break;
        case "use_lifeline": this.handleLifeline(userId, data); break;
        case "game_over": this.handleGameOver(); break;
        case "chat": this.handleChat(userId, data); break;
      }
    } catch (e) {
      console.error("WebSocket message error:", e);
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const userId = this.findUserBySocket(ws);
    if (!userId) return;

    const player = this.getPlayer(userId);
    if (player) player.connected = false;
    this.sockets.delete(userId);

    const opponent = this.getOpponent(userId);
    if (opponent?.connected) {
      this.sendTo(opponent.userId, { type: "opponent_disconnected", userId });
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
  }

  // ── Game logic ──

  private handleStartGame(): void {
    if (this.room.status === "ready") {
      this.room.status = "playing";
      this.broadcast({
        type: "game_started",
        currentTurn: this.room.currentTurn,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleShot(userId: string, data: any): void {
    const opponent = this.getOpponent(userId);
    if (opponent?.connected) {
      this.sendTo(opponent.userId, {
        type: "opponent_shot", shotData: data.shotData ?? {}, userId,
      });
    }
  }

  private handleBallPotted(userId: string, data: any): void {
    const player = this.getPlayer(userId);
    if (!player) return;

    const ballId = data.ballId ?? 0;
    let points = ballId === 8 ? 25 : 10;
    if (player.lifelinesUsed.includes("double_or_nothing")) points *= 2;
    player.score += points;

    this.broadcast({
      type: "score_update", userId, ballId, pointsEarned: points,
      player1Score: this.room.player1?.score ?? 0,
      player2Score: this.room.player2?.score ?? 0,
    });
  }

  private handleTurnEnd(userId: string): void {
    const { player1, player2 } = this.room;
    if (player1 && player2) {
      this.room.currentTurn =
        this.room.currentTurn === player1.userId ? player2.userId : player1.userId;
      this.broadcast({
        type: "turn_change", currentTurn: this.room.currentTurn,
        player1Score: player1.score, player2Score: player2.score,
      });
    }
  }

  private handleLifeline(userId: string, data: any): void {
    const player = this.getPlayer(userId);
    if (!player) return;

    const lifelineType = data.lifelineType as LifelineType;
    if (!player.lifelines.includes(lifelineType)) {
      this.sendTo(userId, { type: "error", message: "You don't have this lifeline!" });
      return;
    }

    player.lifelines = player.lifelines.filter(l => l !== lifelineType);
    player.lifelinesUsed.push(lifelineType);

    const effect = resolveLifeline(lifelineType);
    player.score += effect.scoreModifier;

    this.broadcast({
      type: "lifeline_activated", userId, effect,
      player1Score: this.room.player1?.score ?? 0,
      player2Score: this.room.player2?.score ?? 0,
    });

    if (effect.turnEffect === "lose_turn") {
      this.handleTurnEnd(userId);
    }
  }

  private handleGameOver(): void {
    this.room.status = "finished";
    this.broadcast({
      type: "game_finished",
      player1Score: this.room.player1?.score ?? 0,
      player2Score: this.room.player2?.score ?? 0,
      player1Lifelines: this.room.player1?.lifelinesUsed ?? [],
      player2Lifelines: this.room.player2?.lifelinesUsed ?? [],
    });
  }

  private handleChat(userId: string, data: any): void {
    const player = this.getPlayer(userId);
    if (player) {
      this.broadcast({
        type: "chat", userId, userName: player.userName,
        text: String(data.text ?? "").slice(0, 200),
      });
    }
  }

  // ── Helpers ──

  private getPlayer(userId: string): PlayerState | null {
    if (this.room.player1?.userId === userId) return this.room.player1;
    if (this.room.player2?.userId === userId) return this.room.player2;
    return null;
  }

  private getOpponent(userId: string): PlayerState | null {
    if (this.room.player1?.userId === userId) return this.room.player2;
    if (this.room.player2?.userId === userId) return this.room.player1;
    return null;
  }

  private findUserBySocket(ws: WebSocket): string | null {
    for (const [userId, socket] of this.sockets) {
      if (socket === ws) return userId;
    }
    return null;
  }

  private broadcast(msg: any): void {
    const data = JSON.stringify(msg);
    for (const [userId, ws] of this.sockets) {
      const player = this.getPlayer(userId);
      if (player?.connected) {
        try { ws.send(data); } catch { player.connected = false; }
      }
    }
  }

  private sendTo(userId: string, msg: any): void {
    const ws = this.sockets.get(userId);
    if (ws) {
      try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }
  }
}
