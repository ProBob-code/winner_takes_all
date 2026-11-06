"use client";

/**
 * Google AdSense, switched on and off from the admin console (AdSense tab).
 *
 * Nothing loads until the API says ads are on and a publisher id is set, so
 * by default this renders nothing and fetches one small JSON file. Pages in
 * the console's "never show ads on" list (live scoring, payments, the big
 * screen, the console itself) never load the script, and if it was already
 * loaded on an earlier page, ads on them are hidden.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

interface AdsConfig {
  enabled: boolean;
  client?: string;
  autoAds?: boolean;
  slots?: Record<string, string>;
  excludePaths?: string[];
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let configPromise: Promise<AdsConfig> | null = null;

function loadConfig(): Promise<AdsConfig> {
  configPromise ??= fetch(`${getApiUrl()}/api/ads/config`)
    .then((r) => r.json())
    .then((d) => (d?.ok ? (d as AdsConfig) : { enabled: false }))
    .catch(() => ({ enabled: false }));
  return configPromise;
}

function excluded(path: string | null, cfg: AdsConfig): boolean {
  if (!path) return true;
  return (cfg.excludePaths ?? []).some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"));
}

function injectScript(client: string) {
  if (document.querySelector("script[data-wta-adsense]")) return;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  s.dataset.wtaAdsense = "1";
  document.head.appendChild(s);
}

function useAdsConfig() {
  const [cfg, setCfg] = useState<AdsConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadConfig().then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

/** Mounted once in the layout: loads the script where ads are allowed. */
export function AdsLoader() {
  const cfg = useAdsConfig();
  const pathname = usePathname();

  useEffect(() => {
    if (!cfg?.enabled || !cfg.client) return;
    const off = excluded(pathname, cfg);
    document.documentElement.toggleAttribute("data-no-ads", off);
    if (!off) injectScript(cfg.client);
  }, [cfg, pathname]);

  if (!cfg?.enabled) return null;
  // Auto ads placed earlier stay in the DOM across client-side navigation.
  return <style>{`html[data-no-ads] .adsbygoogle, html[data-no-ads] .google-auto-placed { display: none !important; }`}</style>;
}

/**
 * A placed ad unit. Renders nothing unless ads are on and the slot has an id.
 * `onlyPath` keeps it to one page when it sits in a layout shared with others
 * (the tournament list, never a live tournament under it).
 */
export function AdSlot({ placement, onlyPath }: { placement: string; onlyPath?: string }) {
  const cfg = useAdsConfig();
  const pathname = usePathname();
  const pushed = useRef(false);
  const slot = cfg?.slots?.[placement];
  const show = !!(
    cfg?.enabled && cfg.client && slot && !excluded(pathname, cfg) && (!onlyPath || pathname === onlyPath)
  );

  useEffect(() => {
    if (!show || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* the ad simply does not fill */
    }
  }, [show]);

  if (!show) return null;
  return (
    <div className="ad-slot" style={{ margin: "1.5rem auto", maxWidth: 970, minHeight: 90, textAlign: "center" }}>
      <div style={{ fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
        Advertisement
      </div>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={cfg!.client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
