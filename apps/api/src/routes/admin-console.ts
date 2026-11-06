/**
 * The admin console's own routes: stats, access, AdSense and the artifact manager.
 *
 * Access is decided in the auth middleware (lib/admin-access.ts): the owner
 * named by ADMIN_OWNER_EMAIL, or someone the owner granted, and only on a
 * session signed in with Google. Granting and revoking is the owner's alone.
 * Every change made here is written to admin_audit.
 */

import type { Context, Hono } from "hono";
import type { AppContext } from "../types";
import { requireAdmin } from "../middleware/auth";
import { canManageAdmins, isOwnerEmail, ownerEmailFrom } from "../lib/admin-access";
import { platformStats, levelStats, revenueStats } from "../lib/admin-stats";
import { createId } from "../lib/crypto";
import { ensureEngineSchema } from "../lib/engine-schema";
import { CATALOGUE, COLLECTION_POINTS, itemById, isForSale, priceOf } from "../lib/shop";

type C = Context<AppContext>;

function deny(c: C) {
  const decision = c.get("admin");
  const message =
    decision?.reason === "needs-google"
      ? "Admin access needs a Google sign-in. Sign out and sign in with Google."
      : "Admin access required";
  return c.json({ ok: false, message, reason: decision?.reason ?? "signed-out" }, 403);
}

function ownerOnly(c: C) {
  return c.json({ ok: false, message: "Only the owner can do that." }, 403);
}

async function body(c: C): Promise<any> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

async function audit(c: C, action: string, target: string | null, detail?: unknown) {
  const actor = c.get("user");
  if (!actor) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO admin_audit (id, actor_id, actor_email, action, target, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        createId("audit"),
        actor.id,
        actor.email,
        action,
        target,
        detail === undefined ? null : JSON.stringify(detail),
        new Date().toISOString()
      )
      .run();
  } catch (err) {
    console.warn("Could not write the admin audit:", err);
  }
}

function clampDays(raw: string | undefined): number {
  const n = Math.floor(Number(raw ?? 30));
  if (!Number.isFinite(n)) return 30;
  return Math.min(730, Math.max(1, n));
}

async function findUser(c: C, b: { userId?: unknown; email?: unknown }) {
  if (typeof b.userId === "string" && b.userId) {
    return c.env.DB.prepare(`SELECT id, name, email, role FROM users WHERE id = ?`).bind(b.userId).first<any>();
  }
  if (typeof b.email === "string" && b.email.includes("@")) {
    return c.env.DB.prepare(`SELECT id, name, email, role FROM users WHERE LOWER(email) = ?`)
      .bind(b.email.trim().toLowerCase())
      .first<any>();
  }
  return null;
}

// ── AdSense settings ──

export interface AdsenseSettings {
  enabled: boolean;
  /** The publisher id, "ca-pub-" and 16 digits. */
  client: string;
  /** Auto ads: Google places them. Off means only the named slots show. */
  autoAds: boolean;
  /** Ad unit slot ids by placement. */
  slots: Record<string, string>;
  /** Pages ads never show on, as path prefixes. */
  excludePaths: string[];
}

const DEFAULT_ADSENSE: AdsenseSettings = {
  enabled: false,
  client: "",
  autoAds: true,
  slots: {},
  // Never beside a live score, a payment or this console.
  excludePaths: ["/admin", "/wallet", "/run", "/broadcast", "/display", "/match", "/arena"],
};

/** Where a placed unit can go: one AdSlot per page, in that page's layout. */
export const ADSENSE_PLACEMENTS = ["games", "leaderboard", "tournaments", "playbook"] as const;

async function readAdsense(db: D1Database): Promise<AdsenseSettings> {
  try {
    const row = await db.prepare(`SELECT value FROM platform_settings WHERE key = 'adsense'`).first<any>();
    if (!row) return { ...DEFAULT_ADSENSE };
    return { ...DEFAULT_ADSENSE, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_ADSENSE };
  }
}

