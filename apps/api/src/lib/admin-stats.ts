/**
 * The numbers behind the admin console: games, logins, levels, coins, revenue.
 *
 * Read-only, and every query is wrapped so a table a database has not grown
 * yet costs that one figure, not the whole page.
 *
 * ── WHERE EACH GAME COUNT COMES FROM ──
 *   venue    engine_matches with status COMPLETED (frames scored at a venue)
 *   legacy   matches with status completed (the older bracket tables)
 *   ai       online_games that finished (vs the computer or a friend on the sofa)
 *   pvp      trophy_ledger rows for online 8-ball (reference pool_game), one per table
 *   imposter coin_ledger rows for Imposter (reference imposter_game), one per game.
 *            Only games that paid coins are recorded, so this is a floor.
 *
 * ── LOGINS ──
 * login_events is written from this release on. Before it, the only trace of a
 * visit is the once-a-day DAILY_VISIT coin, so active-user counts take the union
 * of both.
 *
 * ── REVENUE ──
 * Platform revenue is what the platform keeps: payout handling fees, venue
 * subscription charges and AdSense. Wallet deposits are members' own money and
 * are reported apart from revenue, as money held.
 */

import { levelInfo, LEVEL_BANDS } from "./progression";
import { collectionPointsFor } from "./shop";
import { statusEntitles } from "./billing";

type Row = Record<string, any>;

async function all(db: D1Database, sql: string, ...binds: unknown[]): Promise<Row[]> {
  try {
    const { results } = await db.prepare(sql).bind(...binds).all<Row>();
    return results ?? [];
  } catch (err) {
    console.warn("admin-stats query failed:", (err as Error)?.message, sql.slice(0, 80));
    return [];
  }
}

