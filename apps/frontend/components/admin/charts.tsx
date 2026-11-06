"use client";

/**
 * Hand-built SVG charts for the admin console. No chart library: the app ships
 * none, and these four shapes are all the console needs.
 *
 * Colour comes from the --s1..--s4 tokens in admin.css: the reference
 * categorical palette, slots in fixed order, a light and a dark step of each.
 * A series keeps its slot when others are hidden, so colour follows the
 * entity. Every chart has a hover/keyboard tooltip and a table view.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type Slot = 1 | 2 | 3 | 4 | 5 | 6;
export const slotVar = (slot: Slot) => `var(--s${slot})`;

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** A round axis maximum: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function compact(n: number): string {
  const v = Math.abs(n);
  if (v >= 1e7) return `${+(n / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${+(n / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n * 100) / 100);
}

/** Path for a bar whose top two corners are rounded. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (rr === 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface SeriesDef {
  key: string;
  label: string;
  slot: Slot;
}

function Legend({
  series,
  hidden,
  onToggle,
}: {
  series: SeriesDef[];
  hidden: Set<string>;
  onToggle?: (key: string) => void;
}) {
  if (series.length < 2) return null;
  return (
    <div className="adm-legend">
      {series.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`adm-legend-item ${hidden.has(s.key) ? "off" : ""}`}
          onClick={() => onToggle?.(s.key)}
          aria-pressed={!hidden.has(s.key)}
          title={onToggle ? "Show or hide" : undefined}
        >
          <span className="adm-swatch" style={{ background: slotVar(s.slot) }} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ViewToggle({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <button type="button" className="adm-link adm-viewtoggle" onClick={() => setTable(!table)}>
      {table ? "Show chart" : "Show table"}
    </button>
  );
}

/** Long ranges fold into weeks so a bar is never thinner than a hairline. */
function foldWeeks(rows: Array<Record<string, any>>, keys: string[]) {
  if (rows.length <= 120) return { rows, folded: false };
  const out: Array<Record<string, any>> = [];
  for (let i = 0; i < rows.length; i += 7) {
    const chunk = rows.slice(i, i + 7);
    const r: Record<string, any> = { d: chunk[0].d, to: chunk[chunk.length - 1].d };
    for (const k of keys) r[k] = chunk.reduce((s, c) => s + (Number(c[k]) || 0), 0);
    out.push(r);
  }
  return { rows: out, folded: true };
}

/**
 * Change over time: stacked columns (parts of a whole per day) or lines
 * (independent measures). One y-axis, always.
 */