function cleanAdsense(input: any, current: AdsenseSettings): AdsenseSettings | string {
  const next: AdsenseSettings = { ...current };
  if (typeof input.enabled === "boolean") next.enabled = input.enabled;
  if (typeof input.autoAds === "boolean") next.autoAds = input.autoAds;
  if (typeof input.client === "string") {
    const client = input.client.trim();
    if (client && !/^ca-pub-\d{10,20}$/.test(client)) return "The publisher id looks like ca-pub-1234567890123456.";
    next.client = client;
  }
  if (input.slots && typeof input.slots === "object") {
    const slots: Record<string, string> = {};
    for (const place of ADSENSE_PLACEMENTS) {
      const v = String(input.slots[place] ?? "").trim();
      if (v && !/^\d{6,20}$/.test(v)) return `The ${place} slot id should be digits only.`;
      if (v) slots[place] = v;
    }
    next.slots = slots;
  }
  if (Array.isArray(input.excludePaths)) {
    next.excludePaths = input.excludePaths
      .map((p: unknown) => String(p).trim())
      .filter((p: string) => p.startsWith("/") && p.length < 80)
      .slice(0, 30);
  }
  if (next.enabled && !next.client) return "Add the publisher id before switching ads on.";
  return next;
}

export function registerAdminConsole(app: Hono<AppContext>) {
  /** Who am I to the console. Never 403s: the locked screen reads it. */
  app.get("/api/admin/me", async (c) => {
    const user = c.get("user");
    const decision = c.get("admin");
    return c.json({
      ok: true,
      signedIn: !!user,
      via: c.get("authVia") ?? null,
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
      isAdmin: !!decision?.isAdmin,
      isOwner: !!decision?.isOwner && !!decision?.isAdmin,
      reason: user ? decision?.reason ?? "not-eligible" : "signed-out",
      ownerConfigured: !!ownerEmailFrom(c.env.ADMIN_OWNER_EMAIL),
    });
  });

  app.get("/api/admin/stats", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    return c.json({ ok: true, ...(await platformStats(c.env.DB, clampDays(c.req.query("days")))) });
  });

  app.get("/api/admin/levels", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    return c.json({ ok: true, ...(await levelStats(c.env.DB)) });
  });

  app.get("/api/admin/revenue", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    return c.json({ ok: true, ...(await revenueStats(c.env.DB, clampDays(c.req.query("days")))) });
  });

  // ── Access: one owner, and whoever the owner lets in ──

  app.get("/api/admin/access", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const ownerEmail = ownerEmailFrom(c.env.ADMIN_OWNER_EMAIL);
    const [grants, auditRows, staleAdmins, owner] = await Promise.all([
      c.env.DB.prepare(
        `SELECT g.user_id, g.note, g.granted_at, u.name, u.email,
                (SELECT name FROM users WHERE id = g.granted_by) AS granted_by_name,
                (SELECT MAX(created_at) FROM login_events l WHERE l.user_id = g.user_id) AS last_login
         FROM admin_grants g LEFT JOIN users u ON u.id = g.user_id ORDER BY g.granted_at DESC`
      ).all<any>().then((r) => r.results ?? []).catch(() => []),
      c.env.DB.prepare(`SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 150`)
        .all<any>().then((r) => r.results ?? []).catch(() => []),
      // Accounts marked admin in the old way, with no grant: locked out now.
      c.env.DB.prepare(
        `SELECT id, name, email FROM users u WHERE role = 'admin'
         AND NOT EXISTS (SELECT 1 FROM admin_grants g WHERE g.user_id = u.id)`
      ).all<any>().then((r) => r.results ?? []).catch(() => []),
      ownerEmail
        ? c.env.DB.prepare(`SELECT id, name, email FROM users WHERE LOWER(email) = ?`).bind(ownerEmail).first<any>().catch(() => null)
        : Promise.resolve(null),
    ]);
    return c.json({
      ok: true,
      canManage: canManageAdmins(c.get("admin")!),
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      grants: grants.map((g: any) => ({
        userId: g.user_id,
        name: g.name,
        email: g.email,
        note: g.note,
        grantedAt: g.granted_at,
        grantedBy: g.granted_by_name,
        lastLogin: g.last_login,
      })),
      lockedOut: staleAdmins
        .filter((u: any) => !isOwnerEmail(u.email, ownerEmail))
        .map((u: any) => ({ id: u.id, name: u.name, email: u.email })),
      audit: auditRows.map((a: any) => ({
        id: a.id,
        actor: a.actor_email,
        action: a.action,
        target: a.target,
        detail: a.detail ? safeJson(a.detail) : null,
        at: a.created_at,
      })),
    });
  });

  app.post("/api/admin/access/grant", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    if (!canManageAdmins(c.get("admin")!)) return ownerOnly(c);
    const b = await body(c);
    const target = await findUser(c, b);
    if (!target) {
      return c.json({ ok: false, message: "No account with that email. They need to sign up (with Google) first." }, 404);
    }
    if (isOwnerEmail(target.email, ownerEmailFrom(c.env.ADMIN_OWNER_EMAIL))) {
      return c.json({ ok: false, message: "That is the owner's account; it is always admin." }, 400);
    }
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : null;
    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO admin_grants (user_id, granted_by, note, granted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET note = excluded.note`
      ).bind(target.id, c.get("user")!.id, note, now),
      c.env.DB.prepare(`UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`).bind(now, target.id),
    ]);
    await audit(c, "admin.grant", target.email, { note });
    return c.json({ ok: true, message: `${target.name} is now an admin. They must sign in with Google to use it.` });
  });

  app.post("/api/admin/access/revoke", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    if (!canManageAdmins(c.get("admin")!)) return ownerOnly(c);
    const b = await body(c);
    const target = await findUser(c, b);
    if (!target) return c.json({ ok: false, message: "No such member" }, 404);
    if (target.id === c.get("user")!.id) return c.json({ ok: false, message: "The owner cannot remove themself." }, 400);
    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM admin_grants WHERE user_id = ?`).bind(target.id),
      c.env.DB.prepare(`UPDATE users SET role = 'player', updated_at = ? WHERE id = ? AND role = 'admin'`).bind(now, target.id),
    ]);
    await audit(c, "admin.revoke", target.email);
    return c.json({ ok: true, message: `${target.name} is no longer an admin.` });
  });

  // ── AdSense ──

  /** Public: what the site's ad loader needs. Nothing secret in it. */
  app.get("/api/ads/config", async (c) => {
    try {
      await ensureEngineSchema(c.env.DB);
    } catch {
      /* the defaults below are off */
    }
    const s = await readAdsense(c.env.DB);
    c.header("Cache-Control", "public, max-age=300");
    if (!s.enabled || !s.client) return c.json({ ok: true, enabled: false });
    return c.json({ ok: true, enabled: true, client: s.client, autoAds: s.autoAds, slots: s.slots, excludePaths: s.excludePaths });
  });

  app.get("/api/admin/adsense", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const [settings, rev] = await Promise.all([readAdsense(c.env.DB), revenueStats(c.env.DB, 365)]);
    return c.json({
      ok: true,
      settings,
      placements: ADSENSE_PLACEMENTS,
      months: rev.adsenseMonths,
      canEdit: canManageAdmins(c.get("admin")!),
    });
  });

  /** Switching ads on changes the public site, so it is the owner's call. */
  app.post("/api/admin/adsense/settings", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    if (!canManageAdmins(c.get("admin")!)) return ownerOnly(c);
    const current = await readAdsense(c.env.DB);
    const next = cleanAdsense(await body(c), current);
    if (typeof next === "string") return c.json({ ok: false, message: next }, 400);
    await c.env.DB.prepare(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ('adsense', ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).bind(JSON.stringify(next), c.get("user")!.id, new Date().toISOString()).run();
    await audit(c, "adsense.settings", null, { enabled: next.enabled, autoAds: next.autoAds });
    return c.json({ ok: true, settings: next });
  });

  /** A month of earnings, typed in from the AdSense report. */
  app.post("/api/admin/adsense/earnings", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const b = await body(c);
    const month = String(b.month ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return c.json({ ok: false, message: "Month must look like 2026-11." }, 400);
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
      return c.json({ ok: false, message: "Enter the month's earnings in rupees." }, 400);
    }
    const int = (v: unknown) => Math.max(0, Math.min(2_000_000_000, Math.floor(Number(v) || 0)));
    await c.env.DB.prepare(
      `INSERT INTO adsense_earnings (month, amount_cents, impressions, clicks, page_views, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(month) DO UPDATE SET amount_cents = excluded.amount_cents, impressions = excluded.impressions,
         clicks = excluded.clicks, page_views = excluded.page_views, note = excluded.note, updated_at = excluded.updated_at`
    ).bind(
      month,
      Math.round(amount * 100),
      int(b.impressions),
      int(b.clicks),
      int(b.pageViews),
      typeof b.note === "string" ? b.note.slice(0, 200) : null,
      new Date().toISOString()
    ).run();
    await audit(c, "adsense.earnings", month, { amount });
    return c.json({ ok: true });
  });

  app.delete("/api/admin/adsense/earnings/:month", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const month = c.req.param("month");
    await c.env.DB.prepare(`DELETE FROM adsense_earnings WHERE month = ?`).bind(month).run();
    await audit(c, "adsense.earnings.delete", month);
    return c.json({ ok: true });
  });

  // ── Artifact manager: the shop's cosmetics, who owns them, grant and take back ──

  app.get("/api/admin/artifacts", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const [owners, loadouts, recent] = await Promise.all([
      c.env.DB.prepare(
        `SELECT item_id, COUNT(*) AS owners,
                SUM(CASE WHEN source = 'shop' THEN 1 ELSE 0 END) AS bought,
                SUM(CASE WHEN source = 'admin' THEN 1 ELSE 0 END) AS granted,
                COALESCE(SUM(CASE WHEN source = 'shop' THEN price_paid ELSE 0 END),0) AS coins,
                MAX(unlocked_at) AS last
         FROM player_unlocks GROUP BY item_id`
      ).all<any>().then((r) => r.results ?? []).catch(() => []),
      c.env.DB.prepare(`SELECT border_id, showcase, emote_deck FROM player_loadout`)
        .all<any>().then((r) => r.results ?? []).catch(() => []),
      c.env.DB.prepare(
        `SELECT p.item_id, p.source, p.price_paid, p.unlocked_at, u.id AS user_id, u.name, u.email
         FROM player_unlocks p LEFT JOIN users u ON u.id = p.user_id
         ORDER BY p.unlocked_at DESC LIMIT 50`
      ).all<any>().then((r) => r.results ?? []).catch(() => []),
    ]);

    const equipped = new Map<string, number>();
    const bump = (id: unknown) => typeof id === "string" && equipped.set(id, (equipped.get(id) ?? 0) + 1);
    for (const l of loadouts) {
      bump(l.border_id);
      for (const id of safeArray(l.showcase)) bump(id);
      for (const id of safeArray(l.emote_deck)) bump(id);
    }
    const byId = new Map(owners.map((o: any) => [o.item_id, o]));

    return c.json({
      ok: true,
      items: CATALOGUE.map((item) => {
        const o: any = byId.get(item.id) ?? {};
        return {
          id: item.id,
          kind: item.kind,
          name: item.name,
          rarity: item.rarity,
          starter: !!item.starter,
          forSale: isForSale(item),
          price: priceOf(item),
          collectionPoints: item.starter ? 0 : COLLECTION_POINTS[item.rarity],
          owners: Number(o.owners) || 0,
          bought: Number(o.bought) || 0,
          granted: Number(o.granted) || 0,
          coinsSpent: Number(o.coins) || 0,
          equipped: equipped.get(item.id) ?? 0,
          lastUnlocked: o.last ?? null,
        };
      }),
      recent: recent.map((r: any) => ({
        itemId: r.item_id,
        itemName: itemById(r.item_id)?.name ?? r.item_id,
        source: r.source,
        price: r.price_paid,
        at: r.unlocked_at,
        user: { id: r.user_id, name: r.name, email: r.email },
      })),
    });
  });

  app.get("/api/admin/artifacts/:itemId/owners", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const { results } = await c.env.DB.prepare(
      `SELECT p.source, p.price_paid, p.unlocked_at, u.id, u.name, u.email
       FROM player_unlocks p JOIN users u ON u.id = p.user_id
       WHERE p.item_id = ? ORDER BY p.unlocked_at DESC LIMIT 500`
    ).bind(c.req.param("itemId")).all<any>();
    return c.json({
      ok: true,
      owners: (results ?? []).map((r: any) => ({
        id: r.id, name: r.name, email: r.email, source: r.source, price: r.price_paid, at: r.unlocked_at,
      })),
    });
  });

  app.post("/api/admin/artifacts/grant", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const b = await body(c);
    const item = itemById(String(b.itemId ?? ""));
    if (!item) return c.json({ ok: false, message: "No such item" }, 404);
    if (item.starter) return c.json({ ok: false, message: "Every player already has the starter items." }, 400);
    const target = await findUser(c, b);
    if (!target) return c.json({ ok: false, message: "No account with that email." }, 404);
    const res = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO player_unlocks (user_id, item_id, source, price_paid, reference_id, unlocked_at)
       VALUES (?, ?, 'admin', 0, ?, ?)`
    ).bind(target.id, item.id, createId("grant"), new Date().toISOString()).run();
    if (!(res.meta?.changes ?? 0)) return c.json({ ok: false, message: `${target.name} already owns ${item.name}.` }, 409);
    await audit(c, "artifact.grant", target.email, { item: item.id, reason: b.reason ?? null });
    return c.json({ ok: true, message: `${item.name} given to ${target.name}.` });
  });

  app.post("/api/admin/artifacts/revoke", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const b = await body(c);
    const item = itemById(String(b.itemId ?? ""));
    if (!item) return c.json({ ok: false, message: "No such item" }, 404);
    const target = await findUser(c, b);
    if (!target) return c.json({ ok: false, message: "No such member" }, 404);

    const res = await c.env.DB.prepare(`DELETE FROM player_unlocks WHERE user_id = ? AND item_id = ?`)
      .bind(target.id, item.id).run();
    if (!(res.meta?.changes ?? 0)) return c.json({ ok: false, message: `${target.name} does not own ${item.name}.` }, 404);

    // Take it off them too, so a profile never shows something they no longer own.
    const lo = await c.env.DB.prepare(`SELECT border_id, showcase, emote_deck FROM player_loadout WHERE user_id = ?`)
      .bind(target.id).first<any>().catch(() => null);
    if (lo) {
      await c.env.DB.prepare(
        `UPDATE player_loadout SET border_id = ?, showcase = ?, emote_deck = ?, updated_at = ? WHERE user_id = ?`
      ).bind(
        lo.border_id === item.id ? null : lo.border_id,
        JSON.stringify(safeArray(lo.showcase).filter((id) => id !== item.id)),
        JSON.stringify(safeArray(lo.emote_deck).filter((id) => id !== item.id)),
        new Date().toISOString(),
        target.id
      ).run();
    }
    await audit(c, "artifact.revoke", target.email, { item: item.id });
    return c.json({ ok: true, message: `${item.name} taken back from ${target.name}.` });
  });

  /** A player's collection, for the manager's lookup box. */
  app.get("/api/admin/artifacts/player", async (c) => {
    if (!requireAdmin(c)) return deny(c);
    const target = await findUser(c, { email: c.req.query("email"), userId: c.req.query("userId") });
    if (!target) return c.json({ ok: false, message: "No account with that email." }, 404);
    const [{ results }, lo] = await Promise.all([
      c.env.DB.prepare(`SELECT item_id, source, unlocked_at FROM player_unlocks WHERE user_id = ? ORDER BY unlocked_at DESC`)
        .bind(target.id).all<any>(),
      c.env.DB.prepare(`SELECT border_id, showcase, emote_deck FROM player_loadout WHERE user_id = ?`)
        .bind(target.id).first<any>().catch(() => null),
    ]);
    return c.json({
      ok: true,
      user: { id: target.id, name: target.name, email: target.email },
      owned: (results ?? []).map((r: any) => ({ itemId: r.item_id, source: r.source, at: r.unlocked_at })),
      loadout: lo
        ? { borderId: lo.border_id, showcase: safeArray(lo.showcase), emoteDeck: safeArray(lo.emote_deck) }
        : null,
    });
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function safeArray(raw: unknown): string[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