async function one(db: D1Database, sql: string, ...binds: unknown[]): Promise<Row> {
  return (await all(db, sql, ...binds))[0] ?? {};
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** Every date from `since` to today, as YYYY-MM-DD, for a chart with no gaps. */
export function dayRange(sinceIso: string, now = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(sinceIso.slice(0, 10) + "T00:00:00Z");
  const end = now.toISOString().slice(0, 10);
  for (let i = 0; i < 800; i++) {
    const key = d.toISOString().slice(0, 10);
    out.push(key);
    if (key >= end) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function fillDaily<K extends string>(days: string[], series: Record<K, Row[]>): Array<{ d: string } & Record<K, number>> {
  const maps = Object.fromEntries(
    Object.entries(series).map(([k, rows]) => [k, new Map((rows as Row[]).map((r) => [String(r.d), num(r.n)]))])
  ) as Record<K, Map<string, number>>;
  return days.map((d) => {
    const row: any = { d };
    for (const k of Object.keys(maps) as K[]) row[k] = maps[k].get(d) ?? 0;
    return row;
  });
}

/** Rupees, as the rest of the API returns money: a string with two places. */
const money = (cents: number) => (Math.round(cents) / 100).toFixed(2);

/** Pull a charge amount (paise) out of a stored Razorpay subscription webhook. */
export function chargedAmountFromPayload(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const p = JSON.parse(raw);
    const amt = p?.payload?.payment?.entity?.amount ?? p?.payload?.invoice?.entity?.amount_paid;
    return typeof amt === "number" && amt > 0 ? amt : 0;
  } catch {
    return 0;
  }
}

export async function platformStats(db: D1Database, days: number) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const day1 = new Date(now.getTime() - 86_400_000).toISOString();
  const day7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const day30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const dates = dayRange(since, now);

  // Everyone who did something: a sign-in, a daily visit, or any coin earned.
  const activeSince = (iso: string) =>
    one(
      db,
      `SELECT COUNT(DISTINCT user_id) AS n FROM (
         SELECT user_id FROM login_events WHERE created_at >= ?1
         UNION ALL SELECT user_id FROM coin_ledger WHERE created_at >= ?1
       )`,
      iso
    ).then((r) => num(r.n));

  const [
    usersTotal, usersNew, signupsDaily, admins,
    loginTotals, loginByMethod, loginsDaily, visitsDaily, recentLogins,
    dau, wau, mau,
    venueTotal, venueRange, venueDaily,
    legacyTotal, legacyRange,
    aiTotal, aiRange, aiDaily, aiBySport,
    pvpTotal, pvpRange, pvpDaily,
    impTotal, impRange, impDaily,
    tourn,
  ] = await Promise.all([
    one(db, `SELECT COUNT(*) AS n FROM users`).then((r) => num(r.n)),
    one(db, `SELECT COUNT(*) AS n FROM users WHERE created_at >= ?`, since).then((r) => num(r.n)),
    all(db, `SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d`, since),
    all(db, `SELECT g.user_id, g.granted_at, g.note, u.name, u.email FROM admin_grants g LEFT JOIN users u ON u.id = g.user_id`),

    one(db, `SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM login_events WHERE created_at >= ?`, since),
    all(db, `SELECT method, COUNT(*) AS n FROM login_events WHERE created_at >= ? GROUP BY method`, since),
    all(db, `SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM login_events WHERE created_at >= ? GROUP BY d`, since),
    all(
      db,
      `SELECT d, COUNT(DISTINCT user_id) AS n FROM (
         SELECT substr(created_at,1,10) AS d, user_id FROM login_events WHERE created_at >= ?1
         UNION ALL
         SELECT substr(created_at,1,10) AS d, user_id FROM coin_ledger WHERE reason = 'DAILY_VISIT' AND created_at >= ?1
       ) GROUP BY d`,
      since
    ),
    all(
      db,
      `SELECT l.user_id, l.method, l.created_at, u.name, u.email
       FROM login_events l LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC LIMIT 40`
    ),
    activeSince(day1), activeSince(day7), activeSince(day30),

    one(db, `SELECT COUNT(*) AS n FROM engine_matches WHERE status = 'COMPLETED'`).then((r) => num(r.n)),
    one(db, `SELECT COUNT(*) AS n FROM engine_matches WHERE status = 'COMPLETED' AND created_at >= ?`, since).then((r) => num(r.n)),
    all(db, `SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM engine_matches WHERE status = 'COMPLETED' AND created_at >= ? GROUP BY d`, since),

    one(db, `SELECT COUNT(*) AS n FROM matches WHERE LOWER(status) = 'completed'`).then((r) => num(r.n)),
    one(db, `SELECT COUNT(*) AS n FROM matches WHERE LOWER(status) = 'completed' AND COALESCE(completed_at, created_at) >= ?`, since).then((r) => num(r.n)),

    one(db, `SELECT COUNT(*) AS n FROM online_games WHERE finished_at IS NOT NULL`).then((r) => num(r.n)),
    one(db, `SELECT COUNT(*) AS n FROM online_games WHERE finished_at IS NOT NULL AND finished_at >= ?`, since).then((r) => num(r.n)),
    all(db, `SELECT substr(finished_at,1,10) AS d, COUNT(*) AS n FROM online_games WHERE finished_at >= ? GROUP BY d`, since),
    all(db, `SELECT sport, COUNT(*) AS n FROM online_games WHERE finished_at IS NOT NULL GROUP BY sport ORDER BY n DESC`),

    one(db, `SELECT COUNT(DISTINCT reference_id) AS n FROM trophy_ledger WHERE reference_type = 'pool_game'`).then((r) => num(r.n)),
    one(db, `SELECT COUNT(DISTINCT reference_id) AS n FROM trophy_ledger WHERE reference_type = 'pool_game' AND created_at >= ?`, since).then((r) => num(r.n)),
    all(db, `SELECT substr(created_at,1,10) AS d, COUNT(DISTINCT reference_id) AS n FROM trophy_ledger WHERE reference_type = 'pool_game' AND created_at >= ? GROUP BY d`, since),

    one(db, `SELECT COUNT(DISTINCT reference_id) AS n FROM coin_ledger WHERE reference_type = 'imposter_game'`).then((r) => num(r.n)),
    one(db, `SELECT COUNT(DISTINCT reference_id) AS n FROM coin_ledger WHERE reference_type = 'imposter_game' AND created_at >= ?`, since).then((r) => num(r.n)),
    all(db, `SELECT substr(created_at,1,10) AS d, COUNT(DISTINCT reference_id) AS n FROM coin_ledger WHERE reference_type = 'imposter_game' AND created_at >= ? GROUP BY d`, since),

    one(
      db,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN LOWER(status) IN ('open','in_progress','live','started') THEN 1 ELSE 0 END) AS running,
              SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS created
       FROM tournaments`,
      since
    ),
  ]);

  const methods: Record<string, number> = {};
  for (const r of loginByMethod) methods[String(r.method)] = num(r.n);

  const gameKinds = [
    { kind: "venue", label: "Venue frames", total: venueTotal, inRange: venueRange },
    { kind: "pvp", label: "Online 8-ball (PvP)", total: pvpTotal, inRange: pvpRange },
    { kind: "ai", label: "Browser games (AI / sofa)", total: aiTotal, inRange: aiRange },
    { kind: "imposter", label: "Imposter rounds", total: impTotal, inRange: impRange },
    { kind: "legacy", label: "Bracket matches", total: legacyTotal, inRange: legacyRange },
  ];

  return {
    generatedAt: now.toISOString(),
    range: { days, since },
    users: {
      total: usersTotal,
      newInRange: usersNew,
      active: { day: dau, week: wau, month: mau },
      signupsDaily: fillDaily(dates, { n: signupsDaily }).map((r) => ({ d: r.d, n: r.n })),
      grantedAdmins: admins.map((a) => ({ id: a.user_id, name: a.name, email: a.email, grantedAt: a.granted_at, note: a.note })),
    },
    logins: {
      inRange: num(loginTotals.n),
      uniqueInRange: num(loginTotals.u),
      byMethod: methods,
      daily: fillDaily(dates, { logins: loginsDaily, active: visitsDaily }),
      recent: recentLogins.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, method: r.method, at: r.created_at })),
    },
    games: {
      total: gameKinds.reduce((n, g) => n + g.total, 0),
      inRange: gameKinds.reduce((n, g) => n + g.inRange, 0),
      byKind: gameKinds,
      daily: fillDaily(dates, { venue: venueDaily, pvp: pvpDaily, ai: aiDaily, imposter: impDaily }),
      aiBySport: aiBySport.map((r) => ({ sport: r.sport, n: num(r.n) })),
      tournaments: {
        total: num(tourn.total),
        completed: num(tourn.completed),
        running: num(tourn.running),
        createdInRange: num(tourn.created),
      },
    },
  };
}

/** Every player's level, the band spread and the leaders. */
export async function levelStats(db: D1Database) {
  const [users, unlocks, trophies, games] = await Promise.all([
    all(
      db,
      `SELECT u.id, u.name, u.email, u.created_at,
              COALESCE(b.lifetime, 0) AS lifetime, COALESCE(b.balance, 0) AS balance
       FROM users u LEFT JOIN coin_balances b ON b.user_id = u.id`
    ),
    all(db, `SELECT user_id, item_id FROM player_unlocks`),
    all(db, `SELECT user_id, trophies, games, wins FROM player_trophies WHERE track = 'overall'`),
    all(
      db,
      `SELECT user_id, COUNT(*) AS n, MAX(created_at) AS last FROM coin_ledger GROUP BY user_id`
    ),
  ]);

  const owned = new Map<string, string[]>();
  for (const u of unlocks) {
    const list = owned.get(u.user_id) ?? [];
    list.push(u.item_id);
    owned.set(u.user_id, list);
  }
  const trophyBy = new Map(trophies.map((t) => [t.user_id, t]));
  const activityBy = new Map(games.map((g) => [g.user_id, g]));

  const players = users.map((u) => {
    const info = levelInfo(num(u.lifetime), collectionPointsFor(owned.get(u.id) ?? []));
    const t = trophyBy.get(u.id);
    const a = activityBy.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      joinedAt: u.created_at,
      level: info.level,
      band: info.band.name,
      bandId: info.band.id,
      xp: info.xp,
      // How far through the current level, 0..1, for the progress bar.
      progress: info.nextXp > info.levelXp ? (info.xp - info.levelXp) / (info.nextXp - info.levelXp) : 1,
      lifetimeCoins: num(u.lifetime),
      coins: num(u.balance),
      items: (owned.get(u.id) ?? []).length,
      trophies: num(t?.trophies),
      games: num(t?.games),
      wins: num(t?.wins),
      events: num(a?.n),
      lastSeen: a?.last ?? null,
    };
  });

  const levels = players.map((p) => p.level).sort((a, b) => a - b);
  const histogram = new Map<number, number>();
  for (const l of levels) histogram.set(l, (histogram.get(l) ?? 0) + 1);

  return {
    players: players.sort((a, b) => b.xp - a.xp || b.trophies - a.trophies),
    bands: LEVEL_BANDS.map((band) => ({
      id: band.id,
      name: band.name,
      from: band.from,
      players: players.filter((p) => p.bandId === band.id).length,
    })),
    histogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([level, n]) => ({ level, n })),
    average: levels.length ? levels.reduce((s, l) => s + l, 0) / levels.length : 0,
    median: levels.length ? levels[Math.floor(levels.length / 2)] : 0,
    highest: levels.length ? levels[levels.length - 1] : 0,
  };
}

/** Money: what the platform kept, what members hold, by day and by month. */
export async function revenueStats(db: D1Database, days: number) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const dates = dayRange(since, now);

  const [deposits, depositsDaily, depositsMonthly, fees, feesDaily, feesMonthly, charges, subs, adsense, held, coins] =
    await Promise.all([
      all(
        db,
        `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS c,
                COALESCE(SUM(CASE WHEN created_at >= ? THEN amount_cents ELSE 0 END),0) AS r,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS rn
         FROM payments WHERE status = 'success' AND COALESCE(is_test,0) = 0`,
        since, since
      ),
      all(db, `SELECT substr(created_at,1,10) AS d, SUM(amount_cents) AS n FROM payments WHERE status = 'success' AND COALESCE(is_test,0) = 0 AND created_at >= ? GROUP BY d`, since),
      all(db, `SELECT substr(created_at,1,7) AS m, SUM(amount_cents) AS n FROM payments WHERE status = 'success' AND COALESCE(is_test,0) = 0 GROUP BY m`),
      one(
        db,
        `SELECT COALESCE(SUM(fee_cents),0) AS c,
                COALESCE(SUM(CASE WHEN COALESCE(processed_at, created_at) >= ? THEN fee_cents ELSE 0 END),0) AS r
         FROM payout_requests WHERE status = 'paid'`,
        since
      ),
      all(db, `SELECT substr(COALESCE(processed_at, created_at),1,10) AS d, SUM(fee_cents) AS n FROM payout_requests WHERE status = 'paid' AND COALESCE(processed_at, created_at) >= ? GROUP BY d`, since),
      all(db, `SELECT substr(COALESCE(processed_at, created_at),1,7) AS m, SUM(fee_cents) AS n FROM payout_requests WHERE status = 'paid' GROUP BY m`),
      all(db, `SELECT created_at, payload FROM subscription_events WHERE event = 'subscription.charged' ORDER BY created_at DESC LIMIT 2000`),
      all(db, `SELECT status, amount_cents, interval_months, cancelled_at FROM venue_subscriptions`),
      all(db, `SELECT month, amount_cents, impressions, clicks, page_views, note, updated_at FROM adsense_earnings ORDER BY month DESC`),
      one(db, `SELECT COALESCE(SUM(balance_cents),0) AS b, COALESCE(SUM(bonus_cents),0) AS bonus FROM wallets`),
      one(
        db,
        `SELECT (SELECT COALESCE(SUM(balance),0) FROM coin_balances) AS circulating,
                (SELECT COALESCE(SUM(lifetime),0) FROM coin_balances) AS minted,
                (SELECT COALESCE(SUM(price_paid),0) FROM player_unlocks WHERE source = 'shop') AS spent`
      ),
    ]);

  // Subscription charges, by day and by month, from the stored webhooks.
  const subDaily = new Map<string, number>();
  const subMonthly = new Map<string, number>();
  let subTotal = 0;
  let subRange = 0;
  for (const ev of charges) {
    const amt = chargedAmountFromPayload(ev.payload);
    if (!amt) continue;
    const at = String(ev.created_at);
    subTotal += amt;
    subMonthly.set(at.slice(0, 7), (subMonthly.get(at.slice(0, 7)) ?? 0) + amt);
    if (at >= since) {
      subRange += amt;
      subDaily.set(at.slice(0, 10), (subDaily.get(at.slice(0, 10)) ?? 0) + amt);
    }
  }
  const live = subs.filter((s) => statusEntitles(String(s.status)) && !s.cancelled_at);
  const mrrCents = live.reduce((n, s) => n + Math.round(num(s.amount_cents) / Math.max(1, num(s.interval_months))), 0);

  // AdSense months that fall in the range count toward it.
  const sinceMonth = since.slice(0, 7);
  const adTotal = adsense.reduce((n, a) => n + num(a.amount_cents), 0);
  const adRange = adsense.filter((a) => String(a.month) >= sinceMonth).reduce((n, a) => n + num(a.amount_cents), 0);

  const dep = deposits[0] ?? {};
  const feeTotal = num(fees.c);
  const feeRange = num(fees.r);

  const months = new Set<string>([
    ...depositsMonthly.map((r) => String(r.m)),
    ...feesMonthly.map((r) => String(r.m)),
    ...subMonthly.keys(),
    ...adsense.map((a) => String(a.month)),
  ]);
  const depM = new Map(depositsMonthly.map((r) => [String(r.m), num(r.n)]));
  const feeM = new Map(feesMonthly.map((r) => [String(r.m), num(r.n)]));
  const adM = new Map(adsense.map((a) => [String(a.month), num(a.amount_cents)]));
  const monthly = [...months]
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort()
    .slice(-24)
    .map((m) => ({
      month: m,
      fees: money(feeM.get(m) ?? 0),
      subscriptions: money(subMonthly.get(m) ?? 0),
      adsense: money(adM.get(m) ?? 0),
      deposits: money(depM.get(m) ?? 0),
    }));

  const daily = fillDaily(dates, {
    fees: feesDaily,
    deposits: depositsDaily,
    subscriptions: [...subDaily.entries()].map(([d, n]) => ({ d, n })),
  }).map((r) => ({ d: r.d, fees: money(r.fees), subscriptions: money(r.subscriptions), deposits: money(r.deposits) }));

  return {
    currency: "INR",
    range: { days, since },
    revenue: {
      total: money(feeTotal + subTotal + adTotal),
      inRange: money(feeRange + subRange + adRange),
      sources: [
        { id: "subscriptions", label: "Venue subscriptions", total: money(subTotal), inRange: money(subRange) },
        { id: "adsense", label: "AdSense", total: money(adTotal), inRange: money(adRange) },
        { id: "fees", label: "Payout handling fees", total: money(feeTotal), inRange: money(feeRange) },
      ],
      mrr: money(mrrCents),
      payingSubscriptions: live.length,
    },
    deposits: {
      total: money(num(dep.c)),
      inRange: money(num(dep.r)),
      count: num(dep.n),
      countInRange: num(dep.rn),
    },
    held: { balances: money(num(held.b)), bonus: money(num(held.bonus)) },
    coins: { circulating: num(coins.circulating), minted: num(coins.minted), spentInShop: num(coins.spent) },
    daily,
    monthly,
    adsenseMonths: adsense.map((a) => ({
      month: a.month,
      amount: money(num(a.amount_cents)),
      impressions: num(a.impressions),
      clicks: num(a.clicks),
      pageViews: num(a.page_views),
      note: a.note,
      updatedAt: a.updated_at,
    })),
  };
}
