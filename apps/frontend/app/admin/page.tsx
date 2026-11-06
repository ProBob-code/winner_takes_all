"use client";

export const dynamic = "force-dynamic";

/**
 * The admin console.
 *
 * Private to one owner (Bob, by his Google account) and whoever he lets in,
 * always on a Google sign-in. The API decides that (lib/admin-access.ts on the
 * Worker); this page only asks /admin/me and shows the locked screen or the
 * console to match. Nothing here is a security boundary on its own.
 */

import { useCallback, useEffect, useState } from "react";
import "@/components/admin/admin.css";
import { GoogleButton } from "@/components/google-button";
import { PageSkeleton } from "@/components/skeleton";
import { ErrorNote, Loading, Segmented, getJson, timeAgo, useLoad } from "@/components/admin/ui";
import { GamesTab, LoginsTab, OverviewTab } from "@/components/admin/stats-tabs";
import { PlayersTab } from "@/components/admin/players-tab";
import { AdsenseTab, RevenueTab } from "@/components/admin/money-tabs";
import { ArtifactsTab } from "@/components/admin/artifacts-tab";
import { AccessTab } from "@/components/admin/access-tab";
import { Operations } from "@/components/admin/operations";

type Tab = "overview" | "players" | "games" | "logins" | "revenue" | "adsense" | "artifacts" | "access" | "operations";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◎" },
  { id: "players", label: "Players & levels", icon: "★" },
  { id: "games", label: "Games", icon: "◆" },
  { id: "logins", label: "Logins", icon: "↪" },
  { id: "revenue", label: "Revenue", icon: "₹" },
  { id: "adsense", label: "AdSense", icon: "▣" },
  { id: "artifacts", label: "Artifacts", icon: "✦" },
  { id: "access", label: "Access", icon: "🔒" },
  { id: "operations", label: "Operations", icon: "⚙" },
];

const RANGES = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "1y" },
];

function readTab(): Tab {
  if (typeof window === "undefined") return "overview";
  const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
  return t && TABS.some((x) => x.id === t) ? t : "overview";
}

export default function AdminPage() {
  const me = useLoad<any>("/admin/me");

  if (me.loading && !me.data) return <PageSkeleton variant="detail" label="Opening the control room" />;
  if (me.error) {
    return (
      <main className="page adm">
        <div className="shell">
          <ErrorNote message={me.error} onRetry={me.reload} />
        </div>
      </main>
    );
  }
  if (!me.data?.isAdmin) return <Locked me={me.data} onSignedIn={me.reload} />;
  return <Console me={me.data} />;
}

function Locked({ me, onSignedIn }: { me: any; onSignedIn: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const reason: string = me?.reason ?? "signed-out";

  const copy: Record<string, { title: string; body: string; google: boolean }> = {
    "signed-out": {
      title: "Admin sign-in",
      body: "The control room opens with a Google account that has admin access. Sign in with Google to continue.",
      google: true,
    },
    "needs-google": {
      title: "Sign in with Google",
      body: "This account has admin access, but this session was opened with a password. Admin needs a Google sign-in.",
      google: true,
    },
    "not-eligible": {
      title: "This area is private",
      body: "The control room is only open to the platform owner and the people the owner has let in.",
      google: false,
    },
  };
  const c = copy[reason] ?? copy["not-eligible"];

  return (
    <main className="page adm">
      <div className="shell">
        <div className="adm-locked">
          <div className="adm-locked-icon" aria-hidden>🔒</div>
          <h1>{c.title}</h1>
          <p>{c.body}</p>
          {me?.user && (
            <p className="muted admin-sub">
              Signed in as {me.user.email}
              {me.via ? ` (${me.via === "google" ? "Google" : "password"})` : ""}
            </p>
          )}
          {c.google && (
            <div className="adm-locked-google">
              <GoogleButton mode="login" onSignedIn={onSignedIn} onError={setErr} divider={false} />
            </div>
          )}
          {err && <div className="adm-error">{err}</div>}
          {me && !me.ownerConfigured && (
            <p className="adm-warn">The owner account is not configured on the server yet (ADMIN_OWNER_EMAIL).</p>
          )}
        </div>
      </div>
    </main>
  );
}

function Console({ me }: { me: any }) {
  const [tab, setTabState] = useState<Tab>("overview");
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<any>(null);
  const [levels, setLevels] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const [, force] = useState(0);

  useEffect(() => setTabState(readTab()), []);

  const setTab = (t: string) => {
    setTabState(t as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, l, r] = await Promise.all([
        getJson(`/admin/stats?days=${days}`),
        getJson(`/admin/levels`),
        getJson(`/admin/revenue?days=${days}`),
      ]);
      setStats(s);
      setLevels(l);
      setRevenue(r);
      setError(null);
      setUpdated(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || "Could not load the figures.");
    } finally {
      setBusy(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Live mode: refresh every minute while the tab is visible.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(id);
  }, [live, load]);

  // Keeps "updated 2m ago" honest.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const usesRange = ["overview", "games", "logins", "revenue"].includes(tab);

  return (
    <main className="page adm">
      <div className="shell">
        <header className="adm-head">
          <div>
            <h1 className="glow-text">Control Room</h1>
            <p className="muted">
              {me.isOwner ? "Owner" : "Admin"} · {me.user?.name} · signed in with Google
            </p>
          </div>
          <div className="adm-head-tools">
            {usesRange && (
              <Segmented label="Date range" value={days} onChange={setDays} options={RANGES} />
            )}
            <label className="adm-live" title="Refresh every minute">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span className={`adm-live-dot ${live ? "on" : ""}`} /> Live
            </label>
            <button type="button" className="button-secondary button-sm" onClick={load} disabled={busy}>
              {busy ? "Refreshing…" : "Refresh"}
            </button>
            {updated && <span className="muted admin-sub">updated {timeAgo(updated)}</span>}
          </div>
        </header>

        <nav className="adm-tabs" aria-label="Console sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`adm-tab ${tab === t.id ? "on" : ""}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <span aria-hidden className="adm-tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {error && <ErrorNote message={error} onRetry={load} />}

        <div className={`adm-body ${busy && stats ? "is-busy" : ""}`}>
          {tab === "overview" && (stats ? <OverviewTab stats={stats} levels={levels} revenue={revenue} go={setTab} /> : <Loading />)}
          {tab === "players" && (levels ? <PlayersTab levels={levels} /> : <Loading />)}
          {tab === "games" && (stats ? <GamesTab stats={stats} /> : <Loading />)}
          {tab === "logins" && (stats ? <LoginsTab stats={stats} /> : <Loading />)}
          {tab === "revenue" && (revenue ? <RevenueTab revenue={revenue} go={setTab} /> : <Loading />)}
          {tab === "adsense" && <AdsenseTab onSaved={load} />}
          {tab === "artifacts" && <ArtifactsTab />}
          {tab === "access" && <AccessTab me={me} />}
          {tab === "operations" && <Operations isOwner={!!me.isOwner} />}
        </div>
      </div>
    </main>
  );
}
