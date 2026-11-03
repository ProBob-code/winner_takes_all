"use client";

/**
 * Everything the app does to window.fetch, in one place:
 *
 * 1. A shimmering bar along the top of the screen while any API call is in
 *    flight, so a button that sends something, a tab that loads its list or a
 *    page that refreshes never looks frozen. The bar waits a moment before
 *    showing, so a quick background poll does not flicker.
 *
 * 2. Identical reads share one request. Opening a page used to ask for the
 *    signed-in player's profile three to five times at once (the layout, the
 *    sidebar, the top bar, the page and the signed-in redirect each asked for
 *    it), and that is the heaviest call the API has. Concurrent GETs to the
 *    same URL now ride on the first one, and each caller gets its own copy
 *    of the response. Nothing is served from a cache after it lands, with one
 *    exception: the profile is reused for a few seconds, so a component that
 *    mounts a moment later does not ask again. Any write to the API drops it.
 *
 * Patched once, at import time rather than in an effect: React runs a child's
 * effects before its parent's, so a page's first fetch would otherwise go out
 * before the patch was in place.
 */

import { useEffect, useState } from "react";

const SHOW_AFTER_MS = 250;
const PROFILE_REUSE_MS = 3000;
let inFlight = 0;
const listeners = new Set<(n: number) => void>();
const emit = () => listeners.forEach((l) => l(inFlight));

/** Reads in flight, keyed by URL; and the last profile, briefly. */
const sharedReads = new Map<string, Promise<Response>>();
let profile: { url: string; at: number; response: Response } | null = null;

function urlOf(input: RequestInfo | URL): string {
  try {
    return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  } catch {
    return "";
  }
}

function isApiCall(url: string): boolean {
  return /\/api\//.test(url);
}

/** A plain GET with nothing that makes two calls different from each other. */
function isShareableRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  if (!init) return true;
  const method = (init.method ?? "GET").toUpperCase();
  return method === "GET" && !init.body && !init.signal && init.cache !== "no-store";
}

function patchFetch() {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __wtaFetchPatched?: boolean };
  if (w.__wtaFetchPatched) return;
  w.__wtaFetchPatched = true;
  const original = window.fetch.bind(window);

  const tracked = (input: RequestInfo | URL, init?: RequestInit) => {
    inFlight++;
    emit();
    return original(input, init).finally(() => {
      inFlight = Math.max(0, inFlight - 1);
      emit();
    });
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (!isApiCall(url)) return original(input, init);

    if (!isShareableRead(input, init)) {
      // A write may change what a read would say: start the next one fresh.
      profile = null;
      return tracked(input, init);
    }

    const isProfile = /\/api\/user\/profile(\?|$)/.test(url);
    if (isProfile && profile && profile.url === url && Date.now() - profile.at < PROFILE_REUSE_MS) {
      return Promise.resolve(profile.response.clone());
    }

    let shared = sharedReads.get(url);
    if (!shared) {
      shared = tracked(input, init);
      sharedReads.set(url, shared);
      const settled = shared;
      settled
        .then((res) => {
          if (isProfile && res.ok) profile = { url, at: Date.now(), response: res.clone() };
        })
        .catch(() => undefined)
        .finally(() => {
          if (sharedReads.get(url) === settled) sharedReads.delete(url);
        });
    }
    // Every caller reads its own copy; the shared original is never consumed.
    return shared.then((res) => res.clone());
  };
}

patchFetch();

export function ApiActivity() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    patchFetch();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (n: number) => {
      clearTimeout(timer);
      if (n > 0) timer = setTimeout(() => setBusy(true), SHOW_AFTER_MS);
      else setBusy(false);
    };
    listeners.add(onChange);
    return () => {
      clearTimeout(timer);
      listeners.delete(onChange);
    };
  }, []);

  return <div className={`api-activity${busy ? " is-busy" : ""}`} role="progressbar" aria-hidden={!busy} aria-label="Loading" />;
}
