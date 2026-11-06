"use client";

import { useMemo, useState } from "react";
import { BarList, ColumnChart } from "./charts";
import { Empty, Kpi, Section, downloadCsv, fmtCompact, fmtDay, fmtInt, timeAgo } from "./ui";
import type { Levels } from "./stats-tabs";

type SortKey = "level" | "coins" | "trophies" | "games" | "lastSeen" | "joinedAt" | "items";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "level", label: "Level" },
  { key: "coins", label: "Coins" },
  { key: "trophies", label: "Trophies" },
  { key: "games", label: "Games" },
  { key: "items", label: "Items" },
  { key: "lastSeen", label: "Last active" },
  { key: "joinedAt", label: "Joined" },
];

export function PlayersTab({ levels }: { levels: Levels }) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "level", dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const players: any[] = levels.players;
  const active7 = players.filter((p) => p.lastSeen && Date.now() - new Date(p.lastSeen).getTime() < 7 * 86400000).length;
  const neverPlayed = players.filter((p) => p.events === 0).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = players.filter(
      (p) =>
        (!q || p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)) &&
        (!band || p.bandId === band) &&
        (level === null || p.level === level)
    );
    const val = (p: any) =>
      sort.key === "lastSeen" || sort.key === "joinedAt"
        ? new Date(p[sort.key] ?? 0).getTime()
        : sort.key === "level"
          ? p.xp
          : p[sort.key];
    return rows.sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [players, query, band, level, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));
  const clear = () => {
    setBand(null);
    setLevel(null);
    setQuery("");
  };

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <Kpi label="Players" value={fmtInt(players.length)} sub={`${fmtInt(active7)} active this week`} />
        <Kpi label="Average level" value={levels.average.toFixed(1)} sub={`median ${levels.median}`} />
        <Kpi label="Highest level" value={fmtInt(levels.highest)} sub={players[0]?.name ?? ""} />
        <Kpi label="Never played" value={fmtInt(neverPlayed)} sub="signed up, earned nothing yet" />
      </div>

      <div className="adm-grid-2">
        <Section title="Level bands" hint="Tap a band to list its players below.">
          <BarList
            rows={levels.bands.map((b: any) => ({ key: b.id, label: b.name, sub: `from level ${b.from}`, value: b.players }))}
            format={fmtInt}
            onPick={(k) => {
              setLevel(null);
              setBand(band === k ? null : k);
            }}
            active={band}
          />
        </Section>
        <Section title="Players at each level" hint="Tap a column to list the players at that level.">
          {levels.histogram.length ? (
            <ColumnChart
              title="Players at each level"
              data={fillLevels(levels.histogram)}
              xTitle="Level"
              format={fmtInt}
              onPick={(k) => {
                setBand(null);
                setLevel(level === Number(k) ? null : Number(k));
              }}
              active={level === null ? null : String(level)}
            />
          ) : (
            <Empty>No players yet.</Empty>
          )}
        </Section>
      </div>

      <Section
        title={`Players${band ? ` · ${levels.bands.find((b: any) => b.id === band)?.name}` : ""}${level !== null ? ` · level ${level}` : ""}`}
        hint={`${fmtInt(shown.length)} shown. Tap a column heading to sort, a row for details.`}
        actions={
          <>
            {(band || level !== null || query) && (
              <button className="adm-link" onClick={clear}>
                Clear filters
              </button>
            )}
            <button
              className="adm-link"
              onClick={() =>
                downloadCsv(
                  "wta-players",
                  shown.map((p) => ({
                    name: p.name, email: p.email, level: p.level, band: p.band, xp: p.xp, coins: p.coins,
                    lifetimeCoins: p.lifetimeCoins, trophies: p.trophies, games: p.games, wins: p.wins,
                    items: p.items, lastSeen: p.lastSeen, joinedAt: p.joinedAt,
                  }))
                )
              }
            >
              Export CSV
            </button>
          </>
        }
      >
        <input
          className="premium-input-v2 adm-search"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="adm-table-wrap">
          <table className="admin-table adm-sortable">
            <thead>
              <tr>
                <th>Player</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={{ textAlign: "right" }}>
                    <button type="button" onClick={() => toggleSort(c.key)} aria-sort={sort.key === c.key ? (sort.dir < 0 ? "descending" : "ascending") : "none"}>
                      {c.label} {sort.key === c.key ? (sort.dir < 0 ? "↓" : "↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((p) => (
                <PlayerRow key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="muted">Nobody matches.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shown.length > limit && (
          <button className="button-secondary button-sm adm-more" onClick={() => setLimit(limit + 100)}>
            Show more ({fmtInt(shown.length - limit)} left)
          </button>
        )}
      </Section>
    </div>
  );
}

/** Every level from 1 to the highest, empty ones included, so the spread reads true. */
function fillLevels(histogram: Array<{ level: number; n: number }>) {
  const by = new Map(histogram.map((h) => [h.level, h.n]));
  const top = Math.min(100, Math.max(1, ...histogram.map((h) => h.level)));
  return Array.from({ length: top }, (_, i) => {
    const level = i + 1;
    return { key: String(level), label: String(level), value: by.get(level) ?? 0, tip: `Level ${level}` };
  });
}

function PlayerRow({ p, open, onToggle }: { p: any; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className={`adm-row ${open ? "is-open" : ""}`} onClick={onToggle}>
        <td>
          <b>{p.name}</b>
          <div className="muted admin-sub">{p.email}</div>
        </td>
        <td style={{ textAlign: "right" }}>
          <span className="adm-level">
            {p.level}
            <small>{p.band}</small>
          </span>
        </td>
        <td style={{ textAlign: "right" }}>{fmtCompact(p.coins)}</td>
        <td style={{ textAlign: "right" }}>{fmtInt(p.trophies)}</td>
        <td style={{ textAlign: "right" }}>{fmtInt(p.games)}</td>
        <td style={{ textAlign: "right" }}>{fmtInt(p.items)}</td>
        <td style={{ textAlign: "right" }} className="muted admin-sub">{timeAgo(p.lastSeen)}</td>
        <td style={{ textAlign: "right" }} className="muted admin-sub">{p.joinedAt ? fmtDay(p.joinedAt, true) : "—"}</td>
      </tr>
      {open && (
        <tr className="adm-row-detail">
          <td colSpan={8}>
            <div className="adm-detail">
              <div>
                <div className="adm-detail-label">Level {p.level} · {p.band}</div>
                <div className="adm-progress" role="progressbar" aria-valuenow={Math.round(p.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </div>
                <div className="muted admin-sub">{Math.round(p.progress * 100)}% of the way to level {p.level + 1} · {fmtInt(p.xp)} XP</div>
              </div>
              <dl className="adm-dl">
                <div><dt>Coins now</dt><dd>{fmtInt(p.coins)}</dd></div>
                <div><dt>Coins earned, lifetime</dt><dd>{fmtInt(p.lifetimeCoins)}</dd></div>
                <div><dt>Won / played</dt><dd>{fmtInt(p.wins)} / {fmtInt(p.games)}{p.games ? ` (${Math.round((p.wins / p.games) * 100)}%)` : ""}</dd></div>
                <div><dt>Coin events</dt><dd>{fmtInt(p.events)}</dd></div>
                <div><dt>Items owned</dt><dd>{fmtInt(p.items)}</dd></div>
              </dl>
              <a className="adm-link" href={`/players/${p.id}`} target="_blank" rel="noreferrer">Open public profile ↗</a>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
