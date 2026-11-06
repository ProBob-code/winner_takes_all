"use client";

import { useEffect, useState } from "react";
import { ShareBar, TimeChart } from "./charts";
import { Empty, ErrorNote, Kpi, Loading, Section, downloadCsv, fmtCompact, fmtINR, fmtInt, fmtMonth, sendJson, timeAgo, useLoad } from "./ui";
import type { Revenue } from "./stats-tabs";

const toNum = (rows: any[], keys: string[]) =>
  rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k]) || 0])) }));

const inr = (n: number) => fmtINR(n);

// ── Revenue ──

export function RevenueTab({ revenue, go }: { revenue: Revenue; go: (tab: string) => void }) {
  const r = revenue;
  const daily = toNum(r.daily, ["fees", "subscriptions", "deposits"]);
  const monthly = toNum(
    r.monthly.map((m: any) => ({ ...m, d: m.month })),
    ["subscriptions", "adsense", "fees", "deposits"]
  );
  const coinsSpentShare = r.coins.minted ? r.coins.spentInShop / r.coins.minted : 0;

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <Kpi label={`Revenue · ${r.range.days}d`} value={fmtINR(r.revenue.inRange)} sub="what the platform kept" spark={daily.map((d) => d.fees + d.subscriptions)} />
        <Kpi label="Revenue · all time" value={fmtINR(r.revenue.total)} />
        <Kpi label="Recurring per month" value={fmtINR(r.revenue.mrr)} sub={`${fmtInt(r.revenue.payingSubscriptions)} paying subscriptions`} />
        <Kpi
          label={`Deposits · ${r.range.days}d`}
          value={fmtINR(r.deposits.inRange)}
          sub={`${fmtInt(r.deposits.countInRange)} payments · players' money, not revenue`}
          spark={daily.map((d) => d.deposits)}
        />
        <Kpi label="Held for members" value={fmtINR(r.held.balances)} sub={`${fmtINR(r.held.bonus)} of it bonus credit`} />
      </div>

      <div className="adm-grid-2">
        <Section title="Revenue by source" hint={`Last ${r.range.days} days. Hover a part for its share.`}>
          <ShareBar
            parts={r.revenue.sources.map((s: any, i: number) => ({ key: s.id, label: s.label, value: Number(s.inRange), slot: (i + 1) as 1 | 2 | 3 }))}
            format={inr}
          />
          <div className="adm-table-wrap">
            <table className="admin-table adm-compact">
              <thead>
                <tr><th>Source</th><th style={{ textAlign: "right" }}>In range</th><th style={{ textAlign: "right" }}>All time</th></tr>
              </thead>
              <tbody>
                {r.revenue.sources.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      {s.id === "adsense" ? (
                        <button className="adm-link" onClick={() => go("adsense")}>{s.label} →</button>
                      ) : (
                        s.label
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtINR(s.inRange, true)}</td>
                    <td style={{ textAlign: "right" }}>{fmtINR(s.total, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Revenue per day" hint="Subscription charges and payout fees, by the day they landed. AdSense is monthly, below.">
          <TimeChart
            title="Revenue per day"
            data={daily}
            series={[
              { key: "subscriptions", label: "Subscriptions", slot: 1 },
              { key: "fees", label: "Payout fees", slot: 3 },
            ]}
            mode="stacked"
            format={fmtCompact}
          />
        </Section>
      </div>

      <Section
        title="Month by month"
        hint="Revenue from every source, stacked, for the last two years."
        actions={<button className="adm-link" onClick={() => downloadCsv("wta-revenue-monthly", r.monthly)}>Export CSV</button>}
      >
        {monthly.length ? (
          <TimeChart
            title="Revenue per month by source"
            data={monthly}
            series={[
              { key: "subscriptions", label: "Subscriptions", slot: 1 },
              { key: "adsense", label: "AdSense", slot: 2 },
              { key: "fees", label: "Payout fees", slot: 3 },
            ]}
            mode="stacked"
            xLabel={fmtMonth}
            format={fmtCompact}
          />
        ) : (
          <Empty>No revenue recorded yet.</Empty>
        )}
      </Section>

      <div className="adm-grid-2">
        <Section title="Deposits per day" hint="Money players put into wallets. It belongs to them until spent, so it is not counted as revenue.">
          <TimeChart title="Deposits per day" data={daily} series={[{ key: "deposits", label: "Deposits", slot: 4 }]} mode="lines" format={fmtCompact} />
        </Section>
        <Section title="WTA Coin economy" hint="Coins are not money: they cannot be bought or cashed out.">
          <div className="adm-kpis adm-kpis-tight">
            <Kpi label="Coins in circulation" value={fmtCompact(r.coins.circulating)} />
            <Kpi label="Coins ever earned" value={fmtCompact(r.coins.minted)} />
            <Kpi label="Spent in the shop" value={fmtCompact(r.coins.spentInShop)} sub={`${Math.round(coinsSpentShare * 100)}% of all coins earned`} />
          </div>
        </Section>
      </div>
    </div>
  );
}

// ── AdSense ──

export function AdsenseTab({ onSaved }: { onSaved: () => void }) {
  const { data, error, loading, reload } = useLoad<any>("/admin/adsense");
  const [form, setForm] = useState<any>(null);
  const [entry, setEntry] = useState({ month: new Date().toISOString().slice(0, 7), amount: "", impressions: "", clicks: "", pageViews: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.settings) setForm({ ...data.settings, excludeText: (data.settings.excludePaths ?? []).join("\n") });
  }, [data]);

  if (loading && !data) return <Loading label="Loading AdSense" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data || !form) return null;

  const months: any[] = data.months;
  const total = months.reduce((s, m) => s + Number(m.amount), 0);
  const imps = months.reduce((s, m) => s + m.impressions, 0);
  const clicks = months.reduce((s, m) => s + m.clicks, 0);
  const views = months.reduce((s, m) => s + m.pageViews, 0);
  const rpm = views ? (total / views) * 1000 : 0;
  const ctr = imps ? clicks / imps : 0;
  const s = data.settings;
  const live = s.enabled && s.client;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      reload();
      onSaved();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "That did not work." });
    } finally {
      setBusy(false);
    }
  }

  const checklist = [
    { done: !!s.client, text: "Publisher id saved (ca-pub-…)" },
    { done: !!s.client, text: "ads.txt served at winnertakesall.live/ads.txt (automatic once the id is saved)" },
    { done: true, text: "Privacy policy page published (/privacy)" },
    { done: s.enabled, text: "Ads switched on for the site" },
    { done: months.length > 0, text: "First month of earnings entered from the AdSense report" },
  ];

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        <Kpi label="Status" value={live ? "Live" : "Off"} sub={live ? (s.autoAds ? "Auto ads on" : "Placed units only") : "Ads are not shown"} />
        <Kpi label="AdSense earnings" value={fmtINR(total)} sub={`${months.length} month${months.length === 1 ? "" : "s"} recorded`} spark={[...months].reverse().map((m) => Number(m.amount))} />
        <Kpi label="Page RPM" value={fmtINR(rpm, true)} sub="earnings per 1,000 page views" />
        <Kpi label="Click-through" value={`${(ctr * 100).toFixed(2)}%`} sub={`${fmtInt(clicks)} clicks / ${fmtInt(imps)} impressions`} />
      </div>

      {msg && <div className={msg.ok ? "adm-ok" : "adm-error"}>{msg.text}</div>}

      <div className="adm-grid-2">
        <Section
          title="Site setup"
          hint={data.canEdit ? "Switching ads on changes the public site, so only the owner can." : "Only the owner can change these."}
        >
          <fieldset disabled={!data.canEdit || busy} className="adm-form">
            <label className="adm-switch">
              <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span>Show ads on the site</span>
            </label>
            <label className="adm-switch">
              <input type="checkbox" checked={!!form.autoAds} onChange={(e) => setForm({ ...form, autoAds: e.target.checked })} />
              <span>Auto ads (Google chooses where)</span>
            </label>
            <label>
              <span>Publisher id</span>
              <input className="premium-input-v2" placeholder="ca-pub-1234567890123456" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </label>
            <div className="adm-form-row">
              {data.placements.map((p: string) => (
                <label key={p}>
                  <span>{p} slot id</span>
                  <input
                    className="premium-input-v2"
                    inputMode="numeric"
                    placeholder="optional"
                    value={form.slots?.[p] ?? ""}
                    onChange={(e) => setForm({ ...form, slots: { ...form.slots, [p]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
            <label>
              <span>Never show ads on (one path per line)</span>
              <textarea className="premium-input-v2" rows={4} value={form.excludeText} onChange={(e) => setForm({ ...form, excludeText: e.target.value })} />
            </label>
            {data.canEdit && (
              <button
                className="button button-sm"
                type="button"
                onClick={() =>
                  run(
                    () =>
                      sendJson("/admin/adsense/settings", {
                        enabled: !!form.enabled,
                        autoAds: !!form.autoAds,
                        client: form.client,
                        slots: form.slots ?? {},
                        excludePaths: String(form.excludeText).split(/\s+/).filter(Boolean),
                      }),
                    "AdSense settings saved."
                  )
                }
              >
                Save settings
              </button>
            )}
          </fieldset>
        </Section>

        <Section title="Getting approved" hint="What Google checks before it serves ads.">
          <ul className="adm-checklist">
            {checklist.map((c) => (
              <li key={c.text} className={c.done ? "done" : ""}>
                <span aria-hidden>{c.done ? "✓" : "○"}</span>
                {c.text}
              </li>
            ))}
          </ul>
          <p className="adm-hint">
            Ads never load on the pages listed in “Never show ads on”: live scoring, payments, the big screen and this console
            are excluded by default.
          </p>
        </Section>
      </div>

      <div className="adm-grid-2">
        <Section title="Add a month's earnings" hint="Copy the figures from AdSense → Reports for the month. Saving a month again replaces it.">
          <div className="adm-form">
            <div className="adm-form-row">
              <label>
                <span>Month</span>
                <input className="premium-input-v2" type="month" value={entry.month} onChange={(e) => setEntry({ ...entry, month: e.target.value })} />
              </label>
              <label>
                <span>Earnings (₹)</span>
                <input className="premium-input-v2" inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} placeholder="0.00" />
              </label>
              <label>
                <span>Page views</span>
                <input className="premium-input-v2" inputMode="numeric" value={entry.pageViews} onChange={(e) => setEntry({ ...entry, pageViews: e.target.value })} />
              </label>
              <label>
                <span>Impressions</span>
                <input className="premium-input-v2" inputMode="numeric" value={entry.impressions} onChange={(e) => setEntry({ ...entry, impressions: e.target.value })} />
              </label>
              <label>
                <span>Clicks</span>
                <input className="premium-input-v2" inputMode="numeric" value={entry.clicks} onChange={(e) => setEntry({ ...entry, clicks: e.target.value })} />
              </label>
            </div>
            <label>
              <span>Note</span>
              <input className="premium-input-v2" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} placeholder="optional" />
            </label>
            <button
              className="button button-sm"
              type="button"
              disabled={busy || entry.amount === ""}
              onClick={() => run(() => sendJson("/admin/adsense/earnings", { ...entry, amount: Number(entry.amount) }), `Saved ${entry.month}.`)}
            >
              Save month
            </button>
          </div>
        </Section>

        <Section title="Earnings by month">
          {months.length ? (
            <>
              <TimeChart
                title="AdSense earnings per month"
                data={[...months].reverse().map((m) => ({ d: m.month, amount: Number(m.amount) }))}
                series={[{ key: "amount", label: "Earnings", slot: 2 }]}
                mode="stacked"
                xLabel={fmtMonth}
                format={fmtCompact}
                height={180}
              />
              <div className="adm-table-wrap">
                <table className="admin-table adm-compact">
                  <thead>
                    <tr>
                      <th>Month</th><th style={{ textAlign: "right" }}>Earnings</th><th style={{ textAlign: "right" }}>RPM</th>
                      <th style={{ textAlign: "right" }}>CTR</th><th>Updated</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.month}>
                        <td>{fmtMonth(m.month)}</td>
                        <td style={{ textAlign: "right" }}>{fmtINR(m.amount, true)}</td>
                        <td style={{ textAlign: "right" }}>{m.pageViews ? fmtINR((Number(m.amount) / m.pageViews) * 1000, true) : "—"}</td>
                        <td style={{ textAlign: "right" }}>{m.impressions ? `${((m.clicks / m.impressions) * 100).toFixed(2)}%` : "—"}</td>
                        <td className="muted admin-sub">{timeAgo(m.updatedAt)}</td>
                        <td>
                          <button
                            className="adm-link adm-danger"
                            disabled={busy}
                            onClick={() =>
                              confirm(`Delete the ${m.month} figures?`) &&
                              run(() => sendJson(`/admin/adsense/earnings/${m.month}`, undefined, "DELETE"), `Deleted ${m.month}.`)
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Empty>No months entered yet.</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}
