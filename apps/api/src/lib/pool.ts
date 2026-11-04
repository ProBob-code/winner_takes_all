/**
 * The Worker's side of online 8-ball: authenticate a socket and hand it to
 * the right Durable Object, and read a table's verdict back for the claim.
 *
 * Sockets are routed here before the Hono app sees them. Its middleware
 * rebuilds responses to add headers, and a rebuilt 101 loses the socket.
 *
 * Authentication is the session cookie the browser already holds for this
 * API's domain; a browser cannot put an Authorization header on a WebSocket.
 * Because a cookie rides along on any page's request, the Origin is checked
 * against the same allow-list CORS uses, or another site could open a socket
 * as the visitor.
 */

import type { Env } from "../types";
import { getAccessSession, getRefreshSession, parseCookies } from "./kv-sessions";
import { D1Store } from "./d1-store";
import { onlineTrack } from "./trophies";
import type { PoolPlayer } from "../durable-objects/pool-rooms";

const TABLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Accepts the socket only to close it with a reason the page can read. */
function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

async function userFrom(request: Request, env: Env): Promise<{ id: string; name: string } | null> {
  const kv = env.SESSIONS;
  if (!kv) return null;
  const cookies = parseCookies(request.headers.get("Cookie") ?? undefined);
  let userId: string | null = null;
  if (cookies["wta_access_token"]) userId = await getAccessSession(kv, cookies["wta_access_token"]);
  if (!userId && cookies["wta_refresh_token"]) userId = await getRefreshSession(kv, cookies["wta_refresh_token"]);
  if (!userId) return null;
  const user: any = await new D1Store(env.DB).getUserById(userId);
  return user ? { id: user.id, name: String(user.name || "Player") } : null;
}

export function isPoolSocket(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/pool/") && request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

export async function handlePoolSocket(request: Request, env: Env, allowed: string[]): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (!origin || !allowed.includes(origin)) return refuse(4403, "Origin not allowed");

  const user = await userFrom(request, env).catch(() => null);
  if (!user) return refuse(4401, "Sign in to play online");

  const store = new D1Store(env.DB);
  const trophies = (await store.trophiesOn(onlineTrack("8BALL"), [user.id]).catch(() => new Map())).get(user.id) ?? 0;
  const player: PoolPlayer = { userId: user.id, name: user.name.slice(0, 32), trophies };

  const url = new URL(request.url);
  let name: string;
  let path: string;
  if (url.pathname === "/api/pool/lobby") {
    name = "lobby";
    path = "/lobby";
  } else {
    const id = decodeURIComponent(url.pathname.slice("/api/pool/table/".length));
    if (!url.pathname.startsWith("/api/pool/table/") || !TABLE_ID.test(id)) return refuse(4404, "No such table");
    name = `table:${id}`;
    path = "/join";
  }

  const headers = new Headers(request.headers);
  headers.set("x-pool-user", JSON.stringify(player));
  const stub = env.POOL_ROOMS.get(env.POOL_ROOMS.idFromName(name));
  return stub.fetch(`https://pool${path}`, { method: "GET", headers });
}

export type PoolVerdict = {
  ok: boolean;
  tableId: string;
  status: "playing" | "finished" | "disputed" | "abandoned";
  winnerSeat: number | null;
  reason: string | null;
  players: PoolPlayer[];
  shots: number;
  seconds: number;
};

export async function poolVerdict(env: Env, tableId: string): Promise<PoolVerdict | null> {
  if (!TABLE_ID.test(tableId)) return null;
  const stub = env.POOL_ROOMS.get(env.POOL_ROOMS.idFromName(`table:${tableId}`));
  const res = await stub.fetch("https://pool/verdict");
  if (!res.ok) return null;
  const body: any = await res.json().catch(() => null);
  return body?.ok ? (body as PoolVerdict) : null;
}
