"use client";

import { useMemo, useState } from "react";
import { BarList, ColumnChart, ShareBar, TimeChart, type SeriesDef } from "./charts";
import { Empty, Kpi, Section, fmtCompact, fmtDay, fmtINR, fmtInt, halfTrend, timeAgo, downloadCsv } from "./ui";

export type Stats = any;
export type Levels = any;
export type Revenue = any;

const GAME_SERIES: SeriesDef[] = [
  { key: "venue", label: "Venue frames", slot: 1 },
  { key: "pvp", label: "Online 8-ball", slot: 2 },
  { key: "ai", label: "Browser vs AI", slot: 3 },
  { key: "imposter", label: "Imposter", slot: 4 },
];

const METHOD_LABEL: Record<string, string> = {
  google: "Google",
  "google-signup": "Google (new account)",
  password: "Email & password",
  signup: "Signup (email)",
};

function gamesPerDay(stats: Stats): number[] {
  return stats.games.daily.map((r: any) => r.venue + r.pvp + r.ai + r.imposter);
}

// ── Overview ──

export function OverviewTab({
  stats,
  levels,
  revenue,
  go,
}: {
  stats: Stats;
  levels: Levels | null;
  revenue: Revenue | null;
  go: (tab: string) => void;
}) {
  const days = stats.range.days;
  const perDay = gamesPerDay(stats);
  const activePerDay = stats.logins.daily.map((r: any) => r.active);
  const signups = stats.users.signupsDaily.map((r: any) => r.n);
  const revDaily = (revenue?.daily ?? []).map((r: any) => Number(r.fees) + Number(r.subscriptions));
  const stickiness = stats.users.active.month ? stats.users.active.day / stats.users.active.month : 0;

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <Kpi
          label="Players"
          value={fmtInt(stats.users.total)}
          sub={`+${fmtInt(stats.users.newInRange)} in ${days}d`}
          trend={halfTrend(signups)}
          spark={signups}
          onClick={() => go("players")}
        />
        <Kpi
          label="Active today"
          value={fmtInt(stats.users.active.day)}
          sub={`${fmtInt(stats.users.active.week)} this week · ${fmtInt(stats.users.active.month)} this month`}
          spark={activePerDay}
          trend={halfTrend(activePerDay)}
          onClick={() => go("logins")}
        />
        <Kpi
          label={`Games · ${days}d`}
          value={fmtInt(stats.games.inRange)}
          sub={`${fmtInt(stats.games.total)} all time`}
          spark={perDay}
          trend={halfTrend(perDay)}
          onClick={() => go("games")}
        />
        <Kpi
          label={`Logins · ${days}d`}
          value={fmtInt(stats.logins.inRange)}
          sub={`${fmtInt(stats.logins.uniqueInRange)} different players`}
          spark={stats.logins.daily.map((r: any) => r.logins)}
          onClick={() => go("logins")}
        />
        <Kpi
          label={`Revenue · ${days}d`}
          value={revenue ? fmtINR(revenue.revenue.inRange) : "…"}
          sub={revenue ? `${fmtINR(revenue.revenue.total)} all time` : undefined}
          spark={revDaily}
          onClick={() => go("revenue")}
        />
        <Kpi
          label="Average level"
          value={levels ? levels.average.toFixed(1) : "…"}
          sub={levels ? `median ${levels.median} · top ${levels.highest}` : undefined}
          onClick={() => go("players")}
        />
      </div>

      <div className="adm-grid-2">
        <Section title="Games played per day" hint="Every kind of game, stacked. Tap a legend entry to hide it.">
          <TimeChart title="Games played per day" data={stats.games.daily} series={GAME_SERIES} mode="stacked" format={fmtCompact} />
        </Section>
        <Section
          title="Active players per day"
          hint={`Stickiness ${Math.round(stickiness * 100)}%: today's players as a share of this month's.`}
        >
          <TimeChart
            title="Active players and logins per day"
            data={stats.logins.daily}
            series={[
              { key: "active", label: "Active players", slot: 1 },
              { key: "logins", label: "Sign-ins", slot: 2 },
            ]}
            mode="lines"
            format={fmtCompact}
          />
        </Section>
      </div>

      <div className="adm-grid-3">
        <Section title="Where the revenue came from" hint={`Last ${days} days`} actions={<button className="adm-link" onClick={() => go("revenue")}>Revenue →</button>}>
          {revenue ? (
            <ShareBar
              parts={revenue.revenue.sources.map((s: any, i: number) => ({ key: s.id, label: s.label, value: Number(s.inRange), slot: (i + 1) as 1 | 2 | 3 }))}
              format={(n) => fmtINR(n)}
            />
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>
        <Section title="Players by level band" actions={<button className="adm-link" onClick={() => go("players")}>Players →</button>}>
          {levels ? (
            <BarList rows={levels.bands.map((b: any) => ({ key: b.id, label: b.name, sub: `level ${b.from}+`, value: b.players }))} format={fmtInt} />
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>
        <Section title="Latest sign-ins" actions={<button className="adm-link" onClick={() => go("logins")}>All →</button>}>
          <RecentLogins rows={stats.logins.recent.slice(0, 7)} compact />
        </Section>
      </div>
    </div>
  );
}

function RecentLogins({ rows, compact }: { rows: any[]; compact?: boolean }) {
  if (!rows.length) return <Empty>No sign-ins recorded yet. They are counted from this release on.</Empty>;
  return (
    <ul className="adm-feed">
      {rows.map((r, i) => (
        <li key={i}>
          <span className="adm-avatar">{(r.name || r.email || "?").slice(0, 1).toUpperCase()}</span>
          <span className="adm-feed-main">
            <b>{r.name || "Unknown"}</b>
            {!compact && <small>{r.email}</small>}
          </span>
          <span className={`adm-chip m-${r.method}`}>{METHOD_LABEL[r.method] ?? r.method}</span>
          <span className="adm-feed-time" title={new Date(r.at).toLocaleString()}>{timeAgo(r.at)}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Logins ──

export function LoginsTab({ stats }: { stats: Stats }) {
  const methods = Object.entries(stats.logins.byMethod as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const a = stats.users.active;
  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <Kpi label="Sign-ins" value={fmtInt(stats.logins.inRange)} sub={`last ${stats.range.days} days`} spark={stats.logins.daily.map((r: any) => r.logins)} />
        <Kpi label="Players who signed in" value={fmtInt(stats.logins.uniqueInRange)} sub="unique" />
        <Kpi label="Daily active" value={fmtInt(a.day)} sub="last 24 hours" />
        <Kpi label="Weekly active" value={fmtInt(a.week)} sub="last 7 days" />
        <Kpi label="Monthly active" value={fmtInt(a.month)} sub="last 30 days" />
        <Kpi label="New accounts" value={fmtInt(stats.users.newInRange)} sub={`of ${fmtInt(stats.users.total)}`} spark={stats.users.signupsDaily.map((r: any) => r.n)} />
      </div>

      <div className="adm-grid-2">
        <Section title="Sign-ins and active players" hint="Active = signed in, or collected a daily visit or any coins that day.">
          <TimeChart
            title="Sign-ins and active players per day"
            data={stats.logins.daily}
            series={[
              { key: "active", label: "Active players", slot: 1 },
              { key: "logins", label: "Sign-ins", slot: 2 },
            ]}
            mode="lines"
          />
        </Section>
        <Section title="New accounts per day">
          <TimeChart title="New accounts per day" data={stats.users.signupsDaily} series={[{ key: "n", label: "New accounts", slot: 3 }]} mode="stacked" />
        </Section>
      </div>

      <div className="adm-grid-2">
        <Section title="How people sign in" hint={`Last ${stats.range.days} days`}>
          {methods.length ? (
            <BarList rows={methods.map(([k, v]) => ({ key: k, label: METHOD_LABEL[k] ?? k, value: v }))} format={fmtInt} />
          ) : (
            <Empty>No sign-ins recorded in this range.</Empty>
          )}
        </Section>
        <Section
          title="Sign-in log"
          hint="The latest 40, newest first."
          actions={
            <button className="adm-link" onClick={() => downloadCsv("wta-signins", stats.logins.recent)}>
              Export CSV
            </button>
          }
        >
          <RecentLogins rows={stats.logins.recent} />
        </Section>
      </div>
    </div>
  );
}

// ── Games ──

export function GamesTab({ stats }: { stats: Stats }) {
  const [focus, setFocus] = useState<string | null>(null);
  const series = focus ? GAME_SERIES.filter((s) => s.key === focus) : GAME_SERIES;
  const t = stats.games.tournaments;
  const busiest = useMemo(() => {
    const per = gamesPerDay(stats);
    let best = -1;
    let at = 0;
    per.forEach((v, i) => v > best && ((best = v), (at = i)));
    return best > 0 ? { d: stats.games.daily[at].d, n: best } : null;
  }, [stats]);
  const avg = stats.games.inRange / Math.max(1, stats.range.days);

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <Kpi label="Games · all time" value={fmtInt(stats.games.total)} sub={`${fmtInt(stats.games.inRange)} in the last ${stats.range.days} days`} />
        <Kpi label="Per day" value={avg.toFixed(avg < 10 ? 1 : 0)} sub="average in range" spark={gamesPerDay(stats)} />
        <Kpi label="Busiest day" value={busiest ? fmtInt(busiest.n) : "—"} sub={busiest ? fmtDay(busiest.d, true) : "no games yet"} />
        <Kpi label="Tournaments" value={fmtInt(t.total)} sub={`${fmtInt(t.running)} running · ${fmtInt(t.completed)} finished`} />
      </div>

      <Section
        title="Games per day"
        hint={focus ? "Showing one kind. Tap it again in the list to show all." : "Tap a kind in the list below to look at it alone."}
      >
        <TimeChart title="Games per day by kind" data={stats.games.daily} series={series} mode="stacked" />
      </Section>

      <div className="adm-grid-2">
        <Section title="By kind of game" hint="All time, with the selected range in brackets.">
          <BarList
            rows={stats.games.byKind.map((g: any) => ({
              key: g.kind,
              label: g.label,
              sub: `${fmtInt(g.inRange)} in range`,
              value: g.total,
              slot: GAME_SERIES.find((s) => s.key === g.kind)?.slot ?? 5,
            }))}
            format={fmtInt}
            onPick={(k) => GAME_SERIES.some((s) => s.key === k) && setFocus(focus === k ? null : k)}
            active={focus}
          />
          <p className="adm-hint" style={{ marginTop: "0.75rem" }}>
            Imposter counts only the rounds that paid coins (3+ real players), so it is a floor.
          </p>
        </Section>
        <Section title="Browser games by sport" hint="Finished games against the AI or a friend on the same device.">
          {stats.games.aiBySport.length ? (
            <ColumnChart
              title="Browser games by sport"
              data={stats.games.aiBySport.map((r: any) => ({ label: String(r.sport).replace("_", " ").toLowerCase(), value: r.n }))}
              slot={3}
              format={fmtInt}
            />
          ) : (
            <Empty>No browser games finished yet.</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}