export function TimeChart({
  data,
  series,
  mode = "stacked",
  height = 220,
  format = compact,
  xLabel,
  title,
}: {
  data: Array<Record<string, any>>;
  series: SeriesDef[];
  mode?: "stacked" | "lines";
  height?: number;
  format?: (n: number) => string;
  xLabel?: (d: string) => string;
  title: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const keys = series.map((s) => s.key);
  const { rows, folded } = useMemo(() => foldWeeks(data.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k]) || 0])) })), keys), [data, keys.join()]);
  const shown = series.filter((s) => !hidden.has(s.key));

  const m = { l: 44, r: 10, t: 10, b: 24 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const n = Math.max(1, rows.length);
  const step = iw / n;

  const totals = rows.map((r) => shown.reduce((s, x) => s + r[x.key], 0));
  const peak = mode === "stacked" ? Math.max(0, ...totals) : Math.max(0, ...rows.flatMap((r) => shown.map((s) => r[s.key])));
  const yMax = niceMax(peak);
  const y = (v: number) => m.t + ih - (v / yMax) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  const gap = step > 6 ? 2 : step > 3 ? 1 : 0;
  const bw = Math.max(1, step - gap);
  const label = xLabel ?? ((d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));

  const toggle = (k: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.has(k) ? next.delete(k) : next.add(k);
      if (next.size === series.length) return h; // never hide everything
      return next;
    });

  function pick(clientX: number, svg: SVGSVGElement) {
    const box = svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * width - m.l;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(x / step))));
  }

  const hr = hover !== null ? rows[hover] : null;
  const tipLeft = hover !== null ? m.l + hover * step + step / 2 : 0;

  return (
    <div className="adm-chart" ref={ref}>
      <div className="adm-chart-bar">
        <Legend series={series} hidden={hidden} onToggle={toggle} />
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <div className="adm-table-wrap adm-chart-table">
          <table className="admin-table adm-compact">
            <thead>
              <tr>
                <th>{folded ? "Week of" : "Day"}</th>
                {series.map((s) => <th key={s.key} style={{ textAlign: "right" }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.d}>
                  <td>{label(r.d)}</td>
                  {series.map((s) => <td key={s.key} style={{ textAlign: "right" }}>{format(r[s.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="adm-plot" style={{ height }}>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={title}
            tabIndex={0}
            onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
            onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget)}
            onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget)}
            onMouseLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
              if (e.key === "Escape") setHover(null);
            }}
          >
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className={i === 0 ? "adm-axis" : "adm-grid"} />
                <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="adm-tick">{format(t)}</text>
              </g>
            ))}
            {rows.map((r, i) =>
              i % labelEvery === 0 ? (
                <text key={r.d} x={m.l + i * step + step / 2} y={height - 6} textAnchor="middle" className="adm-tick">
                  {label(r.d)}
                </text>
              ) : null
            )}

            {hover !== null && (
              <rect x={m.l + hover * step} y={m.t} width={step} height={ih} className="adm-hoverband" />
            )}

            {mode === "stacked" &&
              rows.map((r, i) => {
                let acc = 0;
                const x = m.l + i * step + gap / 2;
                const segs = shown.filter((s) => r[s.key] > 0);
                return (
                  <g key={r.d} opacity={hover === null || hover === i ? 1 : 0.55}>
                    {segs.map((s, j) => {
                      const v = r[s.key];
                      const y0 = y(acc);
                      acc += v;
                      const y1 = y(acc);
                      const h = Math.max(0, y0 - y1 - (j < segs.length - 1 && gap ? 1 : 0));
                      const isTop = j === segs.length - 1;
                      return isTop ? (
                        <path key={s.key} d={topRounded(x, y1, bw, Math.max(h, 1), 4)} fill={slotVar(s.slot)} />
                      ) : (
                        <rect key={s.key} x={x} y={y1 + (gap ? 1 : 0)} width={bw} height={h} fill={slotVar(s.slot)} />
                      );
                    })}
                  </g>
                );
              })}

            {mode === "lines" &&
              shown.map((s) => {
                const pts = rows.map((r, i) => [m.l + i * step + step / 2, y(r[s.key])] as const);
                const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join("");
                return (
                  <g key={s.key}>
                    {shown.length === 1 && (
                      <path d={`${d}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z`} fill={slotVar(s.slot)} opacity={0.12} />
                    )}
                    <path d={d} fill="none" stroke={slotVar(s.slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {hover !== null && (
                      <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4.5} fill={slotVar(s.slot)} className="adm-dot" />
                    )}
                  </g>
                );
              })}

            {hover !== null && mode === "lines" && (
              <line x1={tipLeft} x2={tipLeft} y1={m.t} y2={m.t + ih} className="adm-crosshair" />
            )}
          </svg>

          {hr && (
            <div
              className="adm-tooltip"
              style={{ left: Math.min(Math.max(tipLeft, 80), width - 80) }}
              role="status"
            >
              <div className="adm-tooltip-title">
                {folded ? `${label(hr.d)} – ${label(hr.to)}` : label(hr.d)}
              </div>
              {[...shown].reverse().map((s) => (
                <div key={s.key} className="adm-tooltip-row">
                  <span className="adm-swatch" style={{ background: slotVar(s.slot) }} />
                  <span>{s.label}</span>
                  <b>{format(hr[s.key])}</b>
                </div>
              ))}
              {mode === "stacked" && shown.length > 1 && (
                <div className="adm-tooltip-row adm-tooltip-total">
                  <span />
                  <span>Total</span>
                  <b>{format(shown.reduce((s, x) => s + hr[x.key], 0))}</b>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Magnitude across categories, vertical columns. One series, one hue. */
export function ColumnChart({
  data,
  slot = 1,
  height = 200,
  title,
  format = compact,
  xTitle,
  onPick,
  active,
}: {
  data: Array<{ label: string; value: number; key?: string; tip?: string }>;
  slot?: Slot;
  height?: number;
  title: string;
  format?: (n: number) => string;
  xTitle?: string;
  onPick?: (key: string) => void;
  active?: string | null;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const m = { l: 36, r: 8, t: 10, b: xTitle ? 38 : 24 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const n = Math.max(1, data.length);
  const step = iw / n;
  const yMax = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const y = (v: number) => m.t + ih - (v / yMax) * ih;
  const gap = step > 6 ? 2 : 1;
  const bw = Math.max(1, Math.min(48, step - gap));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 34))));
  const hd = hover !== null ? data[hover] : null;

  return (
    <div className="adm-chart" ref={ref}>
      <div className="adm-chart-bar">
        <span />
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <div className="adm-table-wrap adm-chart-table">
          <table className="admin-table adm-compact">
            <thead><tr><th>{xTitle ?? "Group"}</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key ?? d.label}><td>{d.label}</td><td style={{ textAlign: "right" }}>{format(d.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="adm-plot" style={{ height }}>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={title}
            tabIndex={0}
            onMouseLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
              if (e.key === "Enter" && hover !== null && onPick) onPick(data[hover].key ?? data[hover].label);
            }}
          >
            {[0, 0.5, 1].map((f, i) => (
              <g key={i}>
                <line x1={m.l} x2={width - m.r} y1={y(f * yMax)} y2={y(f * yMax)} className={i === 0 ? "adm-axis" : "adm-grid"} />
                <text x={m.l - 6} y={y(f * yMax)} dy="0.32em" textAnchor="end" className="adm-tick">{format(f * yMax)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = m.l + i * step + (step - bw) / 2;
              const key = d.key ?? d.label;
              const dim = (active && active !== key) || (hover !== null && hover !== i);
              return (
                <g key={key}>
                  {d.value > 0 && (
                    <path
                      d={topRounded(x, y(d.value), bw, Math.max(1, y(0) - y(d.value)), 4)}
                      fill={slotVar(slot)}
                      opacity={dim ? 0.45 : 1}
                    />
                  )}
                  {/* The hit target is the whole column, taller than the mark. */}
                  <rect
                    x={m.l + i * step}
                    y={m.t}
                    width={step}
                    height={ih}
                    fill="transparent"
                    style={{ cursor: onPick ? "pointer" : "default" }}
                    onMouseEnter={() => setHover(i)}
                    onClick={() => onPick?.(key)}
                  />
                  {i % labelEvery === 0 && (
                    <text x={m.l + i * step + step / 2} y={m.t + ih + 15} textAnchor="middle" className="adm-tick">{d.label}</text>
                  )}
                </g>
              );
            })}
            {xTitle && (
              <text x={m.l + iw / 2} y={height - 4} textAnchor="middle" className="adm-tick adm-axis-title">{xTitle}</text>
            )}
          </svg>
          {hd && (
            <div
              className="adm-tooltip"
              style={{ left: Math.min(Math.max(m.l + hover! * step + step / 2, 70), width - 70) }}
              role="status"
            >
              <div className="adm-tooltip-title">{hd.tip ?? hd.label}</div>
              <div className="adm-tooltip-row">
                <span className="adm-swatch" style={{ background: slotVar(slot) }} />
                <span>Value</span>
                <b>{format(hd.value)}</b>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ranked magnitudes as horizontal bars, in HTML so labels wrap on a phone. */
export function BarList({
  rows,
  slot = 1,
  format = compact,
  onPick,
  active,
}: {
  rows: Array<{ key: string; label: string; value: number; sub?: string; slot?: Slot }>;
  slot?: Slot;
  format?: (n: number) => string;
  onPick?: (key: string) => void;
  active?: string | null;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="adm-barlist">
      {rows.map((r) => {
        const Tag = onPick ? "button" : "div";
        return (
          <li key={r.key}>
            <Tag
              className={`adm-barlist-row ${active === r.key ? "is-active" : ""} ${active && active !== r.key ? "is-dim" : ""}`}
              onClick={onPick ? () => onPick(r.key) : undefined}
              type={onPick ? "button" : undefined}
              title={`${r.label}: ${format(r.value)}`}
            >
              <span className="adm-barlist-label">
                {r.label}
                {r.sub && <small>{r.sub}</small>}
              </span>
              <span className="adm-barlist-track">
                <span className="adm-barlist-fill" style={{ width: `${(r.value / max) * 100}%`, background: slotVar(r.slot ?? slot) }} />
              </span>
              <span className="adm-barlist-value">{format(r.value)}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/** Parts of one whole, as a single segmented bar with a legend under it. */
export function ShareBar({
  parts,
  format = compact,
}: {
  parts: Array<{ key: string; label: string; value: number; slot: Slot }>;
  format?: (n: number) => string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="adm-share">
      <div className="adm-share-bar" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)}`).join(", ")}>
        {total === 0 ? (
          <span className="adm-share-empty" />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span
                key={p.key}
                className={hover && hover !== p.key ? "dim" : ""}
                style={{ flexGrow: p.value, background: slotVar(p.slot) }}
                onMouseEnter={() => setHover(p.key)}
                onMouseLeave={() => setHover(null)}
                title={`${p.label}: ${format(p.value)} (${Math.round((p.value / total) * 100)}%)`}
              />
            ))
        )}
      </div>
      <div className="adm-share-legend">
        {parts.map((p) => (
          <div
            key={p.key}
            className={`adm-share-item ${hover === p.key ? "on" : ""}`}
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="adm-swatch" style={{ background: slotVar(p.slot) }} />
            <span>{p.label}</span>
            <b>{format(p.value)}</b>
            <small>{total ? `${Math.round((p.value / total) * 100)}%` : "—"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A tile's tiny trend line. Decorative: the tile states the number. */
export function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join("");
  return (
    <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${d}L${w},${h}L0,${h}Z`} className="adm-spark-area" />
      <path d={d} className="adm-spark-line" />
    </svg>
  );
}
