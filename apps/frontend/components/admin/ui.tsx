"use client";

import { useEffect, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { Sparkline } from "./charts";

// ── Talking to the API ──

export async function getJson<T = any>(path: string): Promise<T> {
  const res = await backendFetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const err: any = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.reason = data?.reason;
    throw err;
  }
  return data;
}

export async function sendJson<T = any>(path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await backendFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

/** Load something, with loading and error state, and a reload. */
export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    getJson<T>(path)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e?.message || "Could not load"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

// ── Formatting ──

const INT = new Intl.NumberFormat("en-IN");
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const fmtInt = (n: number | string | null | undefined) => INT.format(Number(n) || 0);
export const fmtINR = (n: number | string | null | undefined, exact = false) =>
  (exact ? INR2 : INR).format(Number(n) || 0);

/** 12,40,000 reads long on a tile: 12.4L, 3.2K, 1.1Cr. */
export function fmtCompact(n: number): string {
  const v = Math.abs(n);
  if (v >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (v >= 1e5) return `${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return fmtInt(n);
}

export function fmtDay(d: string, withYear = false): string {
  const date = new Date(d.length === 10 ? d + "T00:00:00Z" : d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function fmtMonth(m: string): string {
  const date = new Date(m + "-01T00:00:00Z");
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Pieces ──

export function Kpi({
  label,
  value,
  sub,
  trend,
  spark,
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  /** Change against the previous period, as a fraction. */
  trend?: number | null;
  spark?: number[];
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`adm-kpi ${onClick ? "is-link" : ""} ${active ? "is-active" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      <div className="adm-kpi-foot">
        {trend !== undefined && trend !== null && Number.isFinite(trend) && (
          <span className={`adm-trend ${trend > 0 ? "up" : trend < 0 ? "down" : ""}`}>
            {trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(Math.round(trend * 100))}%
          </span>
        )}
        {sub && <span className="adm-kpi-sub">{sub}</span>}
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </Tag>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="adm-section">
      <header className="adm-section-head">
        <div>
          <h3>{title}</h3>
          {hint && <p className="adm-hint">{hint}</p>}
        </div>
        {actions && <div className="adm-section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="adm-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="adm-loading" aria-busy="true">
      <span className="adm-spinner" /> {label}…
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="adm-error">
      {message}
      {onRetry && (
        <button type="button" className="adm-link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Sum of a series over the first and second halves, as a change. */
export function halfTrend(values: number[]): number | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const a = values.slice(0, mid).reduce((s, v) => s + v, 0);
  const b = values.slice(mid).reduce((s, v) => s + v, 0);
  // From a base this small a percentage is noise ("+1133%"), not a trend.
  if (a < 10) return null;
  return (b - a) / a;
}

/** Download rows as a CSV file. */
export function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
