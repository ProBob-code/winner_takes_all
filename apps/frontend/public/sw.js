/**
 * The service worker that lets a league night survive the bar's wifi.
 *
 * WHAT IT IS FOR
 * Scoring already survives a dropped connection without this: taps are queued
 * in IndexedDB by lib/outbox.ts and replayed when the network returns. But
 * that only helps if the page is still open. A host who reloads, or whose
 * phone kills the tab, gets a browser error page and the night stops. This
 * makes the app itself load with no network.
 *
 * WHY IT IS DELIBERATELY TIMID ABOUT DOCUMENTS
 * This codebase has already lost three rounds to a stale cache: Next served
 * prerendered HTML with `s-maxage=31536000`, so a device that had visited once
 * kept asking for the asset filenames current at that moment, and a deploy
 * that replaced them changed nothing on that phone. A fixed mobile layout and
 * a configured payment gateway both kept rendering as broken for days.
 *
 * A service worker is a far better place to make that mistake again, because
 * it can outlive the cache it was installed with. So:
 *
 *   - Documents are network-first. The cache is a fallback for when the
 *     network fails, never a shortcut for when it is slow.
 *   - The cache name carries the build. A new deploy writes to a new cache and
 *     deletes every older one on activate, so stale HTML cannot survive a
 *     deploy.
 *   - skipWaiting and clients.claim, so a new worker takes over at once rather
 *     than waiting for every tab to close. The usual argument against this is
 *     that a page can end up talking to a newer backend than it was built for;
 *     here, shipping a fix that does not reach the device is the worse
 *     failure, and we have the scars to prove it.
 *   - Nothing under /api is ever cached, read or written. A cached score, a
 *     cached balance or a cached tournament state is worse than no answer.
 */

/**
 * Bumped by the build. Changing this string is what retires every previous
 * cache, so it must change whenever the assets do.
 */
const BUILD = "wta-v1";
const SHELL_CACHE = `${BUILD}-shell`;
const ASSET_CACHE = `${BUILD}-assets`;

/**
 * The pages a night is run from, warmed on install so the first reload with no
 * signal still works. Deliberately short: these are the screens someone is
 * actually holding when the wifi goes, not the whole site.
 */
const SHELL_URLS = ["/", "/offline", "/run"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One at a time and forgiving: a single 404 must not fail the install
      // and leave the app with no worker at all.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Every cache from a previous build goes. This is the line that stops a
      // service worker becoming the next year-long stale document.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !name.startsWith(BUILD)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/** A message from the page, so a deploy can be adopted without a reload. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/sounds/");
}

function isDocument(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && (request.headers.get("accept") || "").includes("text/html"))
  );
}

/**
 * Content-hashed assets are safe to keep forever: a new build gives them new
 * names rather than new contents. Cache-first, and the only place this worker
 * skips the network.
 */
async function assetFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone()).catch(() => undefined);
  return response;
}

/**
 * Documents: always ask the network, fall back to the cache only when it
 * genuinely cannot be reached.
 */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch (err) {
    const hit = (await cache.match(request)) || (await cache.match("/"));
    if (hit) return hit;

    // Nothing cached and no network. Say what has happened, and say the thing
    // the host most needs to know: the scores they have already tapped are
    // safe on this device.
    return new Response(
      `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>No connection</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#030014; color:#fff; font:16px/1.6 system-ui, sans-serif;
         padding:24px; text-align:center }
  h1 { font-size:1.5rem; margin:0 0 .75rem }
  p { color:#9ca3af; max-width:30rem; margin:0 0 1rem }
  button { background:#FFD700; color:#000; border:0; border-radius:10px;
           padding:.8rem 1.4rem; font-weight:700; font-size:1rem }
</style>
<h1>No connection</h1>
<p>This device cannot reach Winner Takes All right now.</p>
<p><strong>Any scores you have already tapped are saved on this phone</strong>
   and will be sent as soon as the connection is back. Nothing has been lost.</p>
<button onclick="location.reload()">Try again</button>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never touch the API. A cached score or balance is worse than no answer,
  // and the outbox already handles writes that cannot go through.
  if (url.pathname.startsWith("/api/")) return;

  // Another origin's problem: the fonts, the Razorpay checkout script.
  if (url.origin !== self.location.origin) return;

  if (isAsset(url)) {
    event.respondWith(assetFirst(request));
    return;
  }

  if (isDocument(request)) {
    event.respondWith(networkFirst(request));
  }
});
