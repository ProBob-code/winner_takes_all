"use client";

/**
 * A shimmering bar along the top of the screen while any API call is in
 * flight, so a button that sends something, a tab that loads its list or a
 * page that refreshes never looks frozen.
 *
 * It watches window.fetch once for the whole app rather than asking every
 * caller to report in: a call added tomorrow is covered without anyone
 * remembering to. Only calls to the API (paths under /api/) count, and the bar
 * waits a moment before showing, so a quick background poll does not flicker.
 */

import { useEffect, useState } from "react";

const SHOW_AFTER_MS = 250;
let inFlight = 0;
const listeners = new Set<(n: number) => void>();
const emit = () => listeners.forEach((l) => l(inFlight));

function isApiCall(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return /\/api\//.test(url);
  } catch {
    return false;
  }
}

function patchFetch() {
  const w = window as typeof window & { __wtaFetchPatched?: boolean };
  if (w.__wtaFetchPatched) return;
  w.__wtaFetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiCall(input)) return original(input, init);
    inFlight++;
    emit();
    return original(input, init).finally(() => {
      inFlight = Math.max(0, inFlight - 1);
      emit();
    });
  };
}

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
